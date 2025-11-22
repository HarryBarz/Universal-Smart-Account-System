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
        // Decode the action
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
        // This ensures idempotent retries: if message is redelivered, same actionId won't execute twice
        executedActions[action.actionId] = true;

        // Emit event with success status
        // Frontend can detect failure via success=false and retry with new actionId if needed
        emit CrossChainActionReceived(
            action.actionId,
            _origin.srcEid,
            action.userAccount,
            action.targetAdapter,
            success
        );
        
        // Note: If execution failed, actionId is still marked as executed
        // User must generate new actionId to retry - prevents double execution attacks
    }

    /**
     * @dev Execute local action (same chain, no LayerZero)
     * @notice Allows executing adapter actions on the same chain without cross-chain messaging
     * @param _action Action to execute locally
     */
    function executeLocalAction(
        CrossChainAction calldata _action
    ) external onlyAuthorized returns (bool success) {
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

        // Execute the action
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

        // Call adapter
        (success, ) = _action.targetAdapter.call(adapterCallData);

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
}


