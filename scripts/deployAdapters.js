const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Deploying adapters to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // For MVP, we'll use a placeholder router address
  // In production, this would be the LayerZero endpoint or a trusted router
  const TRUSTED_ROUTER = process.env.TRUSTED_ROUTER || deployer.address;

  let contractName, Contract, contract;
  const deployments = {};

  // Deploy SwapAdapter on Chain A, NFTAdapter on Chain B
  if (network === "chainA") {
    contractName = "SwapAdapter";
    Contract = await hre.ethers.getContractFactory("SwapAdapter");
    contract = await Contract.deploy(TRUSTED_ROUTER);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    deployments[contractName] = address;
    console.log(`${contractName} deployed to:`, address);
  } else if (network === "chainB") {
    contractName = "NFTAdapter";
    Contract = await hre.ethers.getContractFactory("NFTAdapter");
    contract = await Contract.deploy(TRUSTED_ROUTER);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    deployments[contractName] = address;
    console.log(`${contractName} deployed to:`, address);
  } else {
    // Deploy both on localhost
    Contract = await hre.ethers.getContractFactory("SwapAdapter");
    contract = await Contract.deploy(TRUSTED_ROUTER);
    await contract.waitForDeployment();
    deployments.SwapAdapter = await contract.getAddress();
    console.log("SwapAdapter deployed to:", deployments.SwapAdapter);

    Contract = await hre.ethers.getContractFactory("NFTAdapter");
    contract = await Contract.deploy(TRUSTED_ROUTER);
    await contract.waitForDeployment();
    deployments.NFTAdapter = await contract.getAddress();
    console.log("NFTAdapter deployed to:", deployments.NFTAdapter);
  }

  // Save deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let allDeployments = {};
  if (fs.existsSync(deploymentPath)) {
    allDeployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  allDeployments[network] = {
    ...allDeployments[network],
    ...deployments,
    network,
    deployer: deployer.address,
    trustedRouter: TRUSTED_ROUTER,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(allDeployments, null, 2));
  console.log("Deployments saved to:", deploymentPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

