const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating adapters for HACK_MODE on ${network}...`);

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
  console.log("This account will be set as trusted router for HACK_MODE");

  // In HACK_MODE, the bundler wallet (deployer) calls adapters directly
  const bundlerWalletAddress = deployer.address;

  // Update SwapAdapter on Chain A
  if (network === "chainA" && networkDeployments.SwapAdapter) {
    console.log(`\nUpdating SwapAdapter to trust bundler wallet: ${bundlerWalletAddress}`);
    const SwapAdapter = await hre.ethers.getContractAt(
      "SwapAdapter",
      networkDeployments.SwapAdapter,
      deployer
    );

    const currentRouter = await SwapAdapter.trustedRouter();
    console.log("Current trusted router:", currentRouter);

    // If current router is not the bundler wallet, we need to update it
    // But updateRouter can only be called by the current trusted router
    // So we'll use the router to update it, or if deployer was original router, use deployer
    if (currentRouter.toLowerCase() === bundlerWalletAddress.toLowerCase()) {
      console.log("✅ SwapAdapter already trusts the bundler wallet");
    } else {
      // Check if deployer is the current trusted router
      if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
        // Deployer is trusted, can update directly
        const updateTx = await SwapAdapter.updateRouter(bundlerWalletAddress);
        await updateTx.wait();
        console.log("✅ SwapAdapter router updated successfully");
        console.log("Transaction hash:", updateTx.hash);
      } else {
        // Need to use the current trusted router to update
        // For now, we'll try using the router contract
        console.log("⚠️  Current router is not deployer. Attempting to update via router...");
        console.log("If this fails, you may need to update manually via the router contract.");
        
        try {
          // Try to update using the current router
          // This will only work if we have the router's private key or can call through it
          const updateTx = await SwapAdapter.updateRouter(bundlerWalletAddress);
          await updateTx.wait();
          console.log("✅ SwapAdapter router updated successfully");
          console.log("Transaction hash:", updateTx.hash);
        } catch (error) {
          console.error("❌ Failed to update SwapAdapter:", error.message);
          console.log("You may need to update the adapter manually or use the router to update it.");
          throw error;
        }
      }
    }
  }

  // Update NFTAdapter on Chain B
  if (network === "chainB" && networkDeployments.NFTAdapter) {
    console.log(`\nUpdating NFTAdapter to trust bundler wallet: ${bundlerWalletAddress}`);
    const NFTAdapter = await hre.ethers.getContractAt(
      "NFTAdapter",
      networkDeployments.NFTAdapter,
      deployer
    );

    const currentRouter = await NFTAdapter.trustedRouter();
    console.log("Current trusted router:", currentRouter);

    if (currentRouter.toLowerCase() === bundlerWalletAddress.toLowerCase()) {
      console.log("✅ NFTAdapter already trusts the bundler wallet");
    } else {
      // Same logic as SwapAdapter
      if (currentRouter.toLowerCase() === deployer.address.toLowerCase()) {
        const updateTx = await NFTAdapter.updateRouter(bundlerWalletAddress);
        await updateTx.wait();
        console.log("✅ NFTAdapter router updated successfully");
        console.log("Transaction hash:", updateTx.hash);
      } else {
        console.log("⚠️  Current router is not deployer. Attempting to update via router...");
        try {
          const updateTx = await NFTAdapter.updateRouter(bundlerWalletAddress);
          await updateTx.wait();
          console.log("✅ NFTAdapter router updated successfully");
          console.log("Transaction hash:", updateTx.hash);
        } catch (error) {
          console.error("❌ Failed to update NFTAdapter:", error.message);
          console.log("You may need to update the adapter manually or use the router to update it.");
          throw error;
        }
      }
    }
  }

  // Update trustedRouter in deployments.json
  networkDeployments.trustedRouter = bundlerWalletAddress;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("\n✅ Updated deployments.json");

  console.log("\n✅ All adapters updated for HACK_MODE!");
  console.log("\nNote: In production (non-HACK_MODE), adapters should trust the OmnichainSuperAccountRouter.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

