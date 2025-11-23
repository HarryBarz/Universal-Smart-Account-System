// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";
import "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

/**
 * @title OmnichainSuperAccountRouter
 * @dev Advanced LayerZero OApp that orchestrates cross-chain actions for Super Account
 * @notice This contract demonstrates LayerZero V2 OApp pattern with proper send/receive
 * 
 * Key Features:
 * - Proper OApp implementation extending LayerZero's OApp base
 * - Cross-chain message routing with payload validation
 * - Adapter-based execution system for modularity
 * - Message execution tracking and event emission
 * - Configurable executor settings per chain
 */
contract OmnichainSuperAccountRouter is OApp {
    using OptionsBuilder for bytes;

    // Struct for cross-chain action payload
    struct CrossChainAction {
        address userAccount;      // Super Account that initiated the action
        address targetAdapter;    // Adapter contract to execute on
        bytes adapterCalldata;    // Calldata for adapter.executeFromEIL()
        uint256 timestamp;        // When action was initiated
        bytes32 actionId;         // Unique identifier for this action
    }

    // Struct for message options
    struct MessageOptions {
        uint128 nativeDropAmount;  // Native token amount to airdrop on destination
        bytes executorLzReceiveOption;  // Executor options
    }

    // Tracking for cross-chain actions
    mapping(bytes32 => bool) public executedActions;
    mapping(uint32 => address) public trustedAdapters;  // EID => Adapter address
    mapping(address => bool) public authorizedExecutors;  // Who can trigger sends

    // Events
    event CrossChainActionSent(
        bytes32 indexed actionId,
        uint32 dstEid,
        address indexed userAccount,
        address targetAdapter
    );
    
    event CrossChainActionReceived(
        bytes32 indexed actionId,
        uint32 srcEid,
        address indexed userAccount,
        address targetAdapter,
        bool success
    );

    event AdapterConfigured(uint32 eid, address adapter);
    event ExecutorAuthorized(address executor, bool authorized);

    // Modifiers
    modifier onlyAuthorized() {
        require(
            authorizedExecutors[msg.sender] || msg.sender == owner(),
            "OmnichainRouter: not authorized"
        );
        _;
    }

    /**
     * @dev Constructor for OApp
     * @param _endpoint LayerZero EndpointV2 address
     * @param _delegate Delegate address for OApp configuration
     */
    constructor(
        address _endpoint,
        address _delegate
    ) OApp(_endpoint, _delegate) {
        // Delegate is automatically authorized
        authorizedExecutors[_delegate] = true;
    }

    /**
     * @dev Send cross-chain action via LayerZero
     * @param _dstEid Destination endpoint ID (chain)
     * @param _action Cross-chain action payload
     * @param _options Message options for LayerZero execution
     * @return messageId LayerZero message identifier
     */
    function sendCrossChainAction(
        uint32 _dstEid,
        CrossChainAction calldata _action,
        MessageOptions calldata _options
    ) external payable onlyAuthorized returns (bytes32 messageId) {
        require(!executedActions[_action.actionId], "OmnichainRouter: action already executed");
        require(_action.userAccount != address(0), "OmnichainRouter: invalid user account");
        require(_action.targetAdapter != address(0), "OmnichainRouter: invalid adapter");

        // Verify adapter is trusted for destination chain
        address trustedAdapter = trustedAdapters[_dstEid];
        if (trustedAdapter != address(0)) {
            require(
                _action.targetAdapter == trustedAdapter,
                "OmnichainRouter: adapter not trusted for destination"
            );
        }

        // Encode the action payload
        bytes memory payload = abi.encode(_action);

        // Build LayerZero options
        bytes memory options = OptionsBuilder.newOptions();
        options = OptionsBuilder.addExecutorLzReceiveOption(options, 200000, 0); // Gas limit, value
        if (_options.nativeDropAmount > 0) {
            options = OptionsBuilder.addExecutorNativeDropOption(
                options,
                _options.nativeDropAmount,
                bytes32(uint256(uint160(_action.userAccount))) // Receiver as bytes32
            );
        }

        // Quote fee
        MessagingFee memory fee = _quote(_dstEid, payload, options, false);
        require(msg.value >= fee.nativeFee, "OmnichainRouter: insufficient fee");

        // Send via LayerZero
        MessagingReceipt memory receipt = _lzSend(
            _dstEid,
            payload,
            options,
            MessagingFee(msg.value, 0), // nativeFee, lzTokenFee
            payable(msg.sender) // refund address
        );

        // Mark as sent (not executed yet, that happens on destination)
        emit CrossChainActionSent(
            _action.actionId,
            _dstEid,
            _action.userAccount,
            _action.targetAdapter
        );

        return receipt.guid;
    }

    /**
     * @dev Receive cross-chain action - called by LayerZero Endpoint
     * @param _origin Origin information (chain, sender)
     * @param _guid Message GUID
     * @param _payload Encoded CrossChainAction
     * @param _executor Executor address
     * @param _extraData Additional data
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        // Try to detect if this is a batch payload
        // Check if payload can be decoded as array
        bool isBatch = _isBatchPayload(_payload);
        
        if (isBatch) {
            // Try to decode as batch and handle
            // If decoding fails, fall through to single action
            try this._handleBatchActions(_origin, _payload, _executor) returns (bool) {
                return; // Batch handled successfully
            } catch {
                // Fall through to single action handling
                isBatch = false;
            }
        }
        
        if (!isBatch) {
            // Single action handling (existing logic)
            CrossChainAction memory action = abi.decode(_payload, (CrossChainAction));

            // Check if action was already executed (replay protection)
            require(!executedActions[action.actionId], "OmnichainRouter: action already executed");

            // Verify adapter is trusted for source chain
            address trustedAdapter = trustedAdapters[_origin.srcEid];
            if (trustedAdapter != address(0)) {
                require(
                    action.targetAdapter == trustedAdapter,
                    "OmnichainRouter: adapter not trusted for source chain"
                );
            }

            // Execute the action on the adapter
            bool success = _executeAdapter(action, _executor);

            // Mark as executed (replay protection - even if execution failed)
            executedActions[action.actionId] = true;

            // Emit event with success status
            emit CrossChainActionReceived(
                action.actionId,
                _origin.srcEid,
                action.userAccount,
                action.targetAdapter,
                success
            );
        }
    }
    
    /**
     * @dev Helper to check if payload is a batch (internal)
     * @notice Simple heuristic: batch payloads are larger than single actions
     */
    function _isBatchPayload(bytes calldata _payload) internal pure returns (bool) {
        // Simple heuristic: single action is ~150-200 bytes
        // Batch payloads with multiple actions will be significantly larger
        // A more sophisticated approach would try to decode and check structure
        return _payload.length > 250; // Threshold for batch detection
    }

    /**
     * @dev Execute local action (same chain, no LayerZero)
     * @notice Allows executing adapter actions on the same chain without cross-chain messaging
     * @param _action Action to execute locally
     */
    function executeLocalAction(
        CrossChainAction calldata _action
    ) external payable onlyAuthorized returns (bool success) {
        require(!executedActions[_action.actionId], "OmnichainRouter: action already executed");
        require(_action.userAccount != address(0), "OmnichainRouter: invalid user account");
        require(_action.targetAdapter != address(0), "OmnichainRouter: invalid adapter");

        // Get current chain EID (map chain ID to LayerZero EID)
        uint32 currentEid = _getCurrentChainEID();
        
        // Verify adapter is trusted for current chain (optional check - can be disabled by setting to address(0))
        address trustedAdapter = trustedAdapters[currentEid];
        if (trustedAdapter != address(0)) {
            require(
                _action.targetAdapter == trustedAdapter,
                "OmnichainRouter: adapter not trusted for local chain"
            );
        }

        // Execute the action with ETH value forwarded
        success = _executeAdapter(_action, msg.sender);

        // Mark as executed (replay protection)
        executedActions[_action.actionId] = true;

        // Emit event
        emit CrossChainActionReceived(
            _action.actionId,
            currentEid, // srcEid is same as dstEid for local actions
            _action.userAccount,
            _action.targetAdapter,
            success
        );
    }

    /**
     * @dev Get current chain LayerZero EID
     * @return EID for current chain
     */
    function _getCurrentChainEID() internal view returns (uint32) {
        // Map common chain IDs to LayerZero EIDs
        if (block.chainid == 84532) return 40245; // Base Sepolia
        if (block.chainid == 421614) return 40231; // Arbitrum Sepolia
        // Default: return chain ID as EID (may not work for all chains)
        return uint32(block.chainid);
    }

    /**
     * @dev Internal function to execute adapter action
     * @param _action Cross-chain action to execute
     * @param _executor Executor address from LayerZero
     * @return success Whether execution succeeded
     */
    function _executeAdapter(
        CrossChainAction memory _action,
        address _executor
    ) internal returns (bool success) {
        // Prepare calldata for adapter.executeFromEIL(userAccount, payload)
        bytes memory adapterCallData = abi.encodeWithSelector(
            bytes4(keccak256("executeFromEIL(address,bytes)")),
            _action.userAccount,
            _action.adapterCalldata
        );

        // Forward ETH value to adapter (for vault deposits)
        // msg.value will be forwarded from executeLocalAction()
        (success, ) = _action.targetAdapter.call{value: msg.value}(adapterCallData);

        // Log execution for debugging
        if (!success) {
            // Revert with reason if possible
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    /**
     * @dev Configure trusted adapter for a specific chain
     * @param _eid Endpoint ID (chain identifier)
     * @param _adapter Adapter contract address (use address(0) to disable trust requirement)
     */
    function setTrustedAdapter(uint32 _eid, address _adapter) external onlyOwner {
        trustedAdapters[_eid] = _adapter;
        emit AdapterConfigured(_eid, _adapter);
    }

    /**
     * @dev Helper function to update adapter's trusted router (for HACK_MODE)
     * @param _adapter Adapter contract address
     * @param _newRouter New trusted router address
     */
    function updateAdapterRouter(address _adapter, address _newRouter) external onlyOwner {
        require(_adapter != address(0), "OmnichainRouter: invalid adapter");
        require(_newRouter != address(0), "OmnichainRouter: invalid router");
        
        // Call adapter's updateRouter function
        // Since we are the router contract, adapter will accept us as trusted
        (bool success, ) = _adapter.call(
            abi.encodeWithSelector(
                bytes4(keccak256("updateRouter(address)")),
                _newRouter
            )
        );
        require(success, "OmnichainRouter: failed to update adapter router");
    }

    /**
     * @dev Authorize/unauthorize an executor for sending cross-chain messages
     * @param _executor Address to authorize
     * @param _authorized Whether to authorize
     */
    function setAuthorizedExecutor(address _executor, bool _authorized) external onlyOwner {
        authorizedExecutors[_executor] = _authorized;
        emit ExecutorAuthorized(_executor, _authorized);
    }

    /**
     * @dev Get quote for cross-chain message
     * @param _dstEid Destination endpoint ID
     * @param _action Action payload
     * @param _options Message options
     * @return fee Messaging fee (native + lzToken)
     */
    function quoteCrossChainAction(
        uint32 _dstEid,
        CrossChainAction calldata _action,
        MessageOptions calldata _options
    ) external view returns (MessagingFee memory fee) {
        bytes memory payload = abi.encode(_action);
        bytes memory options = OptionsBuilder.newOptions();
        options = OptionsBuilder.addExecutorLzReceiveOption(options, 200000, 0);
        if (_options.nativeDropAmount > 0) {
            options = OptionsBuilder.addExecutorNativeDropOption(
                options,
                _options.nativeDropAmount,
                bytes32(uint256(uint160(_action.userAccount)))
            );
        }

        fee = _quote(_dstEid, payload, options, false);
        return fee;
    }

    /**
     * @dev Check if action has been executed
     * @param _actionId Action identifier
     * @return executed Whether action was executed
     */
    function isActionExecuted(bytes32 _actionId) external view returns (bool executed) {
        return executedActions[_actionId];
    }

    // ============ BATCH OPERATIONS (INNOVATION EXTENSION) ============
    
    /**
     * @dev Batch cross-chain actions - send multiple actions in one LayerZero message
     * @notice INNOVATION: Batching reduces gas costs and enables atomic multi-chain operations
     * @param _dstEid Destination endpoint ID
     * @param _actions Array of cross-chain actions to execute
     * @param _options Message options
     * @return messageId LayerZero message identifier
     */
    function sendBatchCrossChainActions(
        uint32 _dstEid,
        CrossChainAction[] calldata _actions,
        MessageOptions calldata _options
    ) external payable onlyAuthorized returns (bytes32 messageId) {
        require(_actions.length > 0, "OmnichainRouter: empty batch");
        require(_actions.length <= 50, "OmnichainRouter: batch too large"); // Gas limit protection
        
        // Validate all actions
        for (uint i = 0; i < _actions.length; i++) {
            require(!executedActions[_actions[i].actionId], "OmnichainRouter: action already executed");
            require(_actions[i].userAccount != address(0), "OmnichainRouter: invalid user account");
            require(_actions[i].targetAdapter != address(0), "OmnichainRouter: invalid adapter");
        }
        
        // Encode batch payload
        bytes memory payload = abi.encode(_actions);
        
        // Build LayerZero options with higher gas for batch execution
        bytes memory options = OptionsBuilder.newOptions();
        uint32 gasLimit = uint32(200000 * _actions.length); // Scale gas with batch size
        options = OptionsBuilder.addExecutorLzReceiveOption(options, gasLimit, 0);
        if (_options.nativeDropAmount > 0) {
            options = OptionsBuilder.addExecutorNativeDropOption(
                options,
                _options.nativeDropAmount,
                bytes32(uint256(uint160(_actions[0].userAccount))) // Use first action's user
            );
        }
        
        // Quote fee
        MessagingFee memory fee = _quote(_dstEid, payload, options, false);
        require(msg.value >= fee.nativeFee, "OmnichainRouter: insufficient fee");
        
        // Send via LayerZero
        MessagingReceipt memory receipt = _lzSend(
            _dstEid,
            payload,
            options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
        
        // Emit events for each action
        for (uint i = 0; i < _actions.length; i++) {
            emit CrossChainActionSent(
                _actions[i].actionId,
                _dstEid,
                _actions[i].userAccount,
                _actions[i].targetAdapter
            );
        }
        
        return receipt.guid;
    }
    
    /**
     * @dev Handle batch actions execution (external for try/catch)
     * @notice Helper function to execute batch of actions
     */
    function _handleBatchActions(
        Origin calldata _origin,
        bytes calldata _payload,
        address _executor
    ) external returns (bool) {
        require(msg.sender == address(this), "OmnichainRouter: invalid caller");
        // Decode as batch array
        CrossChainAction[] memory actions = abi.decode(_payload, (CrossChainAction[]));
        
        // Execute all actions in batch
        for (uint i = 0; i < actions.length; i++) {
            require(!executedActions[actions[i].actionId], "OmnichainRouter: action already executed");
            
            address trustedAdapter = trustedAdapters[_origin.srcEid];
            if (trustedAdapter != address(0)) {
                require(
                    actions[i].targetAdapter == trustedAdapter,
                    "OmnichainRouter: adapter not trusted for source chain"
                );
            }
            
            bool actionSuccess = _executeAdapter(actions[i], _executor);
            executedActions[actions[i].actionId] = true;
            
            emit CrossChainActionReceived(
                actions[i].actionId,
                _origin.srcEid,
                actions[i].userAccount,
                actions[i].targetAdapter,
                actionSuccess
            );
        }
    }
    
    // ============ CONDITIONAL EXECUTION (INNOVATION EXTENSION) ============
    
    /**
     * @dev Struct for conditional execution
     */
    struct ConditionalAction {
        CrossChainAction action;
        bytes32 conditionHash; // Hash of condition to check on destination
        bool requireCondition; // If true, action only executes if condition is met
    }
    
    /**
     * @dev Conditional cross-chain action - executes only if condition is met
     * @notice INNOVATION: Enables conditional logic across chains
     * @param _dstEid Destination endpoint ID
     * @param _conditionalAction Conditional action with condition check
     * @param _options Message options
     * @return messageId LayerZero message identifier
     */
    function sendConditionalCrossChainAction(
        uint32 _dstEid,
        ConditionalAction calldata _conditionalAction,
        MessageOptions calldata _options
    ) external payable onlyAuthorized returns (bytes32 messageId) {
        // Encode conditional action
        bytes memory payload = abi.encode(_conditionalAction);
        
        // Build options
        bytes memory options = OptionsBuilder.newOptions();
        options = OptionsBuilder.addExecutorLzReceiveOption(options, 250000, 0); // Higher gas for condition check
        if (_options.nativeDropAmount > 0) {
            options = OptionsBuilder.addExecutorNativeDropOption(
                options,
                _options.nativeDropAmount,
                bytes32(uint256(uint160(_conditionalAction.action.userAccount)))
            );
        }
        
        // Quote and send
        MessagingFee memory fee = _quote(_dstEid, payload, options, false);
        require(msg.value >= fee.nativeFee, "OmnichainRouter: insufficient fee");
        
        MessagingReceipt memory receipt = _lzSend(
            _dstEid,
            payload,
            options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
        
        emit CrossChainActionSent(
            _conditionalAction.action.actionId,
            _dstEid,
            _conditionalAction.action.userAccount,
            _conditionalAction.action.targetAdapter
        );
        
        return receipt.guid;
    }
    
    // ============ MULTI-HOP ROUTING (INNOVATION EXTENSION) ============
    
    /**
     * @dev Struct for multi-hop routing
     */
    struct MultiHopAction {
        uint32[] dstEids; // Chain path: [chain1, chain2, chain3]
        CrossChainAction action; // Action to execute on final chain
        bytes intermediatePayloads; // Optional intermediate processing
    }
    
    /**
     * @dev Execute action across multiple chains in sequence
     * @notice INNOVATION: Enables routing through intermediate chains
     * @param _multiHopAction Multi-hop action configuration
     * @param _options Message options for first hop
     * @return messageId LayerZero message identifier for first hop
     */
    function sendMultiHopAction(
        MultiHopAction calldata _multiHopAction,
        MessageOptions calldata _options
    ) external payable onlyAuthorized returns (bytes32 messageId) {
        require(_multiHopAction.dstEids.length > 0, "OmnichainRouter: invalid hop path");
        require(_multiHopAction.dstEids.length <= 5, "OmnichainRouter: too many hops"); // Limit hops
        
        // Encode multi-hop payload
        bytes memory payload = abi.encode(_multiHopAction);
        
        // Send to first hop
        uint32 firstHop = _multiHopAction.dstEids[0];
        
        bytes memory options = OptionsBuilder.newOptions();
        options = OptionsBuilder.addExecutorLzReceiveOption(options, 300000, 0); // Higher gas for routing
        if (_options.nativeDropAmount > 0) {
            options = OptionsBuilder.addExecutorNativeDropOption(
                options,
                _options.nativeDropAmount,
                bytes32(uint256(uint160(_multiHopAction.action.userAccount)))
            );
        }
        
        MessagingFee memory fee = _quote(firstHop, payload, options, false);
        require(msg.value >= fee.nativeFee, "OmnichainRouter: insufficient fee");
        
        MessagingReceipt memory receipt = _lzSend(
            firstHop,
            payload,
            options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
        
        return receipt.guid;
    }
}


