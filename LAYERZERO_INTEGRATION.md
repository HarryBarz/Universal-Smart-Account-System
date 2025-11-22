# LayerZero Integration Guide

## Status

**LayerZero integration is now implemented!**

The project includes a working LayerZero integration with automatic fallback to HACK_MODE if LayerZero is unavailable.

## How It Works

### 1. Bundler Integration

The bundler (`bundler/index.js`) now includes full LayerZero support:

- **LayerZero Message Sending**: Uses LayerZero V2 Endpoint contract to send cross-chain messages
- **Fee Quoting**: Automatically quotes fees for cross-chain messages
- **Automatic Fallback**: Falls back to direct adapter calls (HACK_MODE) if LayerZero fails

### 2. LayerZero Contracts

Two new contracts have been added:

- **`LayerZeroOApp.sol`**: Base OApp contract for receiving LayerZero messages
- **`LayerZeroRouter.sol`**: Router contract that receives LayerZero messages and forwards to adapters

### 3. Configuration

Set these environment variables to use LayerZero:

```bash
# Disable HACK_MODE
HACK_MODE=false

# LayerZero Endpoint Addresses (testnet)
LAYER0_ENDPOINT_CHAIN_A=0x6EDCE65403992e310A62460808c4b910D972f10f  # Base Sepolia
LAYER0_ENDPOINT_CHAIN_B=0x6EDCE65403992e310A62460808c4b910D972f10f  # Arbitrum Sepolia

# LayerZero Endpoint IDs (testnet)
LAYER0_EID_CHAIN_A=40245  # Base Sepolia testnet
LAYER0_EID_CHAIN_B=40231  # Arbitrum Sepolia testnet
```

## Using LayerZero vs HACK_MODE

### With LayerZero (Recommended)

1. Set `HACK_MODE=false` in `.env`
2. Configure LayerZero endpoint addresses and EIDs
3. Deploy LayerZeroRouter contracts on both chains
4. Configure routers to receive messages and forward to adapters

### With HACK_MODE (Fallback)

1. Set `HACK_MODE=true` in `.env`
2. Bundler directly calls adapter contracts on target chains
3. Simpler setup, but doesn't use LayerZero protocol
4. Works without LayerZero configuration

## Message Flow

### LayerZero Flow:

```
User → Frontend → Bundler → LayerZero Endpoint (Chain A)
                                    ↓
                            LayerZero Protocol
                                    ↓
                            LayerZero Endpoint (Chain B)
                                    ↓
                            LayerZeroRouter → Adapter
```

### HACK_MODE Flow:

```
User → Frontend → Bundler → Direct Contract Call (Chain A/B)
                                    ↓
                                Adapter
```

## Deployment Steps for LayerZero

### 1. Deploy LayerZeroRouter on Both Chains

```bash
# On Chain A (Base Sepolia)
npx hardhat run scripts/deployLayerZeroRouter.js --network chainA

# On Chain B (Arbitrum Sepolia)
npx hardhat run scripts/deployLayerZeroRouter.js --network chainB
```

### 2. Configure Routers

Set adapter addresses on each router:

```javascript
// On Chain A
await layerZeroRouterA.setAdapter(CHAIN_B_EID, nftAdapterAddress);

// On Chain B
await layerZeroRouterB.setAdapter(CHAIN_A_EID, swapAdapterAddress);
```

### 3. Update Adapters

Update adapters' trusted router to the LayerZeroRouter address instead of bundler:

```javascript
await swapAdapter.updateRouter(layerZeroRouterA);
await nftAdapter.updateRouter(layerZeroRouterB);
```

### 4. Configure Bundler

Set environment variables and restart bundler:

```bash
HACK_MODE=false
LAYER0_ENDPOINT_CHAIN_A=0x...
LAYER0_ENDPOINT_CHAIN_B=0x...
LAYER0_EID_CHAIN_A=40245
LAYER0_EID_CHAIN_B=40231
```

## Testing

### Test LayerZero Integration

1. Start bundler with `HACK_MODE=false`
2. Check health endpoint: `curl http://localhost:3001/health`
3. Should show `"mode": "LAYERZERO"`
4. Submit a test payload through frontend
5. Check transaction on source chain (should be LayerZero Endpoint call)
6. Wait for message delivery (LayerZero usually takes 1-2 minutes)
7. Check destination chain for adapter execution

### Test HACK_MODE Fallback

1. Start bundler with `HACK_MODE=true`
2. Or leave LayerZero endpoints unconfigured
3. Bundler will automatically use direct calls
4. Check health endpoint: should show `"mode": "HACK_MODE"`

## Troubleshooting

**"LayerZero endpoint not configured"**
- Set `LAYER0_ENDPOINT_CHAIN_A` and `LAYER0_ENDPOINT_CHAIN_B` in `.env`
- Verify endpoint addresses are correct for testnet

**"Fee quote failed"**
- Bundler will use default fee (0.001 ETH)
- Ensure bundler wallet has sufficient balance

**"Message not delivered"**
- LayerZero messages take 1-2 minutes to deliver
- Check LayerZero explorer: https://layerzeroscan.com/
- Verify LayerZeroRouter is configured correctly

**Falling back to HACK_MODE automatically**
- This is expected if LayerZero fails
- Check bundler logs for error messages
- Ensure LayerZero contracts are deployed and configured

## LayerZero Testnet Endpoints

According to LayerZero V2 documentation:

- **Base Sepolia**: EID `40245`, Endpoint `0x6EDCE65403992e310A62460808c4b910D972f10f`
- **Arbitrum Sepolia**: EID `40231`, Endpoint `0x6EDCE65403992e310A62460808c4b910D972f10f`

For mainnet endpoints, see: https://docs.layerzero.network/v2/deployments/deployed-contracts

## Integration Status

- **Bundler**: Fully integrated with LayerZero V2 Endpoint  
- **Contracts**: LayerZeroRouter contracts created  
- **Deployment**: Router deployment scripts needed  
- **Configuration**: Router setup scripts needed  

For MVP/hackathon, HACK_MODE is sufficient and easier to demo. LayerZero integration provides the full production-ready cross-chain solution.

