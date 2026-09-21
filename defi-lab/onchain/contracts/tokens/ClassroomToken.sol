// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClassroomToken — ERC-20 de sala de aula (CESAR School / Bybit)
/// @notice Token educacional de testnet. Nao tem valor, nao tem lastro, nao e investimento.
/// @dev Um unico contrato parametrizado: publicamos duas vezes (CSR e BRLX).
///      O reuso e proposital — e o mesmo motivo pelo qual DeFi e "componivel".
contract ClassroomToken is ERC20, Ownable {
    /// @notice Quanto cada aluno recebe por saque no faucet.
    uint256 public faucetAmount;

    /// @notice Intervalo minimo entre dois saques do mesmo endereco.
    uint256 public faucetCooldown;

    /// @notice Ultimo saque de cada endereco (timestamp do bloco).
    mapping(address => uint256) public lastClaimAt;

    event FaucetClaimed(address indexed student, uint256 amount);
    event FaucetConfigured(uint256 amount, uint256 cooldown);

    error FaucetCooldownActive(uint256 availableAt);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        uint256 faucetAmount_,
        uint256 faucetCooldown_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        faucetAmount = faucetAmount_;
        faucetCooldown = faucetCooldown_;
        // Supply inicial vai para o professor: e o estoque usado para semear
        // pools, cofres de staking e demonstracoes ao vivo.
        if (initialSupply > 0) _mint(owner_, initialSupply);
        emit FaucetConfigured(faucetAmount_, faucetCooldown_);
    }

    /// @notice Qualquer aluno saca tokens para participar dos labs.
    /// @dev O cooldown existe para a turma nao esvaziar a aula em 10 segundos.
    ///      Em um token real, `mint` aberto assim seria uma falha grave — aqui e o ponto.
    function claim() external {
        uint256 availableAt = lastClaimAt[msg.sender] + faucetCooldown;
        if (lastClaimAt[msg.sender] != 0 && block.timestamp < availableAt) {
            revert FaucetCooldownActive(availableAt);
        }
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit FaucetClaimed(msg.sender, faucetAmount);
    }

    /// @notice Quando o aluno pode sacar de novo (0 = agora).
    function claimAvailableAt(address student) external view returns (uint256) {
        if (lastClaimAt[student] == 0) return 0;
        return lastClaimAt[student] + faucetCooldown;
    }

    /// @notice Municao do professor para as demos (whale swap, encher cofre, etc).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function configureFaucet(uint256 amount, uint256 cooldown) external onlyOwner {
        faucetAmount = amount;
        faucetCooldown = cooldown;
        emit FaucetConfigured(amount, cooldown);
    }
}
