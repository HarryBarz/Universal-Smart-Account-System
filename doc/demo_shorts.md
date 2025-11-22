# Demo Guide - Super Account MVP

## Demo Script (3-minute pitch)

### Introduction (30 seconds)
"Today I'm presenting the **Super Account MVP** - a chain-abstracted smart account that unifies every Ethereum L2 and Filecoin into a single seamless user experience. With one signature, users can perform multi-chain actions and automatically store metadata on decentralized storage."

### Architecture Overview (45 seconds)
"Our architecture uses **ERC-4337** for account abstraction, the **Ethereum Interop Layer (EIL)** for chain abstraction, **LayerZero** for cross-chain messaging, and **Filecoin Synapse SDK** for decentralized storage. The user signs once, and our orchestrator automatically dispatches actions to the correct chains."

### Live Demo (90 seconds)

1. **Connect Wallet** (10s)
   - Open demo app: `http://localhost:3000`
   - Click "Connect MetaMask"
   - Show connected address

2. **Upload to Filecoin** (20s)
   - Select an image file
   - Click "Upload to Filecoin"
   - Show returned CID: `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi`
   - Explain: "Metadata is now stored on Filecoin"

3. **Single Signature** (20s)
   - Click "Sign & Execute"
   - Show MetaMask signature request
   - Emphasize: **"ONE signature for multiple chains"**
   - Approve signature

4. **Show Results** (40s)
   - Point to transaction links:
     - Chain A (Base Sepolia): Swap transaction
     - Chain B (Arbitrum Sepolia): NFT mint transaction
   - Open NFT transaction on explorer
   - Show `NFTMinted` event with CID
   - Fetch metadata using CID
   - Display metadata JSON in UI

### Closing (15 seconds)
"The Super Account proves that chain abstraction is here. One account, one signature, unlimited chains, and unified decentralized storage. Thank you!"

## Screenshots to Capture

1. **Wallet Connected Screen**
   - Shows connected address
   - Ready to upload

2. **File Upload with CID**
   - File selected
   - CID displayed: `bafybe...`
   - "Upload to Filecoin" button

3. **Signature Request**
   - MetaMask popup showing message to sign
   - Emphasize "Sign once" message

4. **Transaction Progress**
   - "Submitting to bundler..."
   - "Processing actions..."

5. **Transaction Links**
   - Chain A swap: `https://sepolia.basescan.org/tx/0x...`
   - Chain B NFT: `https://sepolia.arbiscan.io/tx/0x...`

6. **NFT Metadata Retrieved**
   - Shows JSON metadata from Filecoin
   - CID: `bafybe...`
   - Attributes displayed

7. **On-Chain Verification (Explorer)**
   - Base Sepolia explorer showing SwapExecuted event
   - Arbitrum Sepolia explorer showing NFTMinted event
   - Highlight `userAccount` = SuperAccount address
   - Highlight `tokenURI` = Filecoin CID

## Recording Tips

1. **Screen Resolution:** Record at 1920x1080 or higher
2. **Speed:** Use 1.5x speed for upload/transaction waits
3. **Highlights:** 
   - Pause on signature request (emphasize ONE signature)
   - Pause on transaction links
   - Pause on CID retrieval
4. **Audio:** Clear narration explaining each step
5. **Duration:** Keep under 3 minutes total

## Pre-Demo Checklist

- [ ] Contracts deployed to testnets
- [ ] Bundler running on port 3001
- [ ] Frontend running on port 3000
- [ ] Wallet connected with testnet ETH
- [ ] Test image file ready to upload
- [ ] Browser bookmarks:
  - [Base Sepolia Explorer](https://sepolia.basescan.org)
  - [Arbitrum Sepolia Explorer](https://sepolia.arbiscan.io)
  - [IPFS Gateway](https://ipfs.io/ipfs/)
- [ ] Transaction links ready to paste
- [ ] Screen recording software ready

## Quick Links for Demo

- **Frontend:** http://localhost:3000
- **Bundler Health:** http://localhost:3001/health
- **Base Sepolia Explorer:** https://sepolia.basescan.org
- **Arbitrum Sepolia Explorer:** https://sepolia.arbiscan.io
- **IPFS Gateway:** https://ipfs.io/ipfs/
- **LayerZero Docs:** https://docs.layerzero.network
- **Filecoin Docs:** https://docs.filecoin.cloud

## Demo Talking Points

1. **"One Signature"** - Emphasize repeatedly that user signs once
2. **"Chain Abstraction"** - User doesn't need to know which chains are involved
3. **"Decentralized Storage"** - Filecoin provides verifiable, permanent storage
4. **"On-Chain Proof"** - All actions are verifiable on-chain with events
5. **"EIL Payload"** - Show the composite payload structure in `/doc/EIL_payload_examples.json`

## Demo Success Criteria

- One signature shown clearly
- File upload with CID visible
- Two transaction links displayed
- NFT metadata fetched from Filecoin
- On-chain verification shown (explorer links)
- Under 3 minutes total

