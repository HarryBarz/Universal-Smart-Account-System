# Quick Start Guide - Super Account MVP

## Fast Setup (5 minutes)

### 1. Install Dependencies

```bash
# Root
npm install

# Bundler
cd bundler && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure Environment

Copy environment variables (create `.env` from `.env.example` template in README):

```bash
# Required minimum config
RPC_CHAIN_A=https://sepolia.base.org
RPC_CHAIN_B=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY_BUNDLER=0x... # Your bundler wallet private key
HACK_MODE=true # Enable direct adapter calls
PORT=3001
```

### 3. Compile Contracts

```bash
npx hardhat compile
```

### 4. Deploy Contracts

```bash
# Deploy to Chain A (Base Sepolia)
npx hardhat run --network chainA scripts/deployAdapters.js

# Deploy to Chain B (Arbitrum Sepolia)
npx hardhat run --network chainB scripts/deployAdapters.js

# Deploy SuperAccount (on Chain A)
npx hardhat run --network chainA scripts/deployAccount.js
```

Save deployed addresses from `deployments.json` to your `.env`:

```bash
SWAP_ADAPTER_ADDRESS=0x...
NFT_ADAPTER_ADDRESS=0x...
SUPER_ACCOUNT_ADDRESS=0x...
EIL_ROUTER_ADDRESS=0x...
```

### 5. Update Adapter Trusted Routers

Update each adapter's `trustedRouter` to your bundler address:

```bash
# Using Hardhat console or a script
npx hardhat console --network chainA
> const SwapAdapter = await ethers.getContractFactory("SwapAdapter")
> const swap = SwapAdapter.attach("SWAP_ADAPTER_ADDRESS")
> await swap.updateRouter("YOUR_BUNDLER_ADDRESS")
```

Repeat for NFTAdapter on Chain B.

### 6. Start Services

**Terminal 1 - Bundler:**
```bash
node bundler/index.js
```

**Terminal 2 - Frontend:**
```bash
cd frontend && npm run dev
```

### 7. Test the Flow

1. Open http://localhost:3000
2. Connect MetaMask
3. Upload an image file
4. Click "Sign & Execute"
5. Approve signature in MetaMask
6. View transaction links

## Troubleshooting

**"Bundler private key not configured"**
- Set `PRIVATE_KEY_BUNDLER` in `.env`

**"Adapter not trusted router"**
- Update adapter's `trustedRouter` address

**"EntryPoint not found"**
- Use standard EntryPoint: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`

**Contract compilation errors**
- Ensure Hardhat is installed: `npm install --save-dev hardhat`
- Check Solidity version: `^0.8.19`

**Frontend build errors**
- Clear `.next` folder: `rm -rf frontend/.next`
- Reinstall dependencies: `cd frontend && rm -rf node_modules && npm install`

## Verification Checklist

- [ ] Contracts compiled successfully
- [ ] Contracts deployed to testnets
- [ ] Adapter addresses saved to `.env`
- [ ] Adapter trusted routers updated
- [ ] Bundler running on port 3001
- [ ] Frontend running on port 3000
- [ ] Wallet connected with testnet ETH
- [ ] File upload returns CID
- [ ] Signature submits successfully
- [ ] Transaction links display correctly

## Next Steps

- Review `/README.md` for detailed documentation
- Check `/doc/EIL_payload_examples.json` for payload structure
- See `/doc/demo_shorts.md` for demo preparation
- Run tests: `npx hardhat test`

## Demo Preparation

1. Have testnet ETH ready on both chains
2. Prepare a test image file
3. Bookmark explorer links:
   - Base Sepolia: https://sepolia.basescan.org
   - Arbitrum Sepolia: https://sepolia.arbiscan.io
4. Test the full flow once before demo
5. Record screen for submission video

Good luck!

