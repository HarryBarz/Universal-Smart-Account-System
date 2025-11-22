// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title OmnichainVault
 * @dev Vault that aggregates deposits/withdrawals across multiple L2s via LayerZero
 * @notice Users deposit on any chain, and can withdraw from any other chain seamlessly
 */
contract OmnichainVault {
    address public router; // OmnichainSuperAccountRouter
    address public owner;
    
    // Token being vaulted
    address public immutable token;
    
    // User balances aggregated across all chains
    mapping(address => uint256) public userBalances;
    
    // Chain-specific balances (for accounting)
    mapping(uint32 => uint256) public chainBalances; // EID => total balance on that chain
    
    // User's chain-specific deposits
    mapping(address => mapping(uint32 => uint256)) public userChainBalances;
    
    // Total supply across all chains
    uint256 public totalSupply;
    
    event Deposit(
        address indexed user,
        uint32 chainId,
        uint256 amount,
        uint256 totalUserBalance
    );
    
    event Withdraw(
        address indexed user,
        uint32 chainId,
        uint256 amount,
        uint256 totalUserBalance
    );
    
    event CrossChainDeposit(
        address indexed user,
        uint32 srcChainId,
        uint32 dstChainId,
        uint256 amount
    );
    
    event CrossChainWithdraw(
        address indexed user,
        uint32 srcChainId,
        uint32 dstChainId,
        uint256 amount
    );
    
    modifier onlyRouter() {
        require(msg.sender == router, "OmnichainVault: not router");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "OmnichainVault: not owner");
        _;
    }
    
    constructor(address _token, address _router) {
        // Allow address(0) for native ETH deposits (MVP)
        // require(_token != address(0), "OmnichainVault: invalid token");
        require(_router != address(0), "OmnichainVault: invalid router");
        token = _token; // address(0) means native ETH
        router = _router;
        owner = msg.sender;
    }
    
    /**
     * @dev Deposit tokens on this chain
     * @param amount Amount to deposit
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "OmnichainVault: amount must be > 0");
        
        // Transfer tokens from user
        // In production: IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        // Update balances
        userBalances[msg.sender] += amount;
        chainBalances[getChainId()] += amount;
        userChainBalances[msg.sender][getChainId()] += amount;
        totalSupply += amount;
        
        emit Deposit(msg.sender, getChainId(), amount, userBalances[msg.sender]);
    }
    
    /**
     * @dev Withdraw tokens on this chain
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external {
        require(amount > 0, "OmnichainVault: amount must be > 0");
        require(userBalances[msg.sender] >= amount, "OmnichainVault: insufficient balance");
        
        // Check if this chain has enough balance
        uint32 currentChainId = getChainId();
        uint256 localBalance = userChainBalances[msg.sender][currentChainId];
        
        if (localBalance >= amount) {
            // Withdraw locally
            _withdrawLocal(msg.sender, amount);
        } else {
            // Need cross-chain withdrawal
            uint256 remainingAmount = amount - localBalance;
            
            // Withdraw available local balance first
            if (localBalance > 0) {
                _withdrawLocal(msg.sender, localBalance);
                amount = remainingAmount;
            }
            
            // Trigger cross-chain withdrawal
            // This will be handled by the router sending a message to another chain
            revert("OmnichainVault: cross-chain withdrawal needed - use withdrawCrossChain()");
        }
    }
    
    /**
     * @dev Execute cross-chain deposit (called by router when receiving LayerZero message)
     * @param user User account
     * @param srcChainId Source chain EID
     * @param amount Amount being deposited cross-chain
     */
    function executeCrossChainDeposit(
        address user,
        uint32 srcChainId,
        uint256 amount
    ) external onlyRouter {
        require(amount > 0, "OmnichainVault: invalid amount");
        
        // Update balances - balance moves from source chain to this chain
        userBalances[user] += amount;
        chainBalances[getChainId()] += amount;
        userChainBalances[user][getChainId()] += amount;
        
        // Reduce balance on source chain (will be synced via LayerZero)
        userChainBalances[user][srcChainId] = 
            userChainBalances[user][srcChainId] >= amount 
                ? userChainBalances[user][srcChainId] - amount 
                : 0;
        
        emit CrossChainDeposit(user, srcChainId, getChainId(), amount);
    }
    
    /**
     * @dev Execute cross-chain withdrawal (called by router when receiving LayerZero message)
     * @param user User account
     * @param dstChainId Destination chain EID
     * @param amount Amount to withdraw on destination chain
     */
    function executeCrossChainWithdraw(
        address user,
        uint32 dstChainId,
        uint256 amount
    ) external onlyRouter {
        require(amount > 0, "OmnichainVault: invalid amount");
        require(userBalances[user] >= amount, "OmnichainVault: insufficient balance");
        
        uint32 currentChainId = getChainId();
        
        // Deduct from this chain
        uint256 availableHere = userChainBalances[user][currentChainId];
        if (availableHere >= amount) {
            userChainBalances[user][currentChainId] -= amount;
            chainBalances[currentChainId] -= amount;
        } else {
            // Take from other chains if needed
            userChainBalances[user][currentChainId] = 0;
            chainBalances[currentChainId] = chainBalances[currentChainId] >= availableHere 
                ? chainBalances[currentChainId] - availableHere 
                : 0;
        }
        
        // Update global balance
        userBalances[user] -= amount;
        totalSupply -= amount;
        
        // The actual withdrawal will happen on destination chain
        emit CrossChainWithdraw(user, currentChainId, dstChainId, amount);
    }
    
    /**
     * @dev Internal function to withdraw locally
     */
    function _withdrawLocal(address user, uint256 amount) internal {
        uint32 chainId = getChainId();
        
        userBalances[user] -= amount;
        chainBalances[chainId] -= amount;
        userChainBalances[user][chainId] -= amount;
        totalSupply -= amount;
        
        // Transfer tokens to user
        // In production: IERC20(token).transfer(user, amount);
        
        emit Withdraw(user, chainId, amount, userBalances[user]);
    }
    
    /**
     * @dev Get user's total balance across all chains
     */
    function getTotalBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }
    
    /**
     * @dev Get user's balance on a specific chain
     */
    function getChainBalance(address user, uint32 chainId) external view returns (uint256) {
        return userChainBalances[user][chainId];
    }
    
    /**
     * @dev Get current chain ID (EID format for LayerZero)
     */
    function getChainId() internal view returns (uint32) {
        // This should return the LayerZero EID for current chain
        // For now, return chain ID - in production use LayerZero EID mapping
        return uint32(block.chainid);
    }
    
    /**
     * @dev Update router address (owner only)
     */
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "OmnichainVault: invalid router");
        router = _router;
    }
}

