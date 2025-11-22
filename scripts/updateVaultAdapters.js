const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating VaultAdapters to trust routers on ${network}...`);

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

  // Update VaultAdapter on Chain A
  if (network === "chainA" && networkDeployments.VaultAdapter) {
    console.log(`\nUpdating VaultAdapter to trust router: ${routerAddress}`);
    const vaultAdapterAddress = networkDeployments.VaultAdapter;
    
    const vaultAdapter = await hre.ethers.getContractAt("VaultAdapter", vaultAdapterAddress, deployer);
    
    const currentRouter = await vaultAdapter.trustedRouter();
    console.log(`Current trusted router: ${currentRouter}`);
    
    if (currentRouter.toLowerCase() !== routerAddress.toLowerCase()) {
      // Check if deployer is the current trusted router (since adapter was just deployed)
      if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
        console.log("Deployer is current trusted router. Updating to new router...");
        const updateTx = await vaultAdapter.updateRouter(routerAddress);
        await updateTx.wait();
        console.log("✅ VaultAdapter router updated successfully");
        console.log("Transaction hash:", updateTx.hash);
      } else {
        console.log("⚠️  Current router is not deployer. VaultAdapter may need to be updated via router.");
      }
    } else {
      console.log("✅ VaultAdapter already trusts the router");
    }
  }

  // Update VaultAdapter on Chain B
  if (network === "chainB" && networkDeployments.VaultAdapter) {
    console.log(`\nUpdating VaultAdapter to trust router: ${routerAddress}`);
    const vaultAdapterAddress = networkDeployments.VaultAdapter;
    
    const vaultAdapter = await hre.ethers.getContractAt("VaultAdapter", vaultAdapterAddress, deployer);
    
    const currentRouter = await vaultAdapter.trustedRouter();
    console.log(`Current trusted router: ${currentRouter}`);
    
    if (currentRouter.toLowerCase() !== routerAddress.toLowerCase()) {
      if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
        console.log("Deployer is current trusted router. Updating to new router...");
        const updateTx = await vaultAdapter.updateRouter(routerAddress);
        await updateTx.wait();
        console.log("✅ VaultAdapter router updated successfully");
        console.log("Transaction hash:", updateTx.hash);
      } else {
        console.log("⚠️  Current router is not deployer. VaultAdapter may need to be updated via router.");
      }
    } else {
      console.log("✅ VaultAdapter already trusts the router");
    }
  }

  // Update trustedRouter in deployments.json
  networkDeployments.trustedRouter = routerAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("\n✅ Updated deployments.json");

  console.log("\n✅ Vault adapters configured!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

