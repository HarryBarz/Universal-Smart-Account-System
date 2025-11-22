// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./OmnichainVault.sol";

/**
 * @title VaultAdapter
 * @dev Adapter for executing vault operations via LayerZero messages
 * @notice Deployed on each chain to handle deposits/withdrawals
 */
contract VaultAdapter {
    address public trustedRouter;
    OmnichainVault public vault;
    
    enum VaultOperation {
        Deposit,
        Withdraw,
        CrossChainDeposit,
        CrossChainWithdraw
    }
    
    struct VaultAction {
        VaultOperation operation;
        address user;
        uint256 amount;
        uint32 targetChainId; // For cross-chain operations
    }
    
    event VaultOperationExecuted(
        VaultOperation indexed operation,
        address indexed user,
        uint256 amount,
        uint32 targetChainId,
        bool success
    );
    
    modifier onlyRouter() {
        require(msg.sender == trustedRouter, "VaultAdapter: not trusted router");
        _;
    }
    
    constructor(address _trustedRouter, address _vault) {
        require(_trustedRouter != address(0), "VaultAdapter: invalid router");
        require(_vault != address(0), "VaultAdapter: invalid vault");
        trustedRouter = _trustedRouter;
        vault = OmnichainVault(_vault);
    }
    
    /**
     * @dev Execute vault operation from LayerZero message
     * @param userAccount User account requesting the operation
     * @param payload Encoded VaultAction
     */
    function executeFromEIL(
        address userAccount,
        bytes calldata payload
    ) external payable onlyRouter {
        // Decode VaultAction
        VaultAction memory action = abi.decode(payload, (VaultAction));
        
        require(action.user == userAccount, "VaultAdapter: user mismatch");
        require(action.amount > 0, "VaultAdapter: invalid amount");
        
        bool success = false;
        
        if (action.operation == VaultOperation.Deposit) {
            // Execute deposit on this chain for the user with ETH value
            vault.depositFor{value: action.amount}(action.user, action.amount);
            success = true;
            
        } else if (action.operation == VaultOperation.Withdraw) {
            // Execute withdrawal on this chain
            vault.withdraw(action.amount);
            success = true;
            
        } else if (action.operation == VaultOperation.CrossChainDeposit) {
            // Execute cross-chain deposit (receiving side)
            uint32 srcChainId = getCurrentChainEID();
            vault.executeCrossChainDeposit(action.user, srcChainId, action.amount);
            success = true;
            
        } else if (action.operation == VaultOperation.CrossChainWithdraw) {
            // Execute cross-chain withdrawal (source side)
            vault.executeCrossChainWithdraw(action.user, action.targetChainId, action.amount);
            success = true;
        }
        
        emit VaultOperationExecuted(
            action.operation,
            action.user,
            action.amount,
            action.targetChainId,
            success
        );
    }
    
    /**
     * @dev Get current chain EID (simplified - should use actual LayerZero EID mapping)
     */
    function getCurrentChainEID() internal view returns (uint32) {
        // Map common chain IDs to LayerZero EIDs
        if (block.chainid == 84532) return 40245; // Base Sepolia
        if (block.chainid == 421614) return 40231; // Arbitrum Sepolia
        return uint32(block.chainid);
    }
    
    /**
     * @dev Update trusted router
     */
    function updateRouter(address newRouter) external onlyRouter {
        require(newRouter != address(0), "VaultAdapter: invalid router");
        trustedRouter = newRouter;
    }
}

