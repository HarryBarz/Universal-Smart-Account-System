const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nAuthorizing bundler on router for ${network}...`);

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
  console.log("Authorizing with account:", deployer.address);

  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  if (!routerAddress) {
    throw new Error(`OmnichainSuperAccountRouter not found in deployments for ${network}`);
  }

  const router = await hre.ethers.getContractAt(
    "OmnichainSuperAccountRouter",
    routerAddress,
    deployer
  );

  const bundlerAddress = deployer.address; // Bundler is the deployer wallet
  console.log(`Bundler address: ${bundlerAddress}`);

  // Check if already authorized
  const isAuthorized = await router.authorizedExecutors(bundlerAddress);
  if (isAuthorized) {
    console.log("✅ Bundler is already authorized");
    return;
  }

  // Authorize bundler
  console.log(`Authorizing bundler on router ${routerAddress}...`);
  const authTx = await router.setAuthorizedExecutor(bundlerAddress, true);
  await authTx.wait();
  console.log("✅ Bundler authorized successfully");
  console.log("Transaction hash:", authTx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

