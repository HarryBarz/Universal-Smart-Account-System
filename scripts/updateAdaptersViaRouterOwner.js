const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapters via router owner for HACK_MODE on ${network}...`);

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

  // Get router address and check owner
  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!routerAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found in deployments for ${network}`);
  }

  const router = await hre.ethers.getContractAt("OmnichainSuperAccountRouter", routerAddress);
  const routerOwner = await router.owner();
  
  console.log("Router owner:", routerOwner);
  
  if (routerOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not the router owner! Cannot update adapters.");
  }

  // Bundler wallet address (same as deployer in HACK_MODE)
  const bundlerWalletAddress = deployer.address;
  console.log("Setting adapters to trust bundler wallet:", bundlerWalletAddress);

  // For Chain A: Update SwapAdapter
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter via router...`);
    
    try {
      // Use the router's new helper function if it exists, otherwise use low-level call
      // Check if updateAdapterRouter function exists
      let updateTx;
      try {
        // Try using the new helper function (if router has been redeployed with it)
        updateTx = await router.updateAdapterRouter(
          networkDeployments.SwapAdapter,
          bundlerWalletAddress
        );
      } catch (error) {
        // If helper function doesn't exist, we need to use a different approach
        console.log("Helper function not available. Router needs to be redeployed with updateAdapterRouter function.");
        console.log("Alternative: We need to call adapter.updateRouter() through the router.");
        console.log("But since router is already deployed, we can't add the function.");
        throw new Error("Router contract doesn't have updateAdapterRouter function. Please redeploy router or update manually.");
      }
      
      await updateTx.wait();
      console.log("✅ SwapAdapter updated successfully via router");
      console.log("Transaction hash:", updateTx.hash);
    } catch (error) {
      console.error("❌ Failed to update SwapAdapter:", error.message);
      throw error;
    }
  }

  // For Chain B: Update NFTAdapter
  if (network === "chainB" && networkDeployments.NFTAdapter) {
    console.log(`\nUpdating NFTAdapter via router...`);
    
    try {
      let updateTx;
      try {
        updateTx = await router.updateAdapterRouter(
          networkDeployments.NFTAdapter,
          bundlerWalletAddress
        );
      } catch (error) {
        console.log("Helper function not available.");
        throw new Error("Router contract doesn't have updateAdapterRouter function. Please redeploy router or update manually.");
      }
      
      await updateTx.wait();
      console.log("✅ NFTAdapter updated successfully via router");
      console.log("Transaction hash:", updateTx.hash);
    } catch (error) {
      console.error("❌ Failed to update NFTAdapter:", error.message);
      throw error;
    }
  }

  console.log("\n✅ All adapters updated for HACK_MODE!");
  console.log("Note: For production, update adapters back to trust the router address.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

