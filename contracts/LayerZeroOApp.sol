// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title LayerZeroOApp
 * @dev Minimal OApp contract that receives LayerZero messages and forwards to adapters
 * @notice For MVP: Extends minimal LayerZero OApp functionality
 */
abstract contract LayerZeroOApp {
    address public endpoint;
    address public owner;
    
    // Mapping of adapter addresses per chain
    mapping(uint32 => address) public adapters;
    
    event MessageReceived(uint32 srcEid, address adapter, bytes payload);
    event MessageSent(uint32 dstEid, address adapter, bytes payload);
    event AdapterSet(uint32 eid, address adapter);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "LayerZeroOApp: not owner");
        _;
    }
    
    modifier onlyEndpoint() {
        require(msg.sender == endpoint, "LayerZeroOApp: not endpoint");
        _;
    }
    
    constructor(address _endpoint) {
        require(_endpoint != address(0), "LayerZeroOApp: invalid endpoint");
        endpoint = _endpoint;
        owner = msg.sender;
    }
    
    /**
     * @dev Receive LayerZero message and forward to adapter
     */
    function _lzReceive(
        uint32 srcEid,
        bytes calldata payload
    ) internal virtual {
        // Decode payload: (address adapter, bytes calldata)
        (address adapter, bytes memory calldata_) = abi.decode(payload, (address, bytes));
        
        require(adapters[srcEid] == adapter || adapters[srcEid] == address(0), "LayerZeroOApp: invalid adapter");
        
        // Forward to adapter
        (bool success, ) = adapter.call(calldata_);
        require(success, "LayerZeroOApp: adapter call failed");
        
        emit MessageReceived(srcEid, adapter, calldata_);
    }
    
    /**
     * @dev Set adapter for a specific chain EID
     */
    function setAdapter(uint32 eid, address adapter) external onlyOwner {
        adapters[eid] = adapter;
        emit AdapterSet(eid, adapter);
    }
}

