const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Configuring vault adapters on ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Configuring with account:", deployer.address);

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployments file not found. Deploy contracts first.");
  }
  
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkDeployments = deployments[network];
  
  if (!networkDeployments || !networkDeployments.OmnichainSuperAccountRouter) {
    throw new Error(`OmnichainSuperAccountRouter not deployed on ${network}`);
  }

  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  const router = await hre.ethers.getContractAt(
    "OmnichainSuperAccountRouter",
    routerAddress,
    deployer
  );

  // Configuration based on network
  const configs = {
    chainA: {
      name: "Base Sepolia",
      eid: 40245, // Base Sepolia EID
      peerEid: 40231, // Arbitrum Sepolia EID (destination)
      localVaultAdapter: networkDeployments.VaultAdapter,
      peerVaultAdapter: deployments.chainB?.VaultAdapter
    },
    chainB: {
      name: "Arbitrum Sepolia",
      eid: 40231, // Arbitrum Sepolia EID
      peerEid: 40245, // Base Sepolia EID (destination)
      localVaultAdapter: networkDeployments.VaultAdapter,
      peerVaultAdapter: deployments.chainA?.VaultAdapter
    }
  };

  const config = configs[network];
  
  if (!config) {
    console.log(`No vault configuration for ${network}`);
    return;
  }

  console.log(`\nConfiguring vault for ${config.name}...`);

  // Configure trusted vault adapter for local chain (for local vault operations)
  if (config.localVaultAdapter && config.eid) {
    try {
      console.log(`Setting trusted vault adapter for local chain EID ${config.eid}: ${config.localVaultAdapter}`);
      const setLocalTx = await router.setTrustedAdapter(config.eid, config.localVaultAdapter);
      await setLocalTx.wait();
      console.log("✅ Local vault adapter configured");
    } catch (error) {
      console.error("Error setting local vault adapter:", error.message);
      console.log("Note: This might overwrite existing SwapAdapter/NFTAdapter trust. Consider using a different EID or managing trust separately.");
    }
  }

  // Configure trusted vault adapter for peer chain (for cross-chain vault operations)
  if (config.peerVaultAdapter && config.peerEid) {
    try {
      console.log(`Setting trusted vault adapter for peer chain EID ${config.peerEid}: ${config.peerVaultAdapter}`);
      
      // Check current trusted adapter
      const currentTrusted = await router.trustedAdapters(config.peerEid);
      
      // If there's already a trusted adapter (e.g., SwapAdapter or NFTAdapter), we need to decide:
      // Option 1: Replace it (vault only)
      // Option 2: Allow multiple adapters (not supported by current design)
      // For now, we'll note that vault operations might need a separate router or different trust model
      
      if (currentTrusted !== "0x0000000000000000000000000000000000000000" && 
          currentTrusted.toLowerCase() !== config.peerVaultAdapter.toLowerCase()) {
        console.log(`⚠️  Warning: EID ${config.peerEid} already has trusted adapter: ${currentTrusted}`);
        console.log(`    This will be replaced with VaultAdapter: ${config.peerVaultAdapter}`);
        console.log(`    Consider using separate routers or a different trust model for multiple adapters.`);
      }
      
      const setPeerTx = await router.setTrustedAdapter(config.peerEid, config.peerVaultAdapter);
      await setPeerTx.wait();
      console.log("✅ Peer vault adapter configured");
    } catch (error) {
      console.error("Error setting peer vault adapter:", error.message);
    }
  }

  console.log("\n✅ Vault configuration complete!");
  console.log("\nNote: Vault adapters can now execute vault operations via LayerZero.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

