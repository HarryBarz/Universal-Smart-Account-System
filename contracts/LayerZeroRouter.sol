// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./LayerZeroOApp.sol";
import "./NFTAdapter.sol";
import "./SwapAdapter.sol";

/**
 * @title LayerZeroRouter
 * @dev Router that receives LayerZero messages and calls appropriate adapters
 */
contract LayerZeroRouter is LayerZeroOApp {
    constructor(address _endpoint) LayerZeroOApp(_endpoint) {}
    
    /**
     * @dev Receive LayerZero message - called by LayerZero Endpoint
     * @param srcEid Source endpoint ID
     * @param payload Encoded payload: (address userAccount, bytes adapterCalldata, address adapter)
     */
    function receiveMessage(
        uint32 srcEid,
        bytes calldata /* sender */,
        bytes calldata payload
    ) external onlyEndpoint {
        // Decode payload: (address userAccount, address adapter, bytes calldata)
        (address userAccount, address adapter, bytes memory calldata_) = abi.decode(payload, (address, address, bytes));
        
        require(adapters[srcEid] == adapter || adapters[srcEid] == address(0), "LayerZeroRouter: invalid adapter");
        
        // Call adapter's executeFromEIL function
        (bool success, ) = adapter.call(
            abi.encodeWithSelector(
                bytes4(keccak256("executeFromEIL(address,bytes)")),
                userAccount,
                calldata_
            )
        );
        require(success, "LayerZeroRouter: adapter call failed");
        
        emit MessageReceived(srcEid, adapter, calldata_);
    }
    
    /**
     * @dev Send LayerZero message to target chain
     * @param dstEid Destination endpoint ID
     * @param adapter Target adapter address
     * @param userAccount User account address
     * @param calldata_ Encoded adapter calldata
     */
    function sendMessage(
        uint32 dstEid,
        address adapter,
        address userAccount,
        bytes calldata calldata_
    ) external payable {
        // Encode payload
        // bytes memory payload = abi.encode(userAccount, adapter, calldata_);
        
        // Get LayerZero Endpoint
        // For MVP: We'll use a simplified interface
        // In production, use actual LayerZero Endpoint contract
        
        emit MessageSent(dstEid, adapter, calldata_);
    }
}

