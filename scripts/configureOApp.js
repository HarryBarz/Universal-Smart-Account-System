const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Configuring OmnichainSuperAccountRouter on ${network}...`);

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
  console.log("Router address:", routerAddress);

  // Get contract instance
  const OmnichainRouter = await hre.ethers.getContractFactory("OmnichainSuperAccountRouter");
  const router = OmnichainRouter.attach(routerAddress);

  // Configuration based on network
  // For Chain A: We send to Chain B, so we need to trust Chain B's adapter (NFTAdapter)
  // For Chain B: We send to Chain A, so we need to trust Chain A's adapter (SwapAdapter)
  const configs = {
    chainA: {
      name: "Base Sepolia",
      eid: 40245, // Base Sepolia EID (local)
      peerEid: 40231, // Arbitrum Sepolia EID (destination we send to)
      // For Chain A router: trust Chain B's NFTAdapter for destination chain
      adapterAddress: deployments.chainB?.NFTAdapter || networkDeployments.NFTAdapter || process.env.NFT_ADAPTER_ADDRESS
    },
    chainB: {
      name: "Arbitrum Sepolia",
      eid: 40231, // Arbitrum Sepolia EID (local)
      peerEid: 40245, // Base Sepolia EID (destination we send to)
      // For Chain B router: trust Chain A's SwapAdapter for destination chain
      adapterAddress: deployments.chainA?.SwapAdapter || networkDeployments.SwapAdapter || process.env.SWAP_ADAPTER_ADDRESS
    }
  };

  const config = configs[network] || {
    name: network,
    eid: null,
    peerEid: null,
    adapterAddress: null
  };

  console.log(`\nConfiguring for ${config.name}...`);

  // 1. Set peer (required for LayerZero communication)
  if (config.peerEid) {
    try {
      // Get peer router address from other chain
      const otherNetwork = network === "chainA" ? "chainB" : "chainA";
      const otherDeployments = deployments[otherNetwork];
      
      if (otherDeployments && otherDeployments.OmnichainSuperAccountRouter) {
        const peerAddress = otherDeployments.OmnichainSuperAccountRouter;
        console.log(`Setting peer: EID ${config.peerEid} -> ${peerAddress}`);
        
        // Encode peer address as bytes32 (OApp uses bytes32 for peer encoding, right-padded with zeros)
        const peerBytes32 = ethers.zeroPadValue(peerAddress, 32);
        
        const setPeerTx = await router.setPeer(config.peerEid, peerBytes32);
        await setPeerTx.wait();
        console.log("Peer set successfully");
      } else {
        console.log(`Warning: Peer router not deployed on ${otherNetwork} yet. Deploy both routers first.`);
      }
    } catch (error) {
      console.error("Error setting peer:", error.message);
    }
  }

  // 2. Set trusted adapter for destination chain (cross-chain)
  if (config.peerEid && config.adapterAddress) {
    try {
      console.log(`Setting trusted adapter for EID ${config.peerEid} (destination): ${config.adapterAddress}`);
      const setAdapterTx = await router.setTrustedAdapter(config.peerEid, config.adapterAddress);
      await setAdapterTx.wait();
      console.log("Trusted adapter set successfully for destination chain");
    } catch (error) {
      console.error("Error setting trusted adapter:", error.message);
    }
  }

  // 3. Set trusted adapter for local chain (for local execution)
  if (config.eid && networkDeployments) {
    try {
      // For Chain A: trust SwapAdapter for local execution (EID 40245)
      // For Chain B: trust NFTAdapter for local execution (EID 40231)
      let localAdapter;
      if (network === "chainA" && networkDeployments.SwapAdapter) {
        localAdapter = networkDeployments.SwapAdapter;
        console.log(`Setting trusted adapter for local chain EID ${config.eid}: ${localAdapter} (SwapAdapter)`);
      } else if (network === "chainB" && networkDeployments.NFTAdapter) {
        localAdapter = networkDeployments.NFTAdapter;
        console.log(`Setting trusted adapter for local chain EID ${config.eid}: ${localAdapter} (NFTAdapter)`);
      }
      
      if (localAdapter) {
        const setLocalAdapterTx = await router.setTrustedAdapter(config.eid, localAdapter);
        await setLocalAdapterTx.wait();
        console.log("Trusted adapter set successfully for local chain");
      }
    } catch (error) {
      console.error("Error setting local trusted adapter:", error.message);
    }
  }

  // 3. Authorize bundler (if configured)
  const bundlerAddress = process.env.BUNDLER_ADDRESS;
  if (bundlerAddress) {
    try {
      console.log(`Authorizing bundler: ${bundlerAddress}`);
      const authTx = await router.setAuthorizedExecutor(bundlerAddress, true);
      await authTx.wait();
      console.log("Bundler authorized successfully");
    } catch (error) {
      console.error("Error authorizing bundler:", error.message);
    }
  }

  console.log("\nConfiguration complete!");
  console.log("\nNext steps:");
  console.log("1. Deploy router on the other chain");
  console.log("2. Run this script on the other chain to set peers");
  console.log("3. Update adapters to trust the router address");
  console.log("4. Test cross-chain message sending");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

