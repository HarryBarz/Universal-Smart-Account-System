// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

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
    
    // Yield generation
    uint256 public apyRate; // APY in basis points (e.g., 500 = 5%)
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    
    // Track user deposits for yield calculation
    mapping(address => uint256) public userDepositTimestamps; // Last deposit timestamp
    mapping(address => uint256) public userLastYieldAccrual; // Last time yield was calculated
    
    // Accumulated yield per user
    mapping(address => uint256) public userAccumulatedYield;
    
    // Total yield generated across all chains
    uint256 public totalYieldGenerated;
    
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
    
    constructor(address _token, address _router, uint256 _apyRate) {
        // Allow address(0) for native ETH deposits (MVP)
        // require(_token != address(0), "OmnichainVault: invalid token");
        require(_router != address(0), "OmnichainVault: invalid router");
        token = _token; // address(0) means native ETH
        router = _router;
        owner = msg.sender;
        apyRate = _apyRate; // APY in basis points (e.g., 500 = 5%)
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
     * @dev Deposit tokens on behalf of a user (called by router/adapter)
     * @param user User address to credit the deposit to
     * @param amount Amount to deposit
     */
    function depositFor(address user, uint256 amount) external payable onlyRouter {
        require(user != address(0), "OmnichainVault: invalid user");
        require(amount > 0, "OmnichainVault: amount must be > 0");
        
        // Accrue yield for user before updating balance
        _accrueYield(user);
        
        // For native ETH deposits (token == address(0)), require msg.value to match amount
        if (token == address(0)) {
            require(msg.value == amount, "OmnichainVault: msg.value must equal amount for native ETH");
            // ETH is automatically sent to this contract via payable
        } else {
            // For ERC20 tokens, transfer from router to vault
            // The router should have approved this vault to spend tokens
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "OmnichainVault: token transfer failed");
        }
        
        // Update balances for the specified user
        userBalances[user] += amount;
        chainBalances[getChainId()] += amount;
        userChainBalances[user][getChainId()] += amount;
        totalSupply += amount;
        
        // Update deposit timestamp for yield calculation
        if (userDepositTimestamps[user] == 0) {
            userDepositTimestamps[user] = block.timestamp;
        }
        userLastYieldAccrual[user] = block.timestamp;
        
        emit Deposit(user, getChainId(), amount, userBalances[user]);
    }
    
    /**
     * @dev Withdraw tokens on this chain
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external {
        require(amount > 0, "OmnichainVault: amount must be > 0");
        
        // Accrue yield before withdrawal
        _accrueYield(msg.sender);
        
        // Check balance after yield accrual
        uint256 totalBalance = userBalances[msg.sender] + userAccumulatedYield[msg.sender];
        require(totalBalance >= amount, "OmnichainVault: insufficient balance");
        
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
        
        // Deduct from accumulated yield first, then from principal
        if (userAccumulatedYield[user] > 0 && userAccumulatedYield[user] >= amount) {
            // Withdraw from yield only
            userAccumulatedYield[user] -= amount;
            totalYieldGenerated -= amount;
        } else if (userAccumulatedYield[user] > 0) {
            // Withdraw yield first, then principal
            uint256 yieldToWithdraw = userAccumulatedYield[user];
            uint256 principalToWithdraw = amount - yieldToWithdraw;
            
            userAccumulatedYield[user] = 0;
            totalYieldGenerated -= yieldToWithdraw;
            
            userBalances[user] -= principalToWithdraw;
            chainBalances[chainId] -= principalToWithdraw;
            userChainBalances[user][chainId] -= principalToWithdraw;
            totalSupply -= principalToWithdraw;
        } else {
            // Withdraw from principal only
            userBalances[user] -= amount;
            chainBalances[chainId] -= amount;
            userChainBalances[user][chainId] -= amount;
            totalSupply -= amount;
        }
        
        // Transfer tokens to user
        // In production: IERC20(token).transfer(user, amount);
        // For native ETH:
        if (token == address(0)) {
            payable(user).transfer(amount);
        }
        
        uint256 remainingBalance = userBalances[user] + userAccumulatedYield[user];
        emit Withdraw(user, chainId, amount, remainingBalance);
    }
    
    /**
     * @dev Accrue yield for a user based on time and balance
     */
    function _accrueYield(address user) internal {
        if (userBalances[user] == 0 || apyRate == 0) {
            userLastYieldAccrual[user] = block.timestamp;
            return;
        }
        
        uint256 lastAccrual = userLastYieldAccrual[user];
        if (lastAccrual == 0) {
            lastAccrual = userDepositTimestamps[user];
            if (lastAccrual == 0) {
                userLastYieldAccrual[user] = block.timestamp;
                return;
            }
        }
        
        uint256 timeElapsed = block.timestamp - lastAccrual;
        if (timeElapsed == 0) return;
        
        // Calculate yield: principal * APY * timeElapsed / SECONDS_PER_YEAR
        // APY is in basis points (e.g., 500 = 5%)
        uint256 principal = userBalances[user];
        uint256 yield = (principal * apyRate * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
        if (yield > 0) {
            userAccumulatedYield[user] += yield;
            totalYieldGenerated += yield;
        }
        
        userLastYieldAccrual[user] = block.timestamp;
    }
    
    /**
     * @dev Calculate pending yield for a user (without modifying state)
     */
    function calculatePendingYield(address user) external view returns (uint256) {
        if (userBalances[user] == 0 || apyRate == 0) return 0;
        
        uint256 lastAccrual = userLastYieldAccrual[user];
        if (lastAccrual == 0) {
            lastAccrual = userDepositTimestamps[user];
            if (lastAccrual == 0) return 0;
        }
        
        uint256 timeElapsed = block.timestamp - lastAccrual;
        if (timeElapsed == 0) return 0;
        
        uint256 principal = userBalances[user];
        uint256 yield = (principal * apyRate * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
        return userAccumulatedYield[user] + yield;
    }
    
    /**
     * @dev Get user's total balance across all chains (including accrued yield)
     */
    function getTotalBalance(address user) external view returns (uint256) {
        uint256 pendingYield = this.calculatePendingYield(user);
        return userBalances[user] + pendingYield;
    }
    
    /**
     * @dev Get user's principal balance (excluding yield)
     */
    function getPrincipalBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }
    
    /**
     * @dev Get user's accrued yield
     */
    function getAccruedYield(address user) external view returns (uint256) {
        return userAccumulatedYield[user];
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
    
    /**
     * @dev Update APY rate (owner only)
     * @param _apyRate APY in basis points (e.g., 500 = 5%)
     */
    function setAPYRate(uint256 _apyRate) external onlyOwner {
        require(_apyRate <= BASIS_POINTS * 100, "OmnichainVault: APY too high"); // Max 100%
        apyRate = _apyRate;
    }
    
    /**
     * @dev Get current APY rate
     */
    function getAPYRate() external view returns (uint256) {
        return apyRate;
    }
    
    /**
     * @dev Receive ETH (for native deposits)
     */
    receive() external payable {
        // Allow receiving ETH for deposits
    }
}

