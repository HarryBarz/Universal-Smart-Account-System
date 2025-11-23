const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OmnichainVault", function () {
  let vault;
  let vaultAdapter;
  let router;
  let owner;
  let user;
  let user2;

  const APY_RATE = 500; // 5% APY in basis points
  const BASIS_POINTS = 10000;
  const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // 365 days

  beforeEach(async function () {
    [owner, user, user2] = await ethers.getSigners();
    router = owner.address; // Mock router address

    // Deploy OmnichainVault (native ETH vault)
    const OmnichainVault = await ethers.getContractFactory("OmnichainVault");
    vault = await OmnichainVault.deploy(ethers.ZeroAddress, router, APY_RATE);
    await vault.waitForDeployment();

    // Deploy VaultAdapter
    const VaultAdapter = await ethers.getContractFactory("VaultAdapter");
    vaultAdapter = await VaultAdapter.deploy(router, await vault.getAddress());
    await vaultAdapter.waitForDeployment();

    // Update vault router to adapter (for testing via adapter)
    await vault.setRouter(await vaultAdapter.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct APY rate", async function () {
      expect(await vault.apyRate()).to.equal(APY_RATE);
      expect(await vault.getAPYRate()).to.equal(APY_RATE);
    });

    it("Should initialize with zero balances", async function () {
      expect(await vault.userBalances(user.address)).to.equal(0);
      expect(await vault.totalSupply()).to.equal(0);
      expect(await vault.totalYieldGenerated()).to.equal(0);
    });

    it("Should allow native ETH deposits (token == address(0))", async function () {
      expect(await vault.token()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Deposits", function () {
    it("Should deposit ETH and credit user balance", async function () {
      const depositAmount = ethers.parseEther("1.0");

      // Deposit via adapter (simulating router call)
      const action = {
        operation: 0, // Deposit
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      await expect(
        vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
          value: depositAmount,
        })
      )
        .to.emit(vault, "Deposit")
        .withArgs(user.address, chainId, depositAmount, depositAmount);

      expect(await vault.userBalances(user.address)).to.equal(depositAmount);
      expect(await vault.totalSupply()).to.equal(depositAmount);
      expect(await vault.getPrincipalBalance(user.address)).to.equal(depositAmount);
      
      // Verify ETH was actually transferred to the vault contract
      const vaultBalance = await ethers.provider.getBalance(await vault.getAddress());
      expect(vaultBalance).to.equal(depositAmount);
    });

    it("Should transfer ETH to vault contract on deposit", async function () {
      const depositAmount = ethers.parseEther("2.5");
      
      // Check initial vault balance
      const vaultAddress = await vault.getAddress();
      const vaultBalanceBefore = await ethers.provider.getBalance(vaultAddress);
      expect(vaultBalanceBefore).to.equal(0);

      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      // Deposit via adapter
      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Verify ETH was transferred to vault
      const vaultBalanceAfter = await ethers.provider.getBalance(vaultAddress);
      expect(vaultBalanceAfter).to.equal(depositAmount);
      
      // Verify user balance was credited
      expect(await vault.userBalances(user.address)).to.equal(depositAmount);
    });

    it("Should set deposit timestamp on first deposit", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      const timestamp = await vault.userDepositTimestamps(user.address);
      expect(timestamp).to.be.gt(0);
      expect(timestamp).to.be.closeTo(await time.latest(), 5); // Within 5 seconds
    });

    it("Should accrue yield on deposit", async function () {
      const depositAmount = ethers.parseEther("10.0");

      // First deposit
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Wait 30 days (for yield accrual)
      await time.increase(30 * 24 * 60 * 60);

      // Second deposit should accrue yield before updating balance
      const secondDeposit = ethers.parseEther("5.0");
      const action2 = {
        operation: 0,
        user: user.address,
        amount: secondDeposit,
        targetChainId: 0,
      };
      const payload2 = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action2.operation, action2.user, action2.amount, action2.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload2, {
        value: secondDeposit,
      });

      // Should have accrued yield from first deposit
      const accruedYield = await vault.getAccruedYield(user.address);
      expect(accruedYield).to.be.gt(0);
    });
  });

  describe("Yield Calculation", function () {
    beforeEach(async function () {
      // Make a deposit first
      const depositAmount = ethers.parseEther("100.0");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });
    });

    it("Should calculate yield correctly after time passes", async function () {
      const principal = ethers.parseEther("100.0");

      // Wait 365 days (1 year)
      await time.increase(SECONDS_PER_YEAR);

      // Calculate expected yield: 100 * 0.05 * 1 = 5 ETH
      const expectedYield = (principal * BigInt(APY_RATE) * BigInt(SECONDS_PER_YEAR)) / (BigInt(BASIS_POINTS) * BigInt(SECONDS_PER_YEAR));
      expect(expectedYield).to.equal(ethers.parseEther("5.0"));

      // Trigger yield accrual by calling _accrueYield (via a deposit)
      const depositAmount = ethers.parseEther("0.0001");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Check accrued yield (should be close to 5 ETH)
      const accruedYield = await vault.getAccruedYield(user.address);
      expect(accruedYield).to.be.closeTo(ethers.parseEther("5.0"), ethers.parseEther("0.1"));
    });

    it("Should calculate pending yield correctly without modifying state", async function () {
      // Wait 30 days
      const daysElapsed = 30;
      await time.increase(daysElapsed * 24 * 60 * 60);

      // Calculate expected yield for 30 days
      const principal = ethers.parseEther("100.0");
      const timeElapsed = BigInt(daysElapsed * 24 * 60 * 60);
      const expectedYield = (principal * BigInt(APY_RATE) * timeElapsed) / (BigInt(BASIS_POINTS) * BigInt(SECONDS_PER_YEAR));

      // Get pending yield (view function, doesn't modify state)
      const pendingYield = await vault.calculatePendingYield(user.address);
      expect(pendingYield).to.be.closeTo(expectedYield, ethers.parseEther("0.01"));
    });

    it("Should return zero yield for zero balance", async function () {
      const pendingYield = await vault.calculatePendingYield(user2.address);
      expect(pendingYield).to.equal(0);
      
      const accruedYield = await vault.getAccruedYield(user2.address);
      expect(accruedYield).to.equal(0);
    });

    it("Should return zero yield when APY is zero", async function () {
      // Set APY to zero
      await vault.setAPYRate(0);

      // Wait some time
      await time.increase(30 * 24 * 60 * 60);

      // Trigger yield accrual (should not accrue anything)
      const depositAmount = ethers.parseEther("0.0001");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Should have no new yield
      const accruedYield = await vault.getAccruedYield(user.address);
      expect(accruedYield).to.equal(0);
    });

    it("Should calculate yield proportionally to time elapsed", async function () {
      const principal = ethers.parseEther("100.0");

      // Wait 6 months (half a year)
      const sixMonths = Math.floor(SECONDS_PER_YEAR / 2);
      await time.increase(sixMonths);

      // Trigger yield accrual
      const depositAmount = ethers.parseEther("0.0001");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Expected yield: 100 * 0.05 * 0.5 = 2.5 ETH
      const expectedYield = (principal * BigInt(APY_RATE) * BigInt(sixMonths)) / (BigInt(BASIS_POINTS) * BigInt(SECONDS_PER_YEAR));
      const accruedYield = await vault.getAccruedYield(user.address);
      expect(accruedYield).to.be.closeTo(expectedYield, ethers.parseEther("0.1"));
    });
  });

  describe("Total Balance", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseEther("100.0");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });
    });

    it("Should return principal + accrued + pending yield", async function () {
      // Wait 30 days
      await time.increase(30 * 24 * 60 * 60);

      const principal = await vault.getPrincipalBalance(user.address);
      const accruedYield = await vault.getAccruedYield(user.address);
      const pendingYield = await vault.calculatePendingYield(user.address);
      const totalBalance = await vault.getTotalBalance(user.address);

      // Total balance should be principal + pending yield
      expect(totalBalance).to.equal(principal + pendingYield);
      
      // Pending yield includes accrued yield + new yield
      expect(pendingYield).to.be.gte(accruedYield);
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Make a deposit and wait for yield
      const depositAmount = ethers.parseEther("100.0");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Wait 30 days to accrue yield
      await time.increase(30 * 24 * 60 * 60);

      // Trigger yield accrual
      const smallDeposit = ethers.parseEther("0.0001");
      const action2 = {
        operation: 0,
        user: user.address,
        amount: smallDeposit,
        targetChainId: 0,
      };
      const payload2 = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action2.operation, action2.user, action2.amount, action2.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload2, {
        value: smallDeposit,
      });
    });

    it("Should withdraw from accumulated yield first", async function () {
      const initialPrincipal = await vault.getPrincipalBalance(user.address);
      const initialYield = await vault.getAccruedYield(user.address);
      
      expect(initialYield).to.be.gt(0); // Should have some yield

      // Withdraw amount less than yield
      const withdrawAmount = initialYield / 2n;
      
      // Direct withdrawal by user (public function)
      const userBalanceBefore = await ethers.provider.getBalance(user.address);
      const tx = await vault.connect(user).withdraw(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      await expect(tx).to.emit(vault, "Withdraw");
      
      const userBalanceAfter = await ethers.provider.getBalance(user.address);
      
      // Check that yield was deducted but principal remains
      const remainingYield = await vault.getAccruedYield(user.address);
      const remainingPrincipal = await vault.getPrincipalBalance(user.address);
      
      expect(remainingYield).to.be.closeTo(initialYield - withdrawAmount, ethers.parseEther("0.001"));
      expect(remainingPrincipal).to.equal(initialPrincipal);
      
      // Check ETH was transferred (accounting for gas)
      expect(userBalanceAfter).to.be.closeTo(userBalanceBefore + withdrawAmount - gasUsed, ethers.parseEther("0.001"));
    });

    it("Should withdraw from yield first, then principal", async function () {
      const initialPrincipal = await vault.getPrincipalBalance(user.address);
      const initialYield = await vault.getAccruedYield(user.address);
      
      // Withdraw amount greater than yield
      const withdrawAmount = initialYield + ethers.parseEther("10.0");
      
      // Direct withdrawal by user
      await expect(vault.connect(user).withdraw(withdrawAmount))
        .to.emit(vault, "Withdraw");
      
      // Check that all yield was deducted and principal was also deducted
      const remainingYield = await vault.getAccruedYield(user.address);
      const remainingPrincipal = await vault.getPrincipalBalance(user.address);
      
      expect(remainingYield).to.equal(0);
      const expectedPrincipalDeduction = withdrawAmount - initialYield;
      expect(remainingPrincipal).to.be.closeTo(initialPrincipal - expectedPrincipalDeduction, ethers.parseEther("0.001"));
    });

    it("Should revert if withdrawing more than total balance", async function () {
      const totalBalance = await vault.getTotalBalance(user.address);
      const excessiveAmount = totalBalance + ethers.parseEther("1.0");
      
      // Direct withdrawal by user should revert
      await expect(
        vault.connect(user).withdraw(excessiveAmount)
      ).to.be.revertedWith("OmnichainVault: insufficient balance");
    });
  });

  describe("APY Rate Management", function () {
    it("Should allow owner to update APY rate", async function () {
      const newAPY = 1000; // 10% APY
      await vault.setAPYRate(newAPY);
      
      expect(await vault.getAPYRate()).to.equal(newAPY);
      expect(await vault.apyRate()).to.equal(newAPY);
    });

    it("Should revert if non-owner tries to update APY", async function () {
      const newAPY = 1000;
      await expect(
        vault.connect(user).setAPYRate(newAPY)
      ).to.be.revertedWith("OmnichainVault: not owner");
    });

    it("Should revert if APY exceeds 100%", async function () {
      const excessiveAPY = BASIS_POINTS * 100 + 1; // > 100%
      await expect(
        vault.setAPYRate(excessiveAPY)
      ).to.be.revertedWith("OmnichainVault: APY too high");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple deposits and withdrawals correctly", async function () {
      // Multiple deposits
      for (let i = 0; i < 3; i++) {
        const depositAmount = ethers.parseEther("10.0");
        const action = {
          operation: 0,
          user: user.address,
          amount: depositAmount,
          targetChainId: 0,
        };
        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint8", "address", "uint256", "uint32"],
          [action.operation, action.user, action.amount, action.targetChainId]
        );

        await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
          value: depositAmount,
        });

        // Wait some time between deposits
        await time.increase(10 * 24 * 60 * 60); // 10 days
      }

      const totalPrincipal = await vault.getPrincipalBalance(user.address);
      expect(totalPrincipal).to.equal(ethers.parseEther("30.0"));

      // Should have accrued yield
      const accruedYield = await vault.getAccruedYield(user.address);
      expect(accruedYield).to.be.gt(0);
    });

    it("Should handle zero time elapsed correctly", async function () {
      const depositAmount = ethers.parseEther("100.0");
      const action = {
        operation: 0,
        user: user.address,
        amount: depositAmount,
        targetChainId: 0,
      };
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint32"],
        [action.operation, action.user, action.amount, action.targetChainId]
      );

      await vaultAdapter.connect(owner).executeFromEIL(user.address, payload, {
        value: depositAmount,
      });

      // Immediately check yield (should be zero or minimal)
      const pendingYield = await vault.calculatePendingYield(user.address);
      expect(pendingYield).to.be.lt(ethers.parseEther("0.0001")); // Very small or zero
    });
  });
});

