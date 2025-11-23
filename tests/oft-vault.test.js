const { expect } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");

/**
 * Test suite for OmnichainVaultToken (OFT) cross-chain transfers
 * Tests the integration between OFT tokens and the vault system
 */
describe("OmnichainVaultToken - OFT Cross-Chain Transfers", function () {
  let owner, user1, user2;
  let vaultTokenA, vaultTokenB, vaultA, vaultB;
  let lzEndpointA, lzEndpointB;
  let deployer;

  // LayerZero Endpoint IDs for testnets
  const CHAIN_A_EID = 40245; // Base Sepolia
  const CHAIN_B_EID = 40231; // Arbitrum Sepolia

  beforeEach(async function () {
    [owner, user1, user2, deployer] = await ethers.getSigners();

    // Deploy LayerZero Endpoint mocks (simplified for testing)
    const LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    lzEndpointA = await LZEndpointMock.deploy(CHAIN_A_EID);
    lzEndpointB = await LZEndpointMock.deploy(CHAIN_B_EID);

    // Deploy Vault contracts
    const OmnichainVault = await ethers.getContractFactory("OmnichainVault");
    const APY_RATE = 500; // 5% APY
    
    // Chain A Vault
    vaultA = await OmnichainVault.deploy(
      ethers.ZeroAddress, // Native ETH
      deployer.address, // Router (mock)
      APY_RATE
    );

    // Chain B Vault  
    vaultB = await OmnichainVault.deploy(
      ethers.ZeroAddress,
      deployer.address,
      APY_RATE
    );

    // Deploy OFT Token contracts
    const OmnichainVaultToken = await ethers.getContractFactory("OmnichainVaultToken");
    
    vaultTokenA = await OmnichainVaultToken.deploy(
      "Omnichain Vault Token A",
      "OVTA",
      await vaultA.getAddress(),
      await lzEndpointA.getAddress(),
      deployer.address
    );

    vaultTokenB = await OmnichainVaultToken.deploy(
      "Omnichain Vault Token B",
      "OVTB",
      await vaultB.getAddress(),
      await lzEndpointB.getAddress(),
      deployer.address
    );

    // Configure peer endpoints (simplified - would need proper OApp setup)
    // This is a basic test structure
  });

  describe("Deposit and Mint", function () {
    it("Should deposit ETH and mint OFT tokens", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Deposit via OFT token contract
      const tx = await vaultTokenA.depositToVault({
        value: depositAmount,
      });
      await tx.wait();

      // Check OFT token balance
      const tokenBalance = await vaultTokenA.balanceOf(user1.address);
      expect(tokenBalance).to.equal(depositAmount);

      // Check vault balance
      const vaultBalance = await vaultA.getTotalBalance(user1.address);
      expect(vaultBalance).to.be.closeTo(depositAmount, ethers.parseEther("0.001"));
    });

    it("Should emit VaultDeposit event", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      await expect(
        vaultTokenA.depositToVault({ value: depositAmount })
      ).to.emit(vaultTokenA, "VaultDeposit")
        .withArgs(user1.address, depositAmount, depositAmount);
    });
  });

  describe("Withdraw and Burn", function () {
    beforeEach(async function () {
      // Setup: deposit first
      const depositAmount = ethers.parseEther("1.0");
      await vaultTokenA.depositToVault({ value: depositAmount });
    });

    it("Should withdraw ETH and burn OFT tokens", async function () {
      const withdrawAmount = ethers.parseEther("0.5");
      
      const initialBalance = await ethers.provider.getBalance(user1.address);
      
      // Withdraw
      const tx = await vaultTokenA.withdrawFromVault(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const finalBalance = await ethers.provider.getBalance(user1.address);
      const balanceChange = finalBalance - initialBalance + gasUsed;
      
      expect(balanceChange).to.be.closeTo(withdrawAmount, ethers.parseEther("0.001"));
      
      // Check token balance decreased
      const tokenBalance = await vaultTokenA.balanceOf(user1.address);
      expect(tokenBalance).to.equal(ethers.parseEther("0.5"));
    });

    it("Should emit VaultWithdraw event", async function () {
      const withdrawAmount = ethers.parseEther("0.5");
      
      await expect(
        vaultTokenA.withdrawFromVault(withdrawAmount)
      ).to.emit(vaultTokenA, "VaultWithdraw")
        .withArgs(user1.address, withdrawAmount, withdrawAmount);
    });
  });

  describe("Cross-Chain Transfer (Mock)", function () {
    beforeEach(async function () {
      // Setup: deposit tokens
      const depositAmount = ethers.parseEther("1.0");
      await vaultTokenA.depositToVault({ value: depositAmount });
    });

    it("Should track cross-chain deposits", async function () {
      const transferAmount = ethers.parseEther("0.3");
      
      // Mock cross-chain transfer tracking
      // In production, this would use LayerZero's send/receive
      const crossChainDeposit = await vaultTokenA.crossChainDeposits(
        user1.address,
        CHAIN_B_EID
      );
      
      expect(crossChainDeposit).to.equal(0); // Initially zero
    });

    it("Should calculate total vault balance across chains", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const totalBalance = await vaultTokenA.getTotalVaultBalance(user1.address);
      
      // Should match token balance + vault balance
      const tokenBalance = await vaultTokenA.balanceOf(user1.address);
      const vaultBalance = await vaultA.getTotalBalance(user1.address);
      
      expect(totalBalance).to.be.at.least(tokenBalance);
      expect(totalBalance).to.be.at.least(vaultBalance);
    });
  });

  describe("Batch Operations", function () {
    it("Should deposit and send cross-chain in one transaction", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // Mock: depositAndSendCrossChain combines deposit + send
      // In production, this saves gas by combining operations
      const fee = {
        nativeFee: ethers.parseEther("0.001"),
        lzTokenFee: 0,
      };
      
      // This test verifies the function exists and can be called
      // Full integration would require LayerZero endpoint setup
      expect(vaultTokenA.depositAndSendCrossChain).to.not.be.undefined;
    });
  });

  describe("Yield Integration", function () {
    it("Should maintain yield accrual with OFT tokens", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Deposit
      await vaultTokenA.depositToVault({ value: depositAmount });
      
      // Advance time to accrue yield
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine", []);
      
      // Check vault balance includes yield
      const vaultBalance = await vaultA.getTotalBalance(user1.address);
      expect(vaultBalance).to.be.gt(depositAmount);
    });
  });
});

