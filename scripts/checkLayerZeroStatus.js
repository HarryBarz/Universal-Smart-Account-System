const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const txHash = process.argv[2];
  
  if (!txHash) {
    console.log("Usage: npx hardhat run scripts/checkLayerZeroStatus.js --network chainA <txHash>");
    console.log("\nThis script checks the status of a LayerZero cross-chain message");
    process.exit(1);
  }

  console.log(`\nChecking LayerZero message status for transaction: ${txHash}\n`);

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Check on Chain A (Base Sepolia) - source chain
  console.log("=== Checking Source Chain (Base Sepolia) ===");
  const providerChainA = new ethers.JsonRpcProvider(process.env.CHAIN_A_RPC || "https://sepolia.base.org");
  
  try {
    const receiptA = await providerChainA.getTransactionReceipt(txHash);
    if (receiptA) {
      console.log("✅ Transaction found on Base Sepolia");
      console.log(`Block: ${receiptA.blockNumber}`);
      console.log(`Status: ${receiptA.status === 1 ? "Success" : "Failed"}`);
      console.log(`From: ${receiptA.from}`);
      console.log(`To: ${receiptA.to}`);
      
      // Check if it's a router transaction
      const routerA = deployments.chainA?.OmnichainSuperAccountRouter;
      if (receiptA.to && receiptA.to.toLowerCase() === routerA?.toLowerCase()) {
        console.log("\n✅ This is a LayerZero send transaction from the router");
        
        // Try to parse events
        const routerABI = [
          "event CrossChainActionSent(bytes32 indexed actionId, uint32 dstEid, address indexed userAccount, address targetAdapter)"
        ];
        const routerContract = new ethers.Contract(routerA, routerABI, providerChainA);
        const logs = await providerChainA.getLogs({
          fromBlock: receiptA.blockNumber,
          toBlock: receiptA.blockNumber,
          address: routerA
        });
        
        for (const log of logs) {
          try {
            const parsed = routerContract.interface.parseLog(log);
            if (parsed && parsed.name === "CrossChainActionSent") {
              console.log("\n📤 LayerZero Message Sent:");
              console.log(`   Action ID: ${parsed.args.actionId}`);
              console.log(`   Destination EID: ${parsed.args.dstEid} (${parsed.args.dstEid === 40231 ? "Arbitrum Sepolia" : "Unknown"})`);
              console.log(`   Target Adapter: ${parsed.args.targetAdapter}`);
              console.log("\n⏳ Message is being delivered via LayerZero...");
              console.log("   LayerZero messages typically take 30-60 seconds to deliver");
              console.log("\n💡 To check if it was received on destination chain:");
              console.log(`   Check router events on Arbitrum Sepolia: ${deployments.chainB?.OmnichainSuperAccountRouter}`);
            }
          } catch (e) {
            // Not a router event, skip
          }
        }
      }
    } else {
      console.log("❌ Transaction not found on Base Sepolia");
    }
  } catch (error) {
    console.log("❌ Error checking Base Sepolia:", error.message);
  }

  // Check on Chain B (Arbitrum Sepolia) - destination chain
  console.log("\n=== Checking Destination Chain (Arbitrum Sepolia) ===");
  const providerChainB = new ethers.JsonRpcProvider(process.env.CHAIN_B_RPC || "https://sepolia-rollup.arbitrum.io/rpc");
  const routerB = deployments.chainB?.OmnichainSuperAccountRouter;
  
  if (routerB) {
    console.log(`Checking router events on Arbitrum Sepolia: ${routerB}`);
    
    const routerABI = [
      "event CrossChainActionReceived(bytes32 indexed actionId, uint32 srcEid, address indexed userAccount, address targetAdapter, bool success)"
    ];
    const routerContractB = new ethers.Contract(routerB, routerABI, providerChainB);
    
    // Get recent events (last 1000 blocks)
    const currentBlock = await providerChainB.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 1000);
    
    try {
      const events = await routerContractB.queryFilter(
        routerContractB.filters.CrossChainActionReceived(),
        fromBlock,
        currentBlock
      );
      
      if (events.length > 0) {
        console.log(`\n✅ Found ${events.length} received action(s) on Arbitrum Sepolia:\n`);
        events.slice(-5).forEach((event, i) => {
          const args = event.args;
          console.log(`   ${i + 1}. Action ID: ${args.actionId}`);
          console.log(`      Source EID: ${args.srcEid}`);
          console.log(`      User: ${args.userAccount}`);
          console.log(`      Adapter: ${args.targetAdapter}`);
          console.log(`      Success: ${args.success ? "✅" : "❌"}`);
          console.log(`      Block: ${event.blockNumber}`);
          console.log(`      TX: https://sepolia.arbiscan.io/tx/${event.transactionHash}\n`);
        });
      } else {
        console.log("\n⏳ No actions received yet. Message may still be in transit.");
        console.log("   LayerZero messages can take 30-60 seconds to deliver.");
        console.log(`\n💡 Check again in a minute or check LayerZero Scan for message status.`);
      }
    } catch (error) {
      console.log("⚠️  Could not query events:", error.message);
    }
  }
  
  console.log("\n✅ Status check complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

