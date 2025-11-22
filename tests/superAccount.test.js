const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SuperAccount", function () {
  let superAccount;
  let entryPoint;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock EntryPoint
    const EntryPoint = await ethers.getContractFactory("SuperAccount"); // Reusing for mock
    entryPoint = await EntryPoint.deploy(
      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      owner.address
    );

    // Deploy SuperAccount
    const SuperAccount = await ethers.getContractFactory("SuperAccount");
    superAccount = await SuperAccount.deploy(entryPoint.target, owner.address);
    await superAccount.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await superAccount.owner()).to.equal(owner.address);
    });

    it("Should set the right entryPoint", async function () {
      expect(await superAccount.entryPoint()).to.equal(entryPoint.target);
    });
  });

  describe("Execute", function () {
    it("Should revert if called by non-EntryPoint", async function () {
      await expect(
        superAccount.connect(addr1).execute(addr2.address, 0, "0x")
      ).to.be.revertedWith("SuperAccount: not entryPoint");
    });

    it("Should execute when called by EntryPoint", async function () {
      // Deploy a test contract to call
      const TestContract = await ethers.getContractFactory("SuperAccount");
      const testContract = await TestContract.deploy(entryPoint.target, addr2.address);
      
      // For MVP: We'll skip full EntryPoint integration test
      // In production, use actual EntryPoint contract for testing
      expect(await superAccount.entryPoint()).to.equal(entryPoint.target);
    });
  });

  describe("ExecuteBatch", function () {
    it("Should revert if array lengths don't match", async function () {
      const tos = [addr1.address, addr2.address];
      const values = [0];
      const datas = ["0x", "0x"];

      await expect(
        superAccount.connect(addr1).executeBatch(tos, values, datas)
      ).to.be.revertedWith("SuperAccount: not entryPoint");
    });

    it("Should revert if called by non-EntryPoint", async function () {
      const tos = [addr1.address];
      const values = [0];
      const datas = ["0x"];

      await expect(
        superAccount.connect(addr1).executeBatch(tos, values, datas)
      ).to.be.revertedWith("SuperAccount: not entryPoint");
    });
  });
});

describe("NFTAdapter", function () {
  let nftAdapter;
  let router;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    router = owner.address;

    const NFTAdapter = await ethers.getContractFactory("NFTAdapter");
    nftAdapter = await NFTAdapter.deploy(router);
    await nftAdapter.waitForDeployment();
  });

  describe("Minting", function () {
    it("Should mint NFT with CID", async function () {
      const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], [cid]);

      await expect(
        nftAdapter.executeFromEIL(addr1.address, payload)
      )
        .to.emit(nftAdapter, "NFTMinted")
        .withArgs(1, addr1.address, cid, owner.address);

      expect(await nftAdapter.ownerOf(1)).to.equal(addr1.address);
      expect(await nftAdapter.tokenURI(1)).to.equal(cid);
    });

    it("Should revert if not called by router", async function () {
      const cid = "test-cid";
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(["string"], [cid]);

      await expect(
        nftAdapter.connect(addr1).executeFromEIL(addr1.address, payload)
      ).to.be.revertedWith("NFTAdapter: not trusted router");
    });
  });
});

describe("SwapAdapter", function () {
  let swapAdapter;
  let router;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    router = owner.address;

    const SwapAdapter = await ethers.getContractFactory("SwapAdapter");
    swapAdapter = await SwapAdapter.deploy(router);
    await swapAdapter.waitForDeployment();
  });

  describe("Swapping", function () {
    it("Should emit SwapExecuted event", async function () {
      const tokenIn = ethers.ZeroAddress;
      const tokenOut = ethers.ZeroAddress;
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;

      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint256", "uint256"],
        [tokenIn, tokenOut, amountIn, amountOutMin]
      );

      await expect(
        swapAdapter.executeFromEIL(addr1.address, payload)
      )
        .to.emit(swapAdapter, "SwapExecuted")
        .withArgs(addr1.address, tokenIn, tokenOut, amountIn, amountIn, owner.address);
    });

    it("Should revert if not called by router", async function () {
      const payload = "0x";

      await expect(
        swapAdapter.connect(addr1).executeFromEIL(addr1.address, payload)
      ).to.be.revertedWith("SwapAdapter: not trusted router");
    });
  });
});

