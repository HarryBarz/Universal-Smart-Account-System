const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Deploying OmnichainVault and VaultAdapter to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Load deployments to get router address
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};
  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  const networkDeployments = deployments[network] || {};
  const routerAddress = networkDeployments.OmnichainSuperAccountRouter || process.env.OMNICHAIN_ROUTER_ADDRESS;
  
  if (!routerAddress) {
    throw new Error("OmnichainSuperAccountRouter not deployed. Deploy router first.");
  }

  // Token address (for MVP, use address(0) as ETH, or deploy a test ERC20)
  const tokenAddress = process.env.TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
  console.log("Token address:", tokenAddress);

  // Deploy OmnichainVault
  const OmnichainVault = await hre.ethers.getContractFactory("OmnichainVault");
  const vault = await OmnichainVault.deploy(tokenAddress, routerAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("OmnichainVault deployed to:", vaultAddress);

  // Deploy VaultAdapter
  const VaultAdapter = await hre.ethers.getContractFactory("VaultAdapter");
  const adapter = await VaultAdapter.deploy(routerAddress, vaultAddress);
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("VaultAdapter deployed to:", adapterAddress);

  // Save deployments
  if (!deployments[network]) {
    deployments[network] = {};
  }
  deployments[network].OmnichainVault = vaultAddress;
  deployments[network].VaultAdapter = adapterAddress;
  deployments[network].vaultToken = tokenAddress;
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log("Deployments saved to:", deploymentPath);

  // Configure router to trust this adapter
  console.log("\nNext steps:");
  console.log("1. Set trusted adapter on router:");
  console.log(`   router.setTrustedAdapter(${getChainEID(network)}, ${adapterAddress})`);
  console.log("2. Deploy vault and adapter on the other chain");
  console.log("3. Test deposit/withdraw operations");
}

function getChainEID(network) {
  const eidMap = {
    chainA: 40245, // Base Sepolia
    chainB: 40231, // Arbitrum Sepolia
  };
  return eidMap[network] || 0;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

