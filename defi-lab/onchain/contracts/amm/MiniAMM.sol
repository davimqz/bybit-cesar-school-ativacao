// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MiniAMM — pool de liquidez com produto constante (x * y = k)
/// @notice Versao didatica do Uniswap V2. O preco nao e definido por ninguem:
///         nasce da razao entre as reservas e desliza pela curva a cada swap.
/// @dev O contrato e tambem o token de LP: quem deposita recebe shares (ERC-20)
///      que representam sua fatia do caixa coletivo + das taxas acumuladas.
contract MiniAMM is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Taxa cobrada de cada swap, em basis points (30 = 0,30%).
    /// @dev A taxa nao sai do pool: fica dentro das reservas. Por isso o valor
    ///      da share de cada LP cresce sozinho conforme a turma negocia.
    uint256 public constant FEE_BPS = 30;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Shares queimadas na primeira adicao de liquidez. Impede que o pool
    ///      volte a ter totalSupply zero e bloqueia o ataque de inflacao da
    ///      primeira share. Mesmo truque do Uniswap V2.
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    IERC20 public immutable token0;
    IERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        uint256 amountIn,
        address indexed tokenOut,
        uint256 amountOut,
        uint256 reserve0After,
        uint256 reserve1After
    );

    error IdenticalTokens();
    error ZeroAddress();
    error InsufficientInput();
    error InsufficientLiquidity();
    error InvalidToken(address token);
    error SlippageExceeded(uint256 got, uint256 minimum);
    error InsufficientAmount0(uint256 got, uint256 minimum);
    error InsufficientAmount1(uint256 got, uint256 minimum);

    constructor(address token0_, address token1_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        if (token0_ == token1_) revert IdenticalTokens();
        if (token0_ == address(0) || token1_ == address(0)) revert ZeroAddress();
        token0 = IERC20(token0_);
        token1 = IERC20(token1_);
    }

    // ---------------------------------------------------------------------
    // Leitura — tudo que a UI precisa para desenhar a curva e prever o preco
    // ---------------------------------------------------------------------

    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    /// @notice O "k" da aula. Cresce apenas pelas taxas retidas.
    function invariant() external view returns (uint256) {
        return reserve0 * reserve1;
    }

    /// @notice Preco marginal (spot) de token0 em token1, escalado por 1e18.
    /// @dev E o preco da proxima gota infinitesimal — nao o preco que voce
    ///      vai executar. A diferenca entre os dois e exatamente o slippage.
    function spotPrice0In1() external view returns (uint256) {
        if (reserve0 == 0) return 0;
        return (reserve1 * 1e18) / reserve0;
    }

    /// @notice Quanto sai, dado quanto entra — ja descontada a taxa.
    /// @dev Deriva de (x + dx_liquido) * (y - dy) = k.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256)
    {
        if (amountIn == 0) revert InsufficientInput();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 amountInWithFee = amountIn * (BPS_DENOMINATOR - FEE_BPS);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * BPS_DENOMINATOR + amountInWithFee;
        return numerator / denominator;
    }

    /// @notice Previsao completa de um swap, do jeito que a tela mostra:
    ///         o que voce recebe, o que receberia sem impacto, e o slippage em bps.
    function previewSwap(address tokenIn, uint256 amountIn)
        external
        view
        returns (uint256 amountOut, uint256 amountOutNoImpact, uint256 slippageBps)
    {
        (uint256 reserveIn, uint256 reserveOut) = _reservesFor(tokenIn);
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

        // Preco spot atual aplicado ao volume inteiro: o preco "de vitrine".
        amountOutNoImpact = (amountIn * reserveOut) / reserveIn;
        if (amountOutNoImpact > amountOut) {
            slippageBps = ((amountOutNoImpact - amountOut) * BPS_DENOMINATOR) / amountOutNoImpact;
        }
    }

    /// @notice Proporcao exigida pelo pool: quanto de B para uma dada quantia de A.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        public
        pure
        returns (uint256)
    {
        if (amountA == 0) revert InsufficientInput();
        if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
        return (amountA * reserveB) / reserveA;
    }

    /// @notice Quanto de cada token um LP resgataria hoje com suas shares.
    /// @dev Comparar isso com "ter so guardado os dois tokens" e a medida
    ///      de impermanent loss que a tela mostra ao vivo.
    function positionValue(address provider)
        external
        view
        returns (uint256 amount0, uint256 amount1)
    {
        uint256 supply = totalSupply();
        if (supply == 0) return (0, 0);
        uint256 shares = balanceOf(provider);
        amount0 = (shares * reserve0) / supply;
        amount1 = (shares * reserve1) / supply;
    }

    // ---------------------------------------------------------------------
    // Liquidez
    // ---------------------------------------------------------------------

    /// @notice Deposita o par e recebe shares do pool.
    /// @dev Os `*Min` sao a protecao do LP: entre a sua assinatura e a inclusao
    ///      no bloco, outra pessoa pode mover o preco. Sem eles, voce assina em
    ///      branco. Esse e o mesmo campo "slippage tolerance" das interfaces reais.
    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 amount0, uint256 amount1, uint256 shares) {
        if (reserve0 == 0 && reserve1 == 0) {
            // Primeiro LP define o preco inicial do pool — literalmente do nada.
            (amount0, amount1) = (amount0Desired, amount1Desired);
        } else {
            uint256 amount1Optimal = quote(amount0Desired, reserve0, reserve1);
            if (amount1Optimal <= amount1Desired) {
                if (amount1Optimal < amount1Min) revert InsufficientAmount1(amount1Optimal, amount1Min);
                (amount0, amount1) = (amount0Desired, amount1Optimal);
            } else {
                uint256 amount0Optimal = quote(amount1Desired, reserve1, reserve0);
                if (amount0Optimal < amount0Min) revert InsufficientAmount0(amount0Optimal, amount0Min);
                (amount0, amount1) = (amount0Optimal, amount1Desired);
            }
        }
        if (amount0 == 0 || amount1 == 0) revert InsufficientInput();

        token0.safeTransferFrom(msg.sender, address(this), amount0);
        token1.safeTransferFrom(msg.sender, address(this), amount1);

        uint256 supply = totalSupply();
        if (supply == 0) {
            shares = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            shares = Math.min((amount0 * supply) / reserve0, (amount1 * supply) / reserve1);
        }
        if (shares == 0) revert InsufficientLiquidity();

        _mint(msg.sender, shares);
        _sync();

        emit LiquidityAdded(msg.sender, amount0, amount1, shares);
    }

    /// @notice Queima shares e retira a fatia proporcional das reservas.
    function removeLiquidity(uint256 shares, uint256 amount0Min, uint256 amount1Min)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        if (shares == 0) revert InsufficientInput();

        uint256 supply = totalSupply();
        amount0 = (shares * reserve0) / supply;
        amount1 = (shares * reserve1) / supply;

        if (amount0 < amount0Min) revert InsufficientAmount0(amount0, amount0Min);
        if (amount1 < amount1Min) revert InsufficientAmount1(amount1, amount1Min);
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidity();

        _burn(msg.sender, shares);
        token0.safeTransfer(msg.sender, amount0);
        token1.safeTransfer(msg.sender, amount1);
        _sync();

        emit LiquidityRemoved(msg.sender, amount0, amount1, shares);
    }

    // ---------------------------------------------------------------------
    // Swap
    // ---------------------------------------------------------------------

    /// @notice Troca `amountIn` de `tokenIn` pelo outro token do par.
    /// @param minAmountOut Piso aceito pelo trader. Se o preco andar, reverte.
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        (uint256 reserveIn, uint256 reserveOut) = _reservesFor(tokenIn);
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);

        IERC20 tokenOut = tokenIn == address(token0) ? token1 : token0;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOut.safeTransfer(msg.sender, amountOut);
        _sync();

        emit Swap(msg.sender, tokenIn, amountIn, address(tokenOut), amountOut, reserve0, reserve1);
    }

    // ---------------------------------------------------------------------
    // Interno
    // ---------------------------------------------------------------------

    function _reservesFor(address tokenIn)
        internal
        view
        returns (uint256 reserveIn, uint256 reserveOut)
    {
        if (tokenIn == address(token0)) return (reserve0, reserve1);
        if (tokenIn == address(token1)) return (reserve1, reserve0);
        revert InvalidToken(tokenIn);
    }

    /// @dev Reservas sao lidas do saldo real. Quem doar tokens ao contrato
    ///      simplesmente presenteia os LPs — nao ha contabilidade paralela.
    function _sync() internal {
        reserve0 = token0.balanceOf(address(this));
        reserve1 = token1.balanceOf(address(this));
    }
}
