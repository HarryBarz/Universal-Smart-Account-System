# Omnichain Vault - Usage Examples

## What This Enables

Users can deposit tokens on ANY L2 and withdraw from ANY OTHER L2 seamlessly. All managed through a single unified balance via LayerZero.

## Example Scenarios

### Scenario 1: Deposit on Base, Withdraw on Arbitrum

**User Experience:**
1. User connects wallet to frontend
2. User deposits 100 USDC on Base Sepolia
3. User travels/needs funds on Arbitrum
4. User withdraws 50 USDC on Arbitrum Sepolia
5. System automatically uses LayerZero to coordinate the withdrawal

**Technical Flow:**
```
User (on Base) deposits 100 USDC
  ↓
OmnichainVault (Base) records deposit
  ↓
User balance = 100 USDC (accessible from any chain)
  ↓
User (on Arbitrum) requests 50 USDC withdrawal
  ↓
VaultAdapter (Arbitrum) sends LayerZero message to Base
  ↓
OmnichainVault (Base) executes cross-chain withdrawal
  ↓
LayerZero message confirms withdrawal
  ↓
VaultAdapter (Arbitrum) releases 50 USDC to user
  ↓
User balance = 50 USDC remaining
```

### Scenario 2: Multi-Chain Deposit Strategy

**User deposits on multiple chains:**
- 50 USDC on Base Sepolia
- 30 USDC on Arbitrum Sepolia  
- 20 USDC on Optimism (future)

**Result:**
- Total balance = 100 USDC (visible everywhere)
- Can withdraw any amount from any chain
- System automatically routes funds via LayerZero

### Scenario 3: Cross-Chain Yield Optimization

**User Experience:**
1. Deposit 1000 USDC on Base
2. Base chain is full (high gas)
3. User switches to Arbitrum (lower gas)
4. Withdraws 500 USDC on Arbitrum
5. System automatically coordinates via LayerZero
6. Remaining 500 USDC still available on Base

## API Functions

### Deposit Locally
```javascript
// User deposits on current chain
vault.deposit(amount);
```

### Withdraw Locally (if balance available)
```javascript
// User withdraws from current chain
vault.withdraw(amount);
```

### Cross-Chain Withdrawal
```javascript
// System automatically handles via LayerZero
// User just calls withdraw() - vault checks local balance
// If insufficient, triggers cross-chain via router
```

## Integration with Existing System

**Uses Existing LayerZero Infrastructure:**
- `OmnichainSuperAccountRouter` handles message routing
- `VaultAdapter` deployed on each chain
- `OmnichainVault` maintains unified balance state
- All connected via LayerZero messages

**Works with SuperAccount:**
- User signs once via ERC-4337
- SuperAccount triggers vault operations
- Actions execute across chains via LayerZero
- Filecoin stores transaction history

## Example Code Flow

```javascript
// 1. User wants to deposit 100 USDC on Base
const depositAction = buildVaultCrossChainAction(
    userAccount,
    vaultAdapterBase,
    "deposit",
    ethers.parseUnits("100", 6), // 100 USDC
    0 // No target chain for local deposit
);

// 2. Send via LayerZero router (on Base)
router.sendCrossChainAction(
    BASE_EID,
    depositAction,
    messageOptions
);

// 3. VaultAdapter receives and executes
// OmnichainVault.deposit(100) is called
// User balance updated: +100 USDC

// 4. Later, user wants to withdraw on Arbitrum
const withdrawAction = buildVaultCrossChainAction(
    userAccount,
    vaultAdapterArbitrum,
    "withdraw",
    ethers.parseUnits("50", 6), // 50 USDC
    BASE_EID // Source chain for funds
);

// 5. LayerZero message sent from Arbitrum to Base
// Base vault executes cross-chain withdrawal
// Arbitrum vault releases 50 USDC to user
```

## Key Benefits

1. **Single Unified Balance** - See total across all chains
2. **Withdraw Anywhere** - Withdraw from any L2 you're on
3. **No Manual Bridging** - LayerZero handles cross-chain automatically
4. **One Signature** - Works with SuperAccount for single-signature experience
5. **Seamless UX** - User doesn't know which chain has liquidity

## Future Extensions

- Yield generation on deposits
- Automatic rebalancing across chains
- Cross-chain lending/borrowing
- Multi-asset vault support
- Governance across chains

