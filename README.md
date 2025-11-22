# Super Account MVP

**Chain-Abstracted Super Account** that enables a single user signature to trigger actions on multiple L2 chains and store NFT metadata on Filecoin.

## Project Summary

This project demonstrates a minimal, demo-ready **Chain-Abstracted Super Account** that proves a single user signature can cause actions on **two L2s** (Base Sepolia and Arbitrum Sepolia) and upload NFT metadata to **Filecoin Onchain Cloud (Synapse SDK)**. Built using **ERC-4337 / EIL SDK** for UserOperations and **LayerZero** for cross-chain messaging.

## Architecture

```
User (Browser)
  ↓ (1 signature)
Frontend (Next.js)
  ↓ (signed UserOp + EIL payload)
Bundler/Orchestrator (Node.js)
  ↓
1. Submit UserOp to EntryPoint (ERC-4337)
2. Send cross-chain messages via LayerZero (or HACK_MODE direct calls)
  ↓
Chain A (Base Sepolia): SwapAdapter executes swap
Chain B (Arbitrum Sepolia): NFTAdapter mints NFT with Filecoin CID
```

## Project Structure

```
/
├── README.md                 # This file
├── hardhat.config.js        # Hardhat configuration
├── package.json             # Root dependencies
├── contracts/
│   ├── SuperAccount.sol     # ERC-4337 smart account
│   ├── EILRouter.sol        # Router accepting EIL payloads
│   ├── NFTAdapter.sol       # NFT minting on Chain B
│   └── SwapAdapter.sol      # Swap execution on Chain A
├── scripts/
│   ├── deployAdapters.js    # Deploy adapters to chains
│   └── deployAccount.js     # Deploy SuperAccount and EILRouter
├── bundler/
│   ├── index.js             # Orchestrator service
│   └── buildPayload.js      # EIL payload builder
├── frontend/
│   ├── pages/
│   │   └── index.js         # Main UI page
│   ├── components/
│   │   └── SignFlow.js      # Signature flow component
│   └── utils/
│       └── buildPayload.js  # Client-side payload builder
├── tests/
│   └── superAccount.test.js # Contract tests
└── doc/
    └── EIL_payload_examples.json  # Example EIL payloads
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- MetaMask or compatible Web3 wallet
- Testnet ETH on Base Sepolia and Arbitrum Sepolia
- (Optional) Filecoin Synapse SDK API key

### Installation

1. **Clone and install dependencies:**

```bash
# Install root dependencies
npm install

# Install bundler dependencies
cd bundler && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

2. **Set up environment variables:**

Create a `.env` file in the root directory:

```bash
# Chain A (Base Sepolia Testnet)
RPC_CHAIN_A=https://sepolia.base.org
CHAIN_A_ID=84532

# Chain B (Arbitrum Sepolia Testnet)
RPC_CHAIN_B=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_B_ID=421614

# EntryPoint Address (ERC-4337)
ENTRYPOINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

# Bundler Private Key (for submitting UserOps and cross-chain messages)
PRIVATE_KEY_BUNDLER=0x...

# LayerZero Configuration (if using LayerZero SDK)
LAYER0_ENDPOINT_CHAIN_A=0x6EDCE65403992e310A62460808c4b910D972f10f
LAYER0_ENDPOINT_CHAIN_B=0x6EDCE65403992e310A62460808c4b910D972f10f
LAYER0_EID_CHAIN_A=40245
LAYER0_EID_CHAIN_B=40231

# Filecoin Synapse SDK Configuration
SYNAPSE_API_KEY=your_synapse_api_key_here
SYNAPSE_API_URL=https://api.filecoin.cloud

# HACK_MODE: Use direct adapter calls instead of LayerZero
HACK_MODE=true

# Network Private Keys (for deployment)
PRIVATE_KEY_CHAIN_A=0x...
PRIVATE_KEY_CHAIN_B=0x...
```

3. **Compile contracts:**

```bash
npx hardhat compile
```

4. **Deploy contracts:**

```bash
# Deploy adapters to Chain A (Base Sepolia)
npx hardhat run --network chainA scripts/deployAdapters.js

# Deploy adapters to Chain B (Arbitrum Sepolia)
npx hardhat run --network chainB scripts/deployAdapters.js

# Deploy SuperAccount and EILRouter (on Chain A)
npx hardhat run --network chainA scripts/deployAccount.js
```

Update your `.env` with deployed addresses:

```bash
SWAP_ADAPTER_ADDRESS=0x...
NFT_ADAPTER_ADDRESS=0x...
SUPER_ACCOUNT_ADDRESS=0x...
EIL_ROUTER_ADDRESS=0x...
```

