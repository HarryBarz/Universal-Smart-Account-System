# EIL SDK Integration Plan

## Current Status

**Problem:** Project currently uses CUSTOM payload builders, NOT the official EIL SDK. This means it won't qualify for the EIL SDK prize ($6,000).

**Solution:** Integrate the official EIL SDK alongside LayerZero to qualify for BOTH prizes.

## What's Needed

According to [EIL SDK documentation](https://docs.ethereuminteroplayer.com/), we need:

1. **Install official packages:**
   - `@eil-protocol/sdk` (v0.1.2+)
   - `@eil-protocol/accounts` (v0.1.2+)
   - `viem` (v2.39.3)
   - `wagmi` (v2.19.1) for React integration

2. **Use official EIL SDK classes:**
   - `CrossChainSdk` - Main SDK instance
   - `CrossChainBuilder` - Builder for cross-chain operations
   - `BatchBuilder` - Builder for actions on a specific chain
   - Official actions: `VoucherRequestAction`, `TransferAction`, `ApproveAction`, `FunctionCallAction`, `CallAction`

3. **Create MultiChainSmartAccount:**
   - `BaseMultichainSmartAccount` or `AmbireMultiChainSmartAccount`
   - Requires `WalletClient` from viem/wagmi

4. **Demonstrate actual usage:**
   - Use `CrossChainBuilder` to create cross-chain operations
   - Use official EIL actions (VoucherRequestAction, TransferAction, etc.)
   - Submit actual UserOperations that use EIL SDK
   - Include transaction payloads in submission

## Integration Strategy

**Dual Approach:** Use EIL SDK for TOKEN OPERATIONS, LayerZero for OTHER OPERATIONS

This demonstrates:
- ✅ EIL SDK usage (qualifies for EIL prize)
- ✅ LayerZero usage (qualifies for LayerZero prize)
- ✅ Hybrid approach showing both protocols working together

## Implementation Steps

### 1. Install Dependencies

```bash
npm install @eil-protocol/sdk@^0.1.2 @eil-protocol/accounts@^0.1.2
cd frontend
npm install @eil-protocol/sdk@^0.1.2 @eil-protocol/accounts@^0.1.2 viem@^2.39.3 wagmi@^2.19.1
```

### 2. Create EIL SDK Integration File

Create `frontend/utils/eilIntegration.js`:
- Initialize `CrossChainSdk`
- Create `MultiChainSmartAccount` instance
- Build cross-chain operations using official `CrossChainBuilder`
- Use official EIL actions like `VoucherRequestAction`, `TransferAction`

### 3. Update SignFlow to Use EIL SDK

Modify `frontend/components/SignFlow.js`:
- Add option to use EIL SDK for token operations
- Keep LayerZero for NFT minting and other operations
- Show both approaches working together

### 4. Update Bundler to Handle EIL Operations

Modify `bundler/index.js`:
- Detect EIL SDK operations vs LayerZero operations
- Route EIL operations through official EIL protocol
- Route LayerZero operations through OmnichainSuperAccountRouter

### 5. Document EIL SDK Usage

Create clear documentation showing:
- EIL SDK installation
- EIL SDK initialization
- Cross-chain operations using EIL SDK
- Transaction payloads demonstrating EIL SDK usage

## Example EIL SDK Usage

```typescript
import { CrossChainSdk } from '@eil-protocol/sdk'
import { AmbireMultiChainSmartAccount } from '@eil-protocol/accounts'
import { VoucherRequestAction, TransferAction } from '@eil-protocol/sdk'

// Initialize EIL SDK
const sdk = new CrossChainSdk()

// Create builder
const builder = sdk.createBuilder()

// Create batch for Chain A
const batchA = builder.startBatch(chainIdA)
batchA.addAction(new VoucherRequestAction({
  destinationChainId: chainIdB,
  tokens: [{ token: usdcAddress, amount: amount }]
}))

// Create batch for Chain B  
const batchB = builder.startBatch(chainIdB)
batchB.useAllVouchers() // Use vouchers from Chain A
batchB.addAction(new TransferAction({
  token: usdcAddress,
  to: recipient,
  amount: amount
}))

// Build, sign, and execute
const executor = await builder.buildAndSign()
await executor.execute((type, batch, index, reason) => {
  console.log('EIL operation:', type, batch, index, reason)
})
```

## What This Achieves

✅ **EIL SDK Prize Qualification:** Demonstrates actual usage of official EIL SDK with transaction payloads

✅ **LayerZero Prize Qualification:** Continues to use LayerZero for NFT operations and cross-chain routing

✅ **Hybrid Innovation:** Shows how EIL SDK and LayerZero can work together

✅ **Real Transaction Payloads:** All operations submit actual UserOperations with EIL SDK structure

## Next Steps

1. Install EIL SDK packages
2. Create EIL SDK integration file
3. Update frontend to use EIL SDK for token operations
4. Update bundler to route EIL operations
5. Test end-to-end with actual EIL SDK UserOperations
6. Document EIL SDK usage in submission

## Important Notes

- EIL SDK requires ERC-4337 EntryPoint v0.9 (we already use this)
- EIL SDK requires Smart Account with MultiChain support
- EIL SDK uses Vouchers for cross-chain asset movement (different from LayerZero's messaging)
- Can use both EIL SDK (for assets) and LayerZero (for operations) in the same flow

