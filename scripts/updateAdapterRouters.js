const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapter routers on ${network}...`);

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

  // Get router address
  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!routerAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found in deployments for ${network}`);
  }

  // Update SwapAdapter on Chain A
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter to trust router: ${routerAddress}`);
    const SwapAdapter = await hre.ethers.getContractAt(
      "SwapAdapter",
      networkDeployments.SwapAdapter,
      deployer
    );

    const currentRouter = await SwapAdapter.trustedRouter();
    console.log("Current trusted router:", currentRouter);

    if (currentRouter.toLowerCase() !== routerAddress.toLowerCase()) {
      const updateTx = await SwapAdapter.updateRouter(routerAddress);
      await updateTx.wait();
      console.log("✅ SwapAdapter router updated successfully");
      console.log("Transaction hash:", updateTx.hash);
    } else {
      console.log("✅ SwapAdapter already trusts the router");
    }
  }

  // Update NFTAdapter on Chain B
  if (network === "chainB" && networkDeployments.NFTAdapter) {
    console.log(`\nUpdating NFTAdapter to trust router: ${routerAddress}`);
    const NFTAdapter = await hre.ethers.getContractAt(
      "NFTAdapter",
      networkDeployments.NFTAdapter,
      deployer
    );

    const currentRouter = await NFTAdapter.trustedRouter();
    console.log("Current trusted router:", currentRouter);

    if (currentRouter.toLowerCase() !== routerAddress.toLowerCase()) {
      const updateTx = await NFTAdapter.updateRouter(routerAddress);
      await updateTx.wait();
      console.log("✅ NFTAdapter router updated successfully");
      console.log("Transaction hash:", updateTx.hash);
    } else {
      console.log("✅ NFTAdapter already trusts the router");
    }
  }

  // Update trustedRouter in deployments.json
  if (networkDeployments.trustedRouter !== routerAddress) {
    networkDeployments.trustedRouter = routerAddress;
    fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Updated deployments.json");
  }

  console.log("\n✅ All adapters updated successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

