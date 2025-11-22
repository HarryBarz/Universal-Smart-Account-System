// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IEntryPoint.sol";

/**
 * @title SuperAccount
 * @dev ERC-4337 Smart Account that enables chain-abstracted operations
 * @notice Minimal implementation with execute and executeBatch functionality
 */
contract SuperAccount {
    IEntryPoint public immutable entryPoint;
    address public owner;
    uint256 public nonce;

    event SuperAccountInitialized(address indexed owner);
    event Executed(address indexed to, uint256 value, bytes data);
    event BatchExecuted(address[] targets, bytes[] calldatas);

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "SuperAccount: not entryPoint");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "SuperAccount: not owner");
        _;
    }

    constructor(IEntryPoint anEntryPoint, address anOwner) {
        require(address(anEntryPoint) != address(0), "SuperAccount: invalid entryPoint");
        require(anOwner != address(0), "SuperAccount: invalid owner");
        entryPoint = anEntryPoint;
        owner = anOwner;
        emit SuperAccountInitialized(anOwner);
    }

    /**
     * @dev Execute a single call - only callable by EntryPoint
     * @param to Target address
     * @param value Ether value to send
     * @param data Calldata to send
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyEntryPoint {
        nonce++;
        _call(to, value, data);
        emit Executed(to, value, data);
    }

    /**
     * @dev Execute a batch of calls - only callable by EntryPoint
     * @param tos Array of target addresses
     * @param values Array of ether values
     * @param datas Array of calldata
     */
    function executeBatch(
        address[] calldata tos,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external onlyEntryPoint {
        require(tos.length == datas.length, "SuperAccount: array length mismatch");
        require(tos.length == values.length, "SuperAccount: values length mismatch");

        nonce++;
        for (uint256 i = 0; i < tos.length; i++) {
            _call(tos[i], values[i], datas[i]);
        }
        emit BatchExecuted(tos, datas);
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    receive() external payable {}
}

