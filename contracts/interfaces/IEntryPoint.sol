// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IEntryPoint
 * @dev Minimal EntryPoint interface for ERC-4337
 * @notice This is a simplified interface - full EntryPoint has more methods
 */
interface IEntryPoint {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);
    
    function handleOps(
        UserOperation[] calldata ops,
        address payable beneficiary
    ) external;
}