5. **Update adapter trusted router addresses:**

The adapters need to trust the bundler address or LayerZero endpoint. You can update them using the adapter's `updateRouter` function.

6. **Start the bundler/orchestrator:**

```bash
node bundler/index.js
```

The bundler will run on `http://localhost:3001` by default.

7. **Start the frontend:**

```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:3000`.

## Usage Flow

1. **Connect Wallet:** Click "Connect MetaMask" and approve the connection.

2. **Upload File:** Select an image file and click "Upload to Filecoin". The system will upload to Filecoin (or use a mock CID in HACK_MODE) and display the CID.

3. **Sign & Execute:** Click "Sign & Execute" to:
   - Build an EIL composite payload with swap and NFT mint actions
   - Request a single signature from your wallet
   - Submit the UserOp to the bundler
   - The bundler executes:
     - Submits UserOp to EntryPoint
     - Sends cross-chain messages (via LayerZero or HACK_MODE)
     - Swap executes on Chain A (Base Sepolia)
     - NFT mints on Chain B (Arbitrum Sepolia) with Filecoin CID

4. **View Results:** Transaction links are displayed for each chain. You can fetch and view the NFT metadata from Filecoin using the CID.

## 🧪 Testing

Run contract tests:

```bash
npx hardhat test
```

## Verification

### On-Chain Verification

1. **UserOp Transaction:** Check the transaction hash on [Base Sepolia Explorer](https://sepolia.basescan.org)
   - Verify `from` address is the SuperAccount address
   - Check events emitted

2. **Chain A Swap:** Check swap transaction on Base Sepolia
   - Verify `SwapExecuted` event
   - Verify `executor` is the trusted router/bundler
   - Verify `userAccount` matches the SuperAccount

3. **Chain B NFT:** Check NFT mint transaction on [Arbitrum Sepolia Explorer](https://sepolia.arbiscan.io)
   - Verify `NFTMinted` event
   - Verify `tokenURI` is the Filecoin CID
   - Verify `owner` is the SuperAccount

### Filecoin Verification

1. **Retrieve Metadata:** Use an IPFS gateway:
   ```
   https://ipfs.io/ipfs/<CID>
   ```

2. **Verify JSON:** The metadata JSON should contain:
   - `name`: NFT name
   - `description`: Description
   - `image`: Image CID or URL
   - `attributes`: NFT attributes

## HACK_MODE

If LayerZero SDK or EIL SDK endpoints are unavailable, the project includes a `HACK_MODE` fallback:

- **Direct Adapter Calls:** The bundler directly calls adapter contracts on their respective testnets
- **Mock Filecoin Upload:** Uses a mock CID if Synapse SDK is unavailable
- **Simplified EntryPoint:** Uses a simplified UserOp submission flow

Set `HACK_MODE=true` in your `.env` file to enable.

## EIL Payload Examples

See `/doc/EIL_payload_examples.json` for complete payload examples with encoded calldata.

## Acceptance Criteria

- **One signature** from user in UI  
- **On-chain tx on Chain A** logged (swap or mock)  
- **On-chain tx on Chain B** minted NFT with tokenURI = CID  
- **CID resolves** via Filecoin retrieval (IPFS gateway) and image/JSON renders in UI  
- **EIL payload JSON** available in repo under `/doc` and included in submission

## Tech Stack

- **Smart Contracts:** Solidity ^0.8.19, Hardhat
- **Account Abstraction:** ERC-4337
- **Cross-Chain:** LayerZero V2 (with HACK_MODE fallback)
- **Storage:** Filecoin Onchain Cloud (Synapse SDK)
- **Frontend:** Next.js, React, ethers.js
- **Backend:** Node.js, Express

## Notes

- **Testnets:** Base Sepolia (Chain A) and Arbitrum Sepolia (Chain B)
- **EntryPoint:** Standard ERC-4337 EntryPoint at `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- **LayerZero Endpoints:** See LayerZero V2 documentation for testnet endpoints
- **Filecoin:** Uses Calibration Testnet or Synapse SDK testnet

## Troubleshooting

1. **"Bundler private key not configured":** Set `PRIVATE_KEY_BUNDLER` in `.env`
2. **"Adapter not trusted router":** Update adapter's `trustedRouter` to bundler address
3. **"EntryPoint not found":** Ensure EntryPoint address is correct in `.env`
4. **Filecoin upload fails:** Check `SYNAPSE_API_KEY` or use HACK_MODE

## 📄 License

MIT

## Acknowledgments

- ERC-4337 Account Abstraction
- LayerZero for cross-chain messaging
- Filecoin Onchain Cloud for decentralized storage
- Ethereum Interop Layer (EIL) for chain abstraction

