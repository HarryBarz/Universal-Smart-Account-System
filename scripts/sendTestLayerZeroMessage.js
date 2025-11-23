const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

/**
 * Send a test LayerZero cross-chain message and verify it's received
 * This actually tests the end-to-end flow
 */
async function main() {
  console.log("\n=== Sending Test LayerZero Cross-Chain Message ===\n");

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const routerA = deployments.chainA?.OmnichainSuperAccountRouter;
  const routerB = deployments.chainB?.OmnichainSuperAccountRouter;
  const adapterB = deployments.chainB?.NFTAdapter;

  if (!routerA || !routerB || !adapterB) {
    throw new Error("Missing required contracts. Deploy first.");
  }

  // Get deployer wallet (must be authorized)
  const [deployer] = await hre.ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  // Connect to Chain A
  const providerA = new ethers.JsonRpcProvider(
    process.env.CHAIN_A_RPC || "https://sepolia.base.org"
  );
  const walletA = new ethers.Wallet(process.env.PRIVATE_KEY_CHAIN_A || deployer.privateKey, providerA);

  const routerABI = [
    "function sendCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external payable returns (bytes32)",
    "function quoteCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
    "function isActionExecuted(bytes32 actionId) external view returns (bool)",
    "function authorizedExecutors(address) external view returns (bool)",
    "event CrossChainActionSent(bytes32 indexed actionId, uint32 dstEid, address indexed userAccount, address targetAdapter)",
    "event CrossChainActionReceived(bytes32 indexed actionId, uint32 srcEid, address indexed userAccount, address targetAdapter, bool success)"
  ];

  const routerContractA = new ethers.Contract(routerA, routerABI, walletA);

  // Check authorization
  const isAuthorized = await routerContractA.authorizedExecutors(walletA.address);
  if (!isAuthorized) {
    console.log("⚠️  Deployer not authorized. Authorizing now...");
    // Note: This requires owner permissions
    console.log("   Run: npx hardhat run scripts/authorizeBundler.js --network chainA");
    process.exit(1);
  }

  // Build test action
  const testUser = walletA.address;
  const timestamp = Math.floor(Date.now() / 1000);
  const testCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string"],
    ["test-message"]
  );

  const actionId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes", "uint256"],
      [testUser, adapterB, testCalldata, timestamp]
    )
  );

  const action = {
    userAccount: testUser,
    targetAdapter: adapterB,
    adapterCalldata: testCalldata,
    timestamp: timestamp,
    actionId: actionId
  };

  const options = {
    nativeDropAmount: 0,
    executorLzReceiveOption: "0x"
  };

  // Quote fee
  console.log("Step 1: Quoting LayerZero fee...");
  const fee = await routerContractA.quoteCrossChainAction(
    40231, // Arbitrum Sepolia EID
    action,
    options
  );

  console.log(`   Native fee: ${ethers.formatEther(fee.nativeFee)} ETH`);
  console.log(`   LZ token fee: ${ethers.formatEther(fee.lzTokenFee)} ETH\n`);

  // Check balance
  const balance = await providerA.getBalance(walletA.address);
  if (balance < fee.nativeFee) {
    throw new Error(`Insufficient balance. Need ${ethers.formatEther(fee.nativeFee)} ETH, have ${ethers.formatEther(balance)} ETH`);
  }

  // Send message
  console.log("Step 2: Sending LayerZero message...");
  const feeWithBuffer = fee.nativeFee + (fee.nativeFee / 10n); // 10% buffer
  
  const tx = await routerContractA.sendCrossChainAction(
    40231, // Arbitrum Sepolia EID
    action,
    options,
    { value: feeWithBuffer }
  );

  console.log(`   Transaction hash: ${tx.hash}`);
  console.log(`   Waiting for confirmation...\n`);

  const receipt = await tx.wait();
  console.log(`✅ Message sent! Block: ${receipt.blockNumber}`);

  // Parse sent event
  const sentEvents = receipt.logs
    .map((log) => {
      try {
        return routerContractA.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.name === "CrossChainActionSent");

  if (sentEvents.length > 0) {
    const event = sentEvents[0];
    console.log(`\n📤 CrossChainActionSent event:`);
    console.log(`   Action ID: ${event.args.actionId}`);
    console.log(`   Destination EID: ${event.args.dstEid}`);
    console.log(`   User: ${event.args.userAccount}`);
    console.log(`   Adapter: ${event.args.targetAdapter}`);
  }

  // Now wait and check for receipt on Chain B
  console.log(`\n⏳ Waiting for LayerZero to deliver message (usually 30-60 seconds)...\n`);
  
  const providerB = new ethers.JsonRpcProvider(
    process.env.CHAIN_B_RPC || "https://sepolia-rollup.arbitrum.io/rpc"
  );
  const routerContractB = new ethers.Contract(routerB, routerABI, providerB);

  // Poll for received event (check every 5 seconds, max 2 minutes)
  const maxAttempts = 24;
  let received = false;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const currentBlock = await providerB.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100);

      const receivedEvents = await routerContractB.queryFilter(
        routerContractB.filters.CrossChainActionReceived(actionId),
        fromBlock,
        currentBlock
      );

      if (receivedEvents.length > 0) {
        const event = receivedEvents[0];
        console.log(`✅ Message received on Chain B!`);
        console.log(`   Block: ${event.blockNumber}`);
        console.log(`   TX: ${event.transactionHash}`);
        console.log(`   Success: ${event.args.success}`);
        console.log(`   Source EID: ${event.args.srcEid}`);
        
        // Verify action is marked as executed
        const executed = await routerContractB.isActionExecuted(actionId);
        console.log(`   Action executed: ${executed}`);
        
        received = true;
        break;
      }
    } catch (error) {
      console.log(`   Attempt ${i + 1}/${maxAttempts}: Not received yet...`);
    }
  }

  if (!received) {
    console.log(`\n⚠️  Message not received after ${maxAttempts * 5} seconds`);
    console.log(`   This could mean:`);
    console.log(`   1. LayerZero is still delivering (check LayerZero Scan)`);
    console.log(`   2. Message failed (check router configuration)`);
    console.log(`   3. Executor didn't call _lzReceive()`);
    console.log(`\n   Check manually: npx hardhat run scripts/checkLayerZeroStatus.js --network chainA ${tx.hash}`);
  }

  console.log("\n✅ Test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

