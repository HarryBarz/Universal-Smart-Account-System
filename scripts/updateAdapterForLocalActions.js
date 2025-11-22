const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapters for local actions on ${network}...`);

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found. Deploy contracts first.");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkDeployments = deployments[network];

  if (!networkDeployments) {
    throw new Error(`No deployments found for ${network}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Updating with account:", deployer.address);

  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!routerAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found in deployments for ${network}`);
  }

  const router = await hre.ethers.getContractAt(
    "OmnichainSuperAccountRouter",
    routerAddress,
    deployer
  );

  // Check if router owner is deployer
  const routerOwner = await router.owner();
  console.log("Router owner:", routerOwner);
  
  if (routerOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not the router owner. Cannot update adapters.");
  }

  // For local actions, we need the adapter to trust the bundler wallet (deployer)
  // This is a temporary solution until router is redeployed with executeLocalAction()
  const bundlerWalletAddress = deployer.address;

  // Update SwapAdapter on Chain A to trust bundler wallet
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter to trust bundler wallet for local actions: ${bundlerWalletAddress}`);
    const swapAdapterAddress = networkDeployments.SwapAdapter;
    
    try {
      const updateTx = await router.updateAdapterRouter(swapAdapterAddress, bundlerWalletAddress);
      await updateTx.wait();
      console.log("✅ SwapAdapter updated successfully via router");
      console.log("Transaction hash:", updateTx.hash);
    } catch (error) {
      console.error("❌ Failed to update SwapAdapter:", error.message);
      throw error;
    }
  }

  console.log("\n✅ Adapter updated for local actions!");
  console.log("\nNote: This allows the bundler to call adapters directly for local actions.");
  console.log("In production, redeploy the router with executeLocalAction() for proper authorization.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

