const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const fs = require("fs");
  const path = require("path");
  
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkDeployments = deployments[network];
  
  const routerAddress = networkDeployments.OmnichainSuperAccountRouter;
  const vaultAdapterAddress = networkDeployments.VaultAdapter;
  
  if (!vaultAdapterAddress) {
    throw new Error("VaultAdapter not deployed");
  }
  
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Setting VaultAdapter as trusted on ${network}...`);
  console.log(`Router: ${routerAddress}`);
  console.log(`VaultAdapter: ${vaultAdapterAddress}`);
  
  const router = await hre.ethers.getContractAt("OmnichainSuperAccountRouter", routerAddress, deployer);
  
  // Get chain EID
  const eidMap = {
    chainA: 40245,
    chainB: 40231
  };
  const eid = eidMap[network];
  
  // Set VaultAdapter as trusted for local chain (same as SwapAdapter/NFTAdapter)
  const tx = await router.setTrustedAdapter(eid, vaultAdapterAddress);
  await tx.wait();
  console.log(`✅ VaultAdapter set as trusted adapter for EID ${eid} on ${network}`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
