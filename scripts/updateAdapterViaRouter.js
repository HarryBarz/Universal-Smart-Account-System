const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapters via router for HACK_MODE on ${network}...`);

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

  // In HACK_MODE, we want the bundler wallet (deployer) to be trusted
  const bundlerWalletAddress = deployer.address;

  // For HACK_MODE, we need to call the adapter's updateRouter function
  // But only the current trusted router can call it
  // Since the router doesn't have a function to forward this call,
  // we'll use a low-level call from the router contract
  
  // Get router contract
  const router = await hre.ethers.getContractAt("OmnichainSuperAccountRouter", routerAddress);
  const routerOwner = await router.owner();
  console.log("Router owner:", routerOwner);
  console.log("Deployer address:", deployer.address);
  
  if (routerOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("⚠️  Warning: Deployer is not the router owner!");
    console.log("You may need to use the router owner's private key to update adapters.");
  }

  // For now, the simplest solution is to note that we need to update the adapters
  // Since we can't easily do it through the router, let's check if we can update
  // through the router contract itself using delegatecall or a helper function
  
  // Actually, the best solution is to note that in HACK_MODE, the adapters should trust
  // the bundler wallet, which we can't easily change without router support.
  
  // Alternative: Create a simple helper script that uses the router's ABI to make a low-level call
  // to the adapter's updateRouter function, but that won't work because the adapter checks msg.sender
  
  console.log("\n⚠️  Note: Adapters currently trust the router address.");
  console.log("For HACK_MODE to work, adapters need to trust the bundler wallet.");
  console.log("Since only the trusted router can update, we have two options:");
  console.log("1. Use the router to forward calls (requires router modification)");
  console.log("2. Temporarily set adapters to trust bundler during deployment");
  console.log("\nFor now, let's check if we can add a helper function to the router...");
  
  // Actually, let's just document that for HACK_MODE, you need to set the adapters
  // to trust the bundler wallet during initial deployment or update via router owner
  
  console.log("\n✅ To fix this manually:");
  console.log(`1. Update SwapAdapter (${networkDeployments.SwapAdapter}) to trust: ${bundlerWalletAddress}`);
  console.log(`2. Update NFTAdapter (${networkDeployments.NFTAdapter}) to trust: ${bundlerWalletAddress}`);
  console.log("3. This requires the router contract (${routerAddress}) to call updateRouter");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

