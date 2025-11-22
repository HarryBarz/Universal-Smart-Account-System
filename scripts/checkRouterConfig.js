const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nChecking OmnichainSuperAccountRouter configuration on ${network}...`);

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found.");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Checking with account:", deployer.address);

  // Check router on Chain A
  if (deployments.chainA?.OmnichainSuperAccountRouter) {
    console.log("\n=== Chain A (Base Sepolia) ===");
    const routerA = await hre.ethers.getContractAt(
      "OmnichainSuperAccountRouter",
      deployments.chainA.OmnichainSuperAccountRouter
    );
    
    // Check trusted adapters for each EID
    const chainBEid = 40231; // Arbitrum Sepolia
    const trustedAdapterB = await routerA.trustedAdapters(chainBEid);
    console.log(`Trusted adapter for EID ${chainBEid} (Arbitrum Sepolia):`, trustedAdapterB);
    console.log(`Expected NFTAdapter:`, deployments.chainB?.NFTAdapter);
    
    if (trustedAdapterB.toLowerCase() !== deployments.chainB?.NFTAdapter?.toLowerCase()) {
      console.log("❌ MISMATCH! Router doesn't trust NFTAdapter for Arbitrum Sepolia");
    } else {
      console.log("✅ Router trusts NFTAdapter for Arbitrum Sepolia");
    }
  }

  // Check router on Chain B
  if (deployments.chainB?.OmnichainSuperAccountRouter) {
    console.log("\n=== Chain B (Arbitrum Sepolia) ===");
    const routerB = await hre.ethers.getContractAt(
      "OmnichainSuperAccountRouter",
      deployments.chainB.OmnichainSuperAccountRouter
    );
    
    // Check trusted adapters for each EID
    const chainAEid = 40245; // Base Sepolia
    const trustedAdapterA = await routerB.trustedAdapters(chainAEid);
    console.log(`Trusted adapter for EID ${chainAEid} (Base Sepolia):`, trustedAdapterA);
    console.log(`Expected SwapAdapter:`, deployments.chainA?.SwapAdapter);
    
    if (trustedAdapterA.toLowerCase() !== deployments.chainA?.SwapAdapter?.toLowerCase()) {
      console.log("❌ MISMATCH! Router doesn't trust SwapAdapter for Base Sepolia");
    } else {
      console.log("✅ Router trusts SwapAdapter for Base Sepolia");
    }
  }

  console.log("\n✅ Configuration check complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

