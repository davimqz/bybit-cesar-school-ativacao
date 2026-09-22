// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MiniStaking — cofre de rendimento com emissao por segundo
/// @notice Deposite CSR, receba mais CSR com o tempo. A pergunta que a aula faz
///         nao e "quanto rende", e sim **de onde vem**: aqui vem de uma reserva
///         finita que o professor abasteceu, e ela aparece na tela esvaziando.
/// @dev A emissao e fixa por segundo e dividida entre TODOS os depositantes. Por
///      isso o APR cai quando alguem grande entra: o bolo e o mesmo, as fatias
///      sao mais. Esse e o numero que a turma ve mudar ao vivo.
///
///      A contabilidade e a mesma de MasterChef/Synthetix: um acumulador global
///      de recompensa por unidade depositada, e uma "divida" por posicao para
///      que quem chegou depois nao receba o que rendeu antes dele.
contract MiniStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Token depositado e tambem pago como recompensa.
    /// @dev Mesmo token dos dois lados de proposito: permite reinvestir de
    ///      verdade e mostrar a diferenca entre APR e APY sem trocar de ativo.
    IERC20 public immutable token;

    /// @notice Quanto o cofre emite por segundo, somando todos os depositantes.
    uint256 public taxaPorSegundo;

    /// @notice Total depositado. Nao usamos `balanceOf`: o saldo do contrato
    ///         tambem contem a reserva e as recompensas ja creditadas.
    uint256 public totalEmStake;

    /// @notice O que ainda existe para pagar. Zero aqui = rendimento zero,
    ///         por mais que o APR "prometido" diga outra coisa.
    uint256 public reservaDeRecompensa;

    /// @dev Recompensa acumulada por unidade depositada, escalada por 1e18.
    uint256 public accPorShare;
    uint256 public ultimaAtualizacao;

    struct Posicao {
        uint256 quantidade;
        /// @dev O que ja foi contabilizado para esta posicao — impede que quem
        ///      depositou hoje receba o rendimento de ontem.
        uint256 divida;
        /// @dev Rendimento fechado e ainda nao sacado.
        uint256 naoColhido;
    }

    mapping(address => Posicao) public posicoes;

    event Depositado(address indexed quem, uint256 quantidade);
    event Retirado(address indexed quem, uint256 quantidade);
    event Colhido(address indexed quem, uint256 quantidade);
    event Reinvestido(address indexed quem, uint256 quantidade);
    event Abastecido(address indexed quem, uint256 quantidade);
    event TaxaConfigurada(uint256 taxaPorSegundo);

    error QuantidadeInvalida();
    error SaldoInsuficienteNaPosicao(uint256 tem, uint256 pediu);
    error NadaParaColher();

    constructor(address token_, uint256 taxaPorSegundo_, address owner_) Ownable(owner_) {
        token = IERC20(token_);
        taxaPorSegundo = taxaPorSegundo_;
        ultimaAtualizacao = block.timestamp;
        emit TaxaConfigurada(taxaPorSegundo_);
    }

    // ---------------------------------------------------------------------
    // Leitura — os numeros que a tela mostra
    // ---------------------------------------------------------------------

    /// @notice O que este endereco sacaria agora, contando o tempo desde o
    ///         ultimo bloco que tocou o contrato.
    /// @dev Projeta o acumulador sem escrever: sem isso o numero na tela ficaria
    ///      congelado entre transacoes, e a turma nao veria nada crescer.
    function pendente(address quem) public view returns (uint256) {
        Posicao storage p = posicoes[quem];
        uint256 acc = accPorShare;

        if (block.timestamp > ultimaAtualizacao && totalEmStake > 0) {
            uint256 devido = (block.timestamp - ultimaAtualizacao) * taxaPorSegundo;
            if (devido > reservaDeRecompensa) devido = reservaDeRecompensa;
            acc += (devido * 1e18) / totalEmStake;
        }

        return p.naoColhido + (p.quantidade * acc) / 1e18 - p.divida;
    }

    /// @notice APR em basis points: emissao de um ano dividida pelo que esta
    ///         depositado hoje.
    /// @dev Este numero **nao e uma promessa**. Ele muda a cada deposito de
    ///      qualquer pessoa, e vira zero quando a reserva seca.
    function aprBps() external view returns (uint256) {
        if (totalEmStake == 0 || reservaDeRecompensa == 0) return 0;
        return (taxaPorSegundo * 365 days * 10_000) / totalEmStake;
    }

    /// @notice Quantos segundos a reserva ainda paga no ritmo atual.
    /// @dev O numero mais honesto da tela: rendimento tem prazo de validade.
    function segundosDeReserva() external view returns (uint256) {
        if (taxaPorSegundo == 0) return 0;
        return reservaDeRecompensa / taxaPorSegundo;
    }

    /// @notice A fatia deste endereco no cofre, em basis points.
    function fatiaBps(address quem) external view returns (uint256) {
        if (totalEmStake == 0) return 0;
        return (posicoes[quem].quantidade * 10_000) / totalEmStake;
    }

    // ---------------------------------------------------------------------
    // Depositantes
    // ---------------------------------------------------------------------

    /// @notice Deposita e passa a receber a partir de agora.
    function depositar(uint256 quantidade) external nonReentrant {
        if (quantidade == 0) revert QuantidadeInvalida();

        _atualizar();
        Posicao storage p = posicoes[msg.sender];
        _fechar(p);

        p.quantidade += quantidade;
        p.divida = (p.quantidade * accPorShare) / 1e18;
        totalEmStake += quantidade;

        token.safeTransferFrom(msg.sender, address(this), quantidade);

        emit Depositado(msg.sender, quantidade);
    }

    /// @notice Retira o principal. O rendimento fechado continua guardado aqui.
    function retirar(uint256 quantidade) external nonReentrant {
        if (quantidade == 0) revert QuantidadeInvalida();

        _atualizar();
        Posicao storage p = posicoes[msg.sender];
        if (p.quantidade < quantidade) revert SaldoInsuficienteNaPosicao(p.quantidade, quantidade);
        _fechar(p);

        p.quantidade -= quantidade;
        p.divida = (p.quantidade * accPorShare) / 1e18;
        totalEmStake -= quantidade;

        token.safeTransfer(msg.sender, quantidade);

        emit Retirado(msg.sender, quantidade);
    }

    /// @notice Saca o rendimento para a carteira.
    function colher() external nonReentrant returns (uint256 colhido) {
        _atualizar();
        Posicao storage p = posicoes[msg.sender];
        _fechar(p);

        colhido = p.naoColhido;
        if (colhido == 0) revert NadaParaColher();
        p.naoColhido = 0;

        token.safeTransfer(msg.sender, colhido);

        emit Colhido(msg.sender, colhido);
    }

    /// @notice Colhe e deposita na mesma transacao: juros sobre juros.
    /// @dev É isto que separa APR de APY. O APR do contrato e linear; o APY
    ///      aparece porque alguem reinveste, e o ganho extra vem de quem NAO
    ///      reinveste — a emissao total nao muda.
    function reinvestir() external nonReentrant returns (uint256 reinvestido) {
        _atualizar();
        Posicao storage p = posicoes[msg.sender];
        _fechar(p);

        reinvestido = p.naoColhido;
        if (reinvestido == 0) revert NadaParaColher();

        p.naoColhido = 0;
        p.quantidade += reinvestido;
        p.divida = (p.quantidade * accPorShare) / 1e18;
        totalEmStake += reinvestido;

        // Nenhum token se move: a recompensa ja estava neste contrato.
        emit Reinvestido(msg.sender, reinvestido);
    }

    // ---------------------------------------------------------------------
    // Professor
    // ---------------------------------------------------------------------

    /// @notice Coloca mais CSR na reserva de recompensa.
    /// @dev Qualquer um pode abastecer: subsidiar rendimento alheio e permitido,
    ///      e o fato de alguem ter que pagar a conta e exatamente o ponto.
    function abastecer(uint256 quantidade) external nonReentrant {
        if (quantidade == 0) revert QuantidadeInvalida();
        _atualizar();
        reservaDeRecompensa += quantidade;
        token.safeTransferFrom(msg.sender, address(this), quantidade);
        emit Abastecido(msg.sender, quantidade);
    }

    /// @notice Muda o ritmo da emissao — o APR de todo mundo muda junto.
    function configurarTaxa(uint256 taxaPorSegundo_) external onlyOwner {
        _atualizar();
        taxaPorSegundo = taxaPorSegundo_;
        emit TaxaConfigurada(taxaPorSegundo_);
    }

    // ---------------------------------------------------------------------
    // Interno
    // ---------------------------------------------------------------------

    /// @dev Move o acumulador global ate agora. Chamado antes de qualquer
    ///      mudanca em `totalEmStake`, senao o rendimento passado seria
    ///      redistribuido pela base nova.
    function _atualizar() internal {
        if (block.timestamp <= ultimaAtualizacao) return;

        if (totalEmStake == 0) {
            // Cofre vazio nao emite: a reserva espera. Sem isso, o rendimento
            // do periodo sem ninguem cairia no colo do primeiro a depositar.
            ultimaAtualizacao = block.timestamp;
            return;
        }

        uint256 devido = (block.timestamp - ultimaAtualizacao) * taxaPorSegundo;
        if (devido > reservaDeRecompensa) devido = reservaDeRecompensa;

        reservaDeRecompensa -= devido;
        accPorShare += (devido * 1e18) / totalEmStake;
        ultimaAtualizacao = block.timestamp;
    }

    /**
     * @dev Fecha o rendimento da posicao no acumulador atual.
     *
     * Atualizar a `divida` aqui nao e detalhe: sem isso, `colher` pagaria e a
     * divida continuaria apontando para o passado, entao o mesmo periodo seria
     * contabilizado de novo a cada chamada — o cofre pagaria varias vezes pelo
     * mesmo tempo, ate secar a reserva. Quem muda `quantidade` depois desta
     * chamada recalcula a divida outra vez, com a base nova.
     */
    function _fechar(Posicao storage p) internal {
        uint256 acumulado = (p.quantidade * accPorShare) / 1e18;
        p.naoColhido += acumulado - p.divida;
        p.divida = acumulado;
    }
}
