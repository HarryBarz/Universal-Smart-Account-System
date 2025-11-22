const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`Deploying SuperAccount to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // EntryPoint address (ERC-4337 standard)
  const ENTRYPOINT_ADDRESS = process.env.ENTRYPOINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const OWNER = process.env.OWNER_ADDRESS || deployer.address;

  // Deploy EntryPoint interface mock (for testing)
  // In production, use the actual EntryPoint contract address
  const EntryPoint = await hre.ethers.getContractFactory("SuperAccount");
  
  // Deploy SuperAccount
  const SuperAccount = await hre.ethers.getContractFactory("SuperAccount");
  const entryPointContract = await hre.ethers.getContractAt("IEntryPoint", ENTRYPOINT_ADDRESS);
  const superAccount = await SuperAccount.deploy(entryPointContract.target, OWNER);
  await superAccount.waitForDeployment();
  const superAccountAddress = await superAccount.getAddress();
  console.log("SuperAccount deployed to:", superAccountAddress);

  // Deploy EILRouter
  const EILRouter = await hre.ethers.getContractFactory("EILRouter");
  const eilRouter = await EILRouter.deploy(superAccountAddress);
  await eilRouter.waitForDeployment();
  const eilRouterAddress = await eilRouter.getAddress();
  console.log("EILRouter deployed to:", eilRouterAddress);

  // Save deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let allDeployments = {};
  if (fs.existsSync(deploymentPath)) {
    allDeployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  allDeployments[network] = {
    ...allDeployments[network],
    SuperAccount: superAccountAddress,
    EILRouter: eilRouterAddress,
    EntryPoint: ENTRYPOINT_ADDRESS,
    Owner: OWNER,
    network,
    deployer: deployer.address,
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

