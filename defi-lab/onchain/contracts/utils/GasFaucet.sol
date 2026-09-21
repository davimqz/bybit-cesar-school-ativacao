// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GasFaucet — distribui ETH de testnet para a turma
/// @notice Sem gas, o aluno nao assina nada. Este contrato e o seguro contra
///         "metade da sala travada no primeiro minuto da aula".
/// @dev O professor deposita ETH de Sepolia aqui na vespera. Cada endereco
///      saca `dripAmount` uma vez por `cooldown`.
contract GasFaucet is Ownable {
    uint256 public dripAmount;
    uint256 public cooldown;

    mapping(address => uint256) public lastClaimAt;

    event Funded(address indexed from, uint256 amount);
    event Dripped(address indexed student, uint256 amount);
    event Configured(uint256 dripAmount, uint256 cooldown);

    error FaucetEmpty(uint256 balance, uint256 requested);
    error CooldownActive(uint256 availableAt);
    error TransferFailed();

    constructor(uint256 dripAmount_, uint256 cooldown_, address owner_) payable Ownable(owner_) {
        dripAmount = dripAmount_;
        cooldown = cooldown_;
        emit Configured(dripAmount_, cooldown_);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Saca gas para operar os labs.
    function claim() external {
        uint256 availableAt = lastClaimAt[msg.sender] + cooldown;
        if (lastClaimAt[msg.sender] != 0 && block.timestamp < availableAt) {
            revert CooldownActive(availableAt);
        }
        if (address(this).balance < dripAmount) {
            revert FaucetEmpty(address(this).balance, dripAmount);
        }

        lastClaimAt[msg.sender] = block.timestamp;

        (bool ok, ) = msg.sender.call{value: dripAmount}("");
        if (!ok) revert TransferFailed();

        emit Dripped(msg.sender, dripAmount);
    }

    /// @notice Quantos alunos ainda cabem no saldo atual — o numero que o
    ///         professor olha antes de comecar a aula.
    function remainingClaims() external view returns (uint256) {
        if (dripAmount == 0) return 0;
        return address(this).balance / dripAmount;
    }

    function claimAvailableAt(address student) external view returns (uint256) {
        if (lastClaimAt[student] == 0) return 0;
        return lastClaimAt[student] + cooldown;
    }

    function configure(uint256 dripAmount_, uint256 cooldown_) external onlyOwner {
        dripAmount = dripAmount_;
        cooldown = cooldown_;
        emit Configured(dripAmount_, cooldown_);
    }

    /// @notice Devolve o ETH nao usado ao professor depois da aula.
    function withdraw(uint256 amount) external onlyOwner {
        (bool ok, ) = owner().call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
