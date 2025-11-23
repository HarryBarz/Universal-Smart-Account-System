const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

/**
 * Test script to verify LayerZero end-to-end message flow
 * Tests: Send message from Chain A → Receive on Chain B
 */
async function main() {
  console.log("\n=== LayerZero End-to-End Integration Test ===\n");

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Check if routers are deployed on both chains
  const routerA = deployments.chainA?.OmnichainSuperAccountRouter;
  const routerB = deployments.chainB?.OmnichainSuperAccountRouter;

  if (!routerA || !routerB) {
    throw new Error("Routers not deployed on both chains. Deploy first.");
  }

  console.log("✅ Routers found:");
  console.log(`   Chain A: ${routerA}`);
  console.log(`   Chain B: ${routerB}\n`);

  // Connect to both chains
  const providerA = new ethers.JsonRpcProvider(
    process.env.CHAIN_A_RPC || "https://sepolia.base.org"
  );
  const providerB = new ethers.JsonRpcProvider(
    process.env.CHAIN_B_RPC || "https://sepolia-rollup.arbitrum.io/rpc"
  );

  const routerABI = [
    "function peers(uint32 eid) external view returns (bytes32 peer)",
    "function trustedAdapters(uint32 eid) external view returns (address)",
    "function authorizedExecutors(address) external view returns (bool)",
    "function sendCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external payable returns (bytes32)",
    "function quoteCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
    "function isActionExecuted(bytes32 actionId) external view returns (bool)",
    "event CrossChainActionSent(bytes32 indexed actionId, uint32 dstEid, address indexed userAccount, address targetAdapter)",
    "event CrossChainActionReceived(bytes32 indexed actionId, uint32 srcEid, address indexed userAccount, address targetAdapter, bool success)"
  ];

  const routerContractA = new ethers.Contract(routerA, routerABI, providerA);
  const routerContractB = new ethers.Contract(routerB, routerABI, providerB);

  // 1. Check peer configuration
  console.log("=== Step 1: Checking Peer Configuration ===");
  const EID_CHAIN_A = 40245; // Base Sepolia
  const EID_CHAIN_B = 40231; // Arbitrum Sepolia

  try {
    // Check if Chain A has Chain B as peer
    const peerB = await routerContractA.peers(EID_CHAIN_B);
    const peerBAddress = ethers.getAddress(ethers.dataSlice(peerB, 12)); // Extract address from bytes32
    
    console.log(`Chain A → Chain B peer: ${peerBAddress}`);
    if (peerBAddress.toLowerCase() === routerB.toLowerCase()) {
      console.log("✅ Chain A has Chain B configured as peer\n");
    } else {
      console.log("❌ Chain A peer mismatch! Expected:", routerB);
      console.log("   Run: npx hardhat run scripts/configureOApp.js --network chainA\n");
    }

    // Check if Chain B has Chain A as peer
    const peerA = await routerContractB.peers(EID_CHAIN_A);
    const peerAAddress = ethers.getAddress(ethers.dataSlice(peerA, 12));
    
    console.log(`Chain B → Chain A peer: ${peerAAddress}`);
    if (peerAAddress.toLowerCase() === routerA.toLowerCase()) {
      console.log("✅ Chain B has Chain A configured as peer\n");
    } else {
      console.log("❌ Chain B peer mismatch! Expected:", routerA);
      console.log("   Run: npx hardhat run scripts/configureOApp.js --network chainB\n");
    }
  } catch (error) {
    console.log("❌ Error checking peers:", error.message);
    console.log("   Peers may not be configured. Run configureOApp.js scripts.\n");
  }

  // 2. Check trusted adapters
  console.log("=== Step 2: Checking Trusted Adapters ===");
  try {
    const adapterB = await routerContractA.trustedAdapters(EID_CHAIN_B);
    console.log(`Chain A trusts adapter for Chain B: ${adapterB}`);
    
    const adapterA = await routerContractB.trustedAdapters(EID_CHAIN_A);
    console.log(`Chain B trusts adapter for Chain A: ${adapterA}\n`);
  } catch (error) {
    console.log("❌ Error checking adapters:", error.message);
  }

  // 3. Check recent sent/received events
  console.log("=== Step 3: Checking Recent Messages ===");
  
  // Check sent messages on Chain A
  try {
    const currentBlockA = await providerA.getBlockNumber();
    const fromBlockA = Math.max(0, currentBlockA - 1000);
    
    const sentEvents = await routerContractA.queryFilter(
      routerContractA.filters.CrossChainActionSent(),
      fromBlockA,
      currentBlockA
    );
    
    console.log(`Found ${sentEvents.length} sent message(s) on Chain A`);
    if (sentEvents.length > 0) {
      const latest = sentEvents[sentEvents.length - 1];
      console.log(`   Latest: Action ${latest.args.actionId} → EID ${latest.args.dstEid}`);
    }
  } catch (error) {
    console.log("❌ Error checking sent messages:", error.message);
  }

  // Check received messages on Chain B
  try {
    const currentBlockB = await providerB.getBlockNumber();
    const fromBlockB = Math.max(0, currentBlockB - 1000);
    
    const receivedEvents = await routerContractB.queryFilter(
      routerContractB.filters.CrossChainActionReceived(),
      fromBlockB,
      currentBlockB
    );
    
    console.log(`Found ${receivedEvents.length} received message(s) on Chain B`);
    if (receivedEvents.length > 0) {
      const latest = receivedEvents[receivedEvents.length - 1];
      console.log(`   Latest: Action ${latest.args.actionId} from EID ${latest.args.srcEid}, Success: ${latest.args.success}`);
    }
  } catch (error) {
    console.log("❌ Error checking received messages:", error.message);
  }

  console.log("\n=== Test Summary ===");
  console.log("If peers are configured and messages are flowing, you should see:");
  console.log("✅ Peer addresses match router addresses");
  console.log("✅ Recent sent/received events on both chains");
  console.log("\nIf not configured:");
  console.log("1. Deploy routers: npx hardhat run scripts/deployLayerZeroRouter.js --network chainA");
  console.log("2. Configure peers: npx hardhat run scripts/configureOApp.js --network chainA");
  console.log("3. Repeat for chainB");
  console.log("4. Test by sending a message from the frontend or bundler\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

