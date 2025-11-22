const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapters to trust new router on ${network}...`);

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

  // Get new router address (already deployed)
  const newRouterAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!newRouterAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found in deployments for ${network}`);
  }

  console.log(`New router address: ${newRouterAddress}`);

  // Old router address (that adapters currently trust)
  const oldRouterAddress = networkDeployments.trustedRouter || "0xd859cac89107fbdD6Cad564eD9b62a01dE429829";
  console.log(`Old router address: ${oldRouterAddress}`);

  // Update SwapAdapter on Chain A
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter to trust new router...`);
    const swapAdapterAddress = networkDeployments.SwapAdapter;
    
    // Get adapter contract
    const swapAdapter = await hre.ethers.getContractAt("SwapAdapter", swapAdapterAddress);
    
    // Get old router contract (that adapter currently trusts)
    const oldRouter = await hre.ethers.getContractAt(
      "OmnichainSuperAccountRouter",
      oldRouterAddress
    );
    
    // Check if old router can update (if deployer is owner)
    const oldRouterOwner = await oldRouter.owner();
    console.log(`Old router owner: ${oldRouterOwner}`);
    
    if (oldRouterOwner.toLowerCase() === deployer.address.toLowerCase()) {
      // Use old router's updateAdapterRouter to update adapter
      console.log("Using old router to update adapter to trust new router...");
      try {
        const updateTx = await oldRouter.updateAdapterRouter(swapAdapterAddress, newRouterAddress);
        await updateTx.wait();
        console.log("✅ SwapAdapter updated successfully via old router");
        console.log("Transaction hash:", updateTx.hash);
      } catch (error) {
        console.error("❌ Failed to update via old router:", error.message);
        throw error;
      }
    } else {
      throw new Error("Deployer is not the old router owner. Cannot update adapter.");
    }
  }

  // Update NFTAdapter on Chain B
  if (network === "chainB" && networkDeployments.NFTAdapter) {
    console.log(`\nUpdating NFTAdapter to trust new router...`);
    const nftAdapterAddress = networkDeployments.NFTAdapter;
    
    // Get old router contract
    const oldRouter = await hre.ethers.getContractAt(
      "OmnichainSuperAccountRouter",
      oldRouterAddress
    );
    
    // Check if old router can update
    const oldRouterOwner = await oldRouter.owner();
    console.log(`Old router owner: ${oldRouterOwner}`);
    
    if (oldRouterOwner.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("Using old router to update adapter to trust new router...");
      try {
        const updateTx = await oldRouter.updateAdapterRouter(nftAdapterAddress, newRouterAddress);
        await updateTx.wait();
        console.log("✅ NFTAdapter updated successfully via old router");
        console.log("Transaction hash:", updateTx.hash);
      } catch (error) {
        console.error("❌ Failed to update via old router:", error.message);
        throw error;
      }
    } else {
      throw new Error("Deployer is not the old router owner. Cannot update adapter.");
    }
  }

  // Update trustedRouter in deployments.json
  networkDeployments.trustedRouter = newRouterAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("\n✅ Updated deployments.json");

  console.log("\n✅ All adapters updated to trust new routers!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

