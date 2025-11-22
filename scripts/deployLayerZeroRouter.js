const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Deploying OmnichainSuperAccountRouter to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // LayerZero Endpoint V2 address for testnet
  const LAYERZERO_ENDPOINT = process.env.LAYER0_ENDPOINT_CHAIN_A || 
                              process.env.LAYER0_ENDPOINT_CHAIN_B || 
                              "0x6EDCE65403992e310A62460808c4b910D972f10f";

  console.log("LayerZero Endpoint:", LAYERZERO_ENDPOINT);

  // Deploy OmnichainSuperAccountRouter (extends LayerZero OApp)
  const owner = deployer.address;
  
  let routerAddress;
  try {
    const OmnichainRouter = await hre.ethers.getContractFactory("OmnichainSuperAccountRouter");
    const router = await OmnichainRouter.deploy(LAYERZERO_ENDPOINT, owner);
    await router.waitForDeployment();
    routerAddress = await router.getAddress();
    
    console.log("OmnichainSuperAccountRouter (OApp) deployed to:", routerAddress);
    console.log("Owner:", owner);
    console.log("LayerZero Endpoint:", LAYERZERO_ENDPOINT);
    
    // Verify deployment
    console.log("Verifying deployment...");
    const deployedEndpoint = await router.endpoint();
    const deployedOwner = await router.owner();
    console.log("Deployed endpoint:", deployedEndpoint);
    console.log("Deployed owner:", deployedOwner);
  } catch (error) {
    console.error("Failed to deploy OmnichainSuperAccountRouter:", error.message);
    console.log("Note: You may need to install @layerzerolabs packages:");
    console.log("npm install @layerzerolabs/lz-evm-oapp-v2 @layerzerolabs/lz-evm-protocol-v2");
    throw error;
  }

  // Get deployed adapter addresses if they exist
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};
  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  // Save deployment
  if (!deployments[network]) {
    deployments[network] = {};
  }
  deployments[network].OmnichainSuperAccountRouter = routerAddress;
  deployments[network].LayerZeroEndpoint = LAYERZERO_ENDPOINT;
  deployments[network].deployer = deployer.address;
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("Deployments saved to:", deploymentPath);

  // Next steps:
  console.log("\nNext steps:");
  console.log(`1. Deploy router on the other chain (chainA or chainB)`);
  console.log(`2. Configure peers: npx hardhat run scripts/configureOApp.js --network ${network}`);
  console.log(`3. Set trusted adapters per chain`);
  console.log(`4. Authorize bundler: router.setAuthorizedExecutor(bundlerAddress, true)`);
  console.log(`5. Update .env: OMNICHAIN_ROUTER_ADDRESS=${routerAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


