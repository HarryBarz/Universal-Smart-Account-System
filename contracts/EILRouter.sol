// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EILRouter
 * @dev Router contract that accepts EIL composite payloads
 * @notice Emits events for payload submission tracking
 */
contract EILRouter {
    address public immutable superAccount;
    mapping(bytes32 => bool) public processedPayloads;

    event CompositeSubmitted(
        bytes32 indexed payloadHash,
        address indexed userAccount,
        bytes payload
    );
    event PayloadProcessed(bytes32 indexed payloadHash);

    constructor(address _superAccount) {
        require(_superAccount != address(0), "EILRouter: invalid superAccount");
        superAccount = _superAccount;
    }

    /**
     * @dev Submit a composite EIL payload
     * @param payload The encoded composite payload containing chain actions
     */
    function submitComposite(bytes calldata payload) external {
        require(msg.sender == superAccount, "EILRouter: only SuperAccount");
        
        bytes32 payloadHash = keccak256(payload);
        require(!processedPayloads[payloadHash], "EILRouter: payload already processed");
        
        processedPayloads[payloadHash] = true;
        emit CompositeSubmitted(payloadHash, superAccount, payload);
    }

    /**
     * @dev Check if a payload has been processed
     * @param payload The payload to check
     * @return Whether the payload has been processed
     */
    function isProcessed(bytes calldata payload) external view returns (bool) {
        bytes32 payloadHash = keccak256(payload);
        return processedPayloads[payloadHash];
    }
}

