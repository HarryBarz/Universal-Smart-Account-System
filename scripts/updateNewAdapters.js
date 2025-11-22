const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating new adapters to trust new routers on ${network}...`);

  // Load deployments
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found.");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkDeployments = deployments[network];

  if (!networkDeployments) {
    throw new Error(`No deployments found for ${network}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Updating with account:", deployer.address);

  const newRouterAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!newRouterAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found`);
  }

  // Update SwapAdapter on Chain A
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter to trust new router...`);
    const adapterAddress = networkDeployments.SwapAdapter;
    const adapter = await hre.ethers.getContractAt("SwapAdapter", adapterAddress, deployer);
    
    const currentRouter = await adapter.trustedRouter();
    console.log(`Current trusted router: ${currentRouter}`);
    console.log(`New router address: ${newRouterAddress}`);
    
    // Since adapter trusts deployer (who deployed it), deployer can update it
    // But wait - SwapAdapter.updateRouter() requires onlyRouter modifier
    // So we need the current trusted router to update it
    
    // If current router is deployer, deployer can call updateRouter directly
    if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("Deployer is the current trusted router. Updating to new router...");
      const updateTx = await adapter.updateRouter(newRouterAddress);
      await updateTx.wait();
      console.log("✅ SwapAdapter updated successfully");
      console.log("Transaction hash:", updateTx.hash);
    } else {
      throw new Error(`Cannot update: adapter trusts ${currentRouter}, not deployer`);
    }
  }

  // Update NFTAdapter on Chain B
  if (network === "chainB" && networkDeployments.NFTAdapter) {
    console.log(`\nUpdating NFTAdapter to trust new router...`);
    const adapterAddress = networkDeployments.NFTAdapter;
    const adapter = await hre.ethers.getContractAt("NFTAdapter", adapterAddress, deployer);
    
    const currentRouter = await adapter.trustedRouter();
    console.log(`Current trusted router: ${currentRouter}`);
    console.log(`New router address: ${newRouterAddress}`);
    
    if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
      console.log("Deployer is the current trusted router. Updating to new router...");
      const updateTx = await adapter.updateRouter(newRouterAddress);
      await updateTx.wait();
      console.log("✅ NFTAdapter updated successfully");
      console.log("Transaction hash:", updateTx.hash);
    } else {
      throw new Error(`Cannot update: adapter trusts ${currentRouter}, not deployer`);
    }
  }

  // Update deployments.json
  networkDeployments.trustedRouter = newRouterAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("\n✅ Updated deployments.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

