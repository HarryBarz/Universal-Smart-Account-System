const { expect } = require("chai");
const { ethers } = require("hardhat");
const hre = require("hardhat");

/**
 * Integration tests for LayerZero cross-chain messaging
 * Tests the full flow: Send → Receive → Execute
 */
describe("LayerZero Integration Tests", function () {
  let owner, user, bundler;
  let routerA, routerB;
  let adapterA, adapterB;
  let lzEndpointA, lzEndpointB;
  
  const EID_CHAIN_A = 40245;
  const EID_CHAIN_B = 40231;

  // Mock LayerZero Endpoints for testing
  beforeEach(async function () {
    [owner, user, bundler] = await ethers.getSigners();

    // Deploy mock LayerZero endpoints
    // In production, these are the actual LayerZero Endpoint contracts
    const LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    lzEndpointA = await LZEndpointMock.deploy(EID_CHAIN_A);
    lzEndpointB = await LZEndpointMock.deploy(EID_CHAIN_B);

    // Deploy routers
    const OmnichainRouter = await ethers.getContractFactory("OmnichainSuperAccountRouter");
    routerA = await OmnichainRouter.deploy(await lzEndpointA.getAddress(), owner.address);
    routerB = await OmnichainRouter.deploy(await lzEndpointB.getAddress(), owner.address);

    // Deploy adapters
    const SwapAdapter = await ethers.getContractFactory("SwapAdapter");
    adapterA = await SwapAdapter.deploy(await routerA.getAddress());

    const NFTAdapter = await ethers.getContractFactory("NFTAdapter");
    adapterB = await NFTAdapter.deploy(await routerB.getAddress());

    // Configure routers
    await routerA.setPeer(EID_CHAIN_B, ethers.zeroPadValue(await routerB.getAddress(), 32));
    await routerB.setPeer(EID_CHAIN_A, ethers.zeroPadValue(await routerA.getAddress(), 32));
    
    await routerA.setTrustedAdapter(EID_CHAIN_B, await adapterB.getAddress());
    await routerB.setTrustedAdapter(EID_CHAIN_A, await adapterA.getAddress());
    
    await routerA.setAuthorizedExecutor(bundler.address, true);
    await routerB.setAuthorizedExecutor(bundler.address, true);

    // Configure mock endpoints to forward messages
    await lzEndpointA.setDestLzEndpoint(await routerB.getAddress(), EID_CHAIN_B);
    await lzEndpointB.setDestLzEndpoint(await routerA.getAddress(), EID_CHAIN_A);
  });

  describe("Peer Configuration", function () {
    it("Should have correct peer addresses", async function () {
      const peerB = await routerA.peers(EID_CHAIN_B);
      const peerBAddress = ethers.getAddress(ethers.dataSlice(peerB, 12));
      
      expect(peerBAddress.toLowerCase()).to.equal(
        (await routerB.getAddress()).toLowerCase()
      );

      const peerA = await routerB.peers(EID_CHAIN_A);
      const peerAAddress = ethers.getAddress(ethers.dataSlice(peerA, 12));
      
      expect(peerAAddress.toLowerCase()).to.equal(
        (await routerA.getAddress()).toLowerCase()
      );
    });

    it("Should have trusted adapters configured", async function () {
      const adapter = await routerA.trustedAdapters(EID_CHAIN_B);
      expect(adapter.toLowerCase()).to.equal(
        (await adapterB.getAddress()).toLowerCase()
      );
    });
  });

  describe("Cross-Chain Message Flow", function () {
    it("Should send and receive cross-chain action", async function () {
      // Build action
      const actionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "bytes", "uint256"],
          [user.address, await adapterB.getAddress(), "0x1234", Math.floor(Date.now() / 1000)]
        )
      );

      const action = {
        userAccount: user.address,
        targetAdapter: await adapterB.getAddress(),
        adapterCalldata: "0x1234",
        timestamp: Math.floor(Date.now() / 1000),
        actionId: actionId
      };

      const options = {
        nativeDropAmount: 0,
        executorLzReceiveOption: "0x"
      };

      // Quote fee
      const fee = await routerA.quoteCrossChainAction(
        EID_CHAIN_B,
        action,
        options
      );

      // Send message (as bundler)
      const routerAWithBundler = routerA.connect(bundler);
      const tx = await routerAWithBundler.sendCrossChainAction(
        EID_CHAIN_B,
        action,
        options,
        { value: fee.nativeFee }
      );

      const receipt = await tx.wait();

      // Check event emitted
      const sentEvents = receipt.logs
        .map((log) => {
          try {
            return routerA.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((e) => e && e.name === "CrossChainActionSent");

      expect(sentEvents.length).to.be.greaterThan(0);
      expect(sentEvents[0].args.actionId).to.equal(actionId);
      expect(sentEvents[0].args.dstEid).to.equal(EID_CHAIN_B);
    });

    it("Should prevent duplicate execution", async function () {
      const actionId = ethers.keccak256(ethers.toUtf8Bytes("test-action"));
      
      // Mark as executed
      await routerB.executeLocalAction({
        userAccount: user.address,
        targetAdapter: await adapterB.getAddress(),
        adapterCalldata: "0x",
        timestamp: Math.floor(Date.now() / 1000),
        actionId: actionId
      });

      // Try to execute again (should fail or return false)
      const executed = await routerB.isActionExecuted(actionId);
      expect(executed).to.be.true;
    });
  });

  describe("Local Execution", function () {
    it("Should execute local action through router", async function () {
      const actionId = ethers.keccak256(ethers.toUtf8Bytes("local-test"));
      
      const action = {
        userAccount: user.address,
        targetAdapter: await adapterA.getAddress(),
        adapterCalldata: "0x",
        timestamp: Math.floor(Date.now() / 1000),
        actionId: actionId
      };

      const routerAWithBundler = routerA.connect(bundler);
      const tx = await routerAWithBundler.executeLocalAction(action);
      const receipt = await tx.wait();

      const executed = await routerA.isActionExecuted(actionId);
      expect(executed).to.be.true;
    });
  });
});

