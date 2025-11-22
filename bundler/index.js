import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { buildCompletePayload } from "./buildPayload.js";
import { buildVaultCrossChainAction } from "./vaultActions.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory (project root) or current directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config(); // Also try current directory (for Railway deployment)

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Load deployment addresses (try current directory first for Railway, then parent)
let deployments = {};
const deploymentsPaths = [
  path.join(__dirname, "deployments.json"), // Current directory (Railway)
  path.join(__dirname, "..", "deployments.json"), // Parent directory (local)
];
for (const deploymentsPath of deploymentsPaths) {
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    break;
  }
}

// Setup providers
const providerChainA = new ethers.JsonRpcProvider(process.env.RPC_CHAIN_A || "https://sepolia.base.org");
const providerChainB = new ethers.JsonRpcProvider(process.env.RPC_CHAIN_B || "https://sepolia-rollup.arbitrum.io/rpc");

// Bundler wallet (for submitting UserOps and sending cross-chain messages)
const bundlerWallet = process.env.PRIVATE_KEY_BUNDLER
  ? new ethers.Wallet(process.env.PRIVATE_KEY_BUNDLER, providerChainA)
  : null;

console.log("Bundler wallet:", bundlerWallet?.address || "NOT CONFIGURED");

// HACK_MODE: Direct adapter calls (disabled by default - use LayerZero)
// Set HACK_MODE=true in .env to enable direct calls
const HACK_MODE = process.env.HACK_MODE === "true";

if (HACK_MODE) {
  console.log("WARNING: HACK_MODE enabled: Using direct adapter calls (LayerZero integration skipped)");
} else {
  console.log("LayerZero mode: Using OmnichainSuperAccountRouter OApp for cross-chain messaging");
}

/**
 * Submit UserOperation to EntryPoint
 * For MVP: Skip EntryPoint submission since UserOp structure isn't fully ERC-4337 compliant
 * In production, use proper ERC-4337 UserOp builder and EntryPoint submission
 */
async function submitUserOp(userOp, signature) {
  const ENTRYPOINT_ADDRESS = process.env.ENTRYPOINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  
  console.log("UserOp signature received. EntryPoint:", ENTRYPOINT_ADDRESS);
  console.log("UserOp:", userOp);
  console.log("Note: EntryPoint submission skipped - UserOp structure is simplified for MVP");
  
  // Don't return a fake hash - return null instead
  // EntryPoint requires proper ERC-4337 UserOp structure with correct validation and signature format
  // For MVP, we skip EntryPoint and directly execute cross-chain actions
  // In production, use proper ERC-4337 SDK to build and submit UserOps
  
  return {
    hash: null, // No fake hash - EntryPoint not actually called
    status: "skipped",
    reason: "MVP uses simplified UserOp structure. EntryPoint submission requires full ERC-4337 compliance.",
  };
}

/**
 * Send cross-chain message via LayerZero or HACK_MODE direct call
 */
async function sendCrossChainMessage(chainId, adapterAddress, calldata, userAccount) {
  // Get source chain ID (where bundler runs)
  const sourceChainId = parseInt(process.env.CHAIN_A_ID || "84532");
  
  // If destination is same as source, execute locally through router (not cross-chain)
  if (chainId === sourceChainId) {
    console.log(`Local action: Executing through router on chain ${chainId} (same as source)`);
    
    const provider = providerChainA;
    const wallet = bundlerWallet ? new ethers.Wallet(bundlerWallet.privateKey, provider) : null;
    if (!wallet) {
      throw new Error("Bundler private key not configured");
    }
    
    // Get router address
    const chainKey = sourceChainId.toString();
    const omnichainRouterAddress = process.env.OMNICHAIN_ROUTER_ADDRESS || 
                                   deployments[chainKey]?.OmnichainSuperAccountRouter ||
                                   deployments.chainA?.OmnichainSuperAccountRouter;
    
    if (!omnichainRouterAddress || omnichainRouterAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("OmnichainSuperAccountRouter not deployed for local actions");
    }
    
    // Load router ABI (executeLocalAction function)
    const routerABI = [
      "function executeLocalAction(tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action) external returns (bool)",
    ];
    
    const router = new ethers.Contract(omnichainRouterAddress, routerABI, wallet);
    
    // Generate unique action ID for replay protection
    const actionId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "bytes", "uint256"],
        [userAccount, adapterAddress, calldata, BigInt(Math.floor(Date.now() / 1000))]
      )
    );
    
    // Build CrossChainAction struct
    const action = {
      userAccount: userAccount,
      targetAdapter: adapterAddress,
      adapterCalldata: calldata,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      actionId: actionId
    };
    
    // Extract ETH amount from calldata for vault deposits
    // Check if this is a vault adapter (deposit operation)
    let ethValue = 0n;
    try {
      // Try to decode as VaultAction: (uint8 operation, address user, uint256 amount, uint32 targetChainId)
      // If operation == 0 (Deposit) and adapter is VaultAdapter, extract amount
      const vaultAdapterA = deployments.chainA?.VaultAdapter;
      const vaultAdapterB = deployments.chainB?.VaultAdapter;
      if (adapterAddress === vaultAdapterA || adapterAddress === vaultAdapterB) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["uint8", "address", "uint256", "uint32"],
          calldata
        );
        const operation = decoded[0]; // 0 = Deposit
        if (operation === 0n) {
          ethValue = decoded[2]; // amount
          console.log(`Vault deposit detected: sending ${ethers.formatEther(ethValue)} ETH with transaction`);
        }
      }
    } catch (e) {
      // Not a vault action or decode failed, no ETH to send
      console.log("Not a vault deposit or decode failed, no ETH value");
    }
    
    // Execute local action through router with ETH value for vault deposits
    const tx = await router.executeLocalAction(action, { value: ethValue });
    await tx.wait();
    
    console.log(`SUCCESS: Local action executed through router on chain ${chainId}, tx: ${tx.hash}`);
    return {
      chainId,
      txHash: tx.hash,
      method: "local_via_router",
      actionId: actionId,
    };
  }
  
  // Cross-chain action: Use LayerZero or HACK_MODE
  if (HACK_MODE) {
    // HACK_MODE: Directly call adapter contract on destination chain
    console.log(`HACK_MODE: Directly calling adapter on chain ${chainId}`);
    
    let provider;
    if (chainId === parseInt(process.env.CHAIN_A_ID || "84532")) {
      provider = providerChainA;
    } else if (chainId === parseInt(process.env.CHAIN_B_ID || "421614")) {
      provider = providerChainB;
    } else {
      throw new Error(`Unknown chainId: ${chainId}`);
    }
    
    const wallet = bundlerWallet ? new ethers.Wallet(bundlerWallet.privateKey, provider) : null;
    if (!wallet) {
      throw new Error("Bundler private key not configured for HACK_MODE");
    }
    
    // Load adapter ABI
    const adapterABI = [
      "function executeFromEIL(address userAccount, bytes calldata payload) external",
    ];
    
    const adapter = new ethers.Contract(adapterAddress, adapterABI, wallet);
    const tx = await adapter.executeFromEIL(userAccount, calldata);
    await tx.wait();
    
    console.log(`SUCCESS: HACK_MODE: Adapter called on chain ${chainId}, tx: ${tx.hash}`);
    return {
      chainId,
      txHash: tx.hash,
      method: "direct_call",
    };
  } else {
    // LayerZero integration - USING OAPP CONTRACT (EXTENSION DEMONSTRATION)
    console.log(`LayerZero: Sending cross-chain message via OApp contract to chain ${chainId}`);
    
    try {
      // Get LayerZero endpoint address and EID for the destination chain
      const layerZeroEid = getLayerZeroEid(chainId);
      
      if (!layerZeroEid) {
        throw new Error(`LayerZero EID not configured for chain ${chainId}`);
      }
      
      // Source chain info (Chain A - where bundler runs)
      const sourceWallet = bundlerWallet;
      
      if (!sourceWallet) {
        throw new Error("Bundler wallet not configured for LayerZero");
      }
      
      // Get OApp router address (must be deployed first)
      const chainKey = sourceChainId.toString();
      const omnichainRouterAddress = process.env.OMNICHAIN_ROUTER_ADDRESS || 
                                     deployments[chainKey]?.OmnichainSuperAccountRouter ||
                                     deployments.chainA?.OmnichainSuperAccountRouter;
      
      if (!omnichainRouterAddress || omnichainRouterAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("OmnichainSuperAccountRouter not deployed. Deploy OApp contract first.");
      }
      
      // Connect to OmnichainSuperAccountRouter OApp contract
      const routerABI = [
        "function sendCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external payable returns (bytes32)",
        "function quoteCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))"
      ];
      
      const router = new ethers.Contract(omnichainRouterAddress, routerABI, sourceWallet);
      
      // Generate unique action ID for replay protection
      const actionId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "bytes", "uint256"],
          [userAccount, adapterAddress, calldata, BigInt(Math.floor(Date.now() / 1000))]
        )
      );
      
      // Build CrossChainAction struct
      const action = {
        userAccount: userAccount,
        targetAdapter: adapterAddress,
        adapterCalldata: calldata,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        actionId: actionId
      };
      
      // Build MessageOptions struct for OmnichainSuperAccountRouter
      const options = {
        nativeDropAmount: 0n,  // No native drop by default
        executorLzReceiveOption: "0x" // Default executor options (empty)
      };
      
      // Quote fee using OApp contract
      let fee;
      try {
        console.log(`Quoting LayerZero fee for EID ${layerZeroEid}...`);
        const feeResult = await router.quoteCrossChainAction(layerZeroEid, action, options);
        fee = feeResult.nativeFee;
        console.log(`LayerZero fee quote (via OApp): ${ethers.formatEther(fee)} ETH (native)`);
      } catch (error) {
        console.error("Could not get fee quote from OApp:", error.message);
        // Use a default fee (LayerZero messages typically cost 0.0001-0.001 ETH on testnets)
        fee = ethers.parseEther("0.001"); // Default fee
        console.warn(`Using default fee: ${ethers.formatEther(fee)} ETH`);
      }
      
      // Send via OApp contract (THIS DEMONSTRATES EXTENSION)
      // The sendCrossChainAction function is payable and requires native token for fees
      const feeWithBuffer = fee + (fee / 10n); // Add 10% buffer
      console.log(`Sending LayerZero message with fee: ${ethers.formatEther(feeWithBuffer)} ETH`);
      
      const tx = await router.sendCrossChainAction(
        layerZeroEid,
        action,
        options,
        {
          value: feeWithBuffer,
        }
      );
      
      const receipt = await tx.wait();
      console.log(`SUCCESS: LayerZero message sent via OApp to chain ${chainId} (EID: ${layerZeroEid}), tx: ${tx.hash}`);
      console.log(`Action ID: ${actionId}`);
      
      return {
        chainId,
        txHash: tx.hash,
        method: "layerzero_oapp",
        eid: layerZeroEid,
        actionId: actionId,
        receipt: receipt,
      };
    } catch (error) {
      console.error("LayerZero OApp send failed:", error.message);
      console.error("Error details:", error);
      // Don't fallback to HACK_MODE - throw error so user knows LayerZero failed
      throw new Error(`LayerZero send failed: ${error.message}. Check router configuration and ensure adapters trust the router.`);
    }
  }
}

/**
 * Fallback to direct adapter calls
 */
async function sendCrossChainMessageFallback(chainId, adapterAddress, calldata, userAccount) {
  console.log(`HACK_MODE: Directly calling adapter on chain ${chainId}`);
  
  let provider;
  if (chainId === parseInt(process.env.CHAIN_A_ID || "84532")) {
    provider = providerChainA;
  } else if (chainId === parseInt(process.env.CHAIN_B_ID || "421614")) {
    provider = providerChainB;
  } else {
    throw new Error(`Unknown chainId: ${chainId}`);
  }
  
  const wallet = bundlerWallet ? new ethers.Wallet(bundlerWallet.privateKey, provider) : null;
  if (!wallet) {
    throw new Error("Bundler private key not configured");
  }
  
  // Load adapter ABI
  const adapterABI = [
    "function executeFromEIL(address userAccount, bytes calldata payload) external",
  ];
  
  const adapter = new ethers.Contract(adapterAddress, adapterABI, wallet);
  const tx = await adapter.executeFromEIL(userAccount, calldata);
  await tx.wait();
  
  console.log(`SUCCESS: HACK_MODE: Adapter called on chain ${chainId}, tx: ${tx.hash}`);
  return {
    chainId,
    txHash: tx.hash,
    method: "direct_call",
  };
}

/**
 * Get LayerZero Endpoint ID for a chain
 */
function getLayerZeroEid(chainId) {
  // LayerZero Endpoint IDs (EIDs) for testnets
  const eidMap = {
    84532: parseInt(process.env.LAYER0_EID_CHAIN_A || "40245"), // Base Sepolia
    421614: parseInt(process.env.LAYER0_EID_CHAIN_B || "40231"), // Arbitrum Sepolia
  };
  const eid = eidMap[chainId];
  if (!eid) {
    console.error(`LayerZero EID not found for chainId ${chainId}`);
  }
  return eid || null;
}

/**
 * Get LayerZero Endpoint address for a chain
 */
function getLayerZeroEndpoint(chainId) {
  const endpointMap = {
    84532: process.env.LAYER0_ENDPOINT_CHAIN_A || "0x6EDCE65403992e310A62460808c4b910D972f10f",
    421614: process.env.LAYER0_ENDPOINT_CHAIN_B || "0x6EDCE65403992e310A62460808c4b910D972f10f",
  };
  return endpointMap[chainId] || null;
}

/**
 * Process EIL composite payload
 */
app.post("/api/process-payload", async (req, res) => {
  try {
    const { userOp, signature, payload } = req.body;
    
    if (!userOp || !signature || !payload) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    console.log("Processing payload:", payload);
    console.log("Payload type:", typeof payload);
    console.log("Payload keys:", Object.keys(payload || {}));
    console.log("Payload.actions:", payload.actions);
    console.log("Payload.actions type:", typeof payload.actions);
    console.log("Is payload.actions array?:", Array.isArray(payload.actions));
    
    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: "Invalid payload: payload is not an object" });
    }
    
    if (!payload.userAccount) {
      return res.status(400).json({ error: "Invalid payload: missing userAccount" });
    }
    
    // Ensure actions is an array
    if (!payload.actions) {
      console.warn("Payload missing actions array, initializing empty array");
      payload.actions = [];
    }
    
    if (!Array.isArray(payload.actions)) {
      console.error("Payload.actions is not an array:", payload.actions);
      return res.status(400).json({ 
        error: `Invalid payload: actions must be an array, got ${typeof payload.actions}`,
        received: payload.actions
      });
    }
    
    // Submit UserOp
    const userOpResult = await submitUserOp(userOp, signature);
    console.log("UserOp submitted:", userOpResult);
    
    // Process each action
    const results = [];
    for (const action of payload.actions) {
      try {
        const result = await sendCrossChainMessage(
          action.chainId,
          action.adapter,
          action.calldata,
          payload.userAccount
        );
        results.push(result);
      } catch (error) {
        console.error(`Error processing action on chain ${action.chainId}:`, error);
        results.push({
          chainId: action.chainId,
          error: error.message,
        });
      }
    }
    
    res.json({
      success: true,
      userOp: userOpResult,
      actions: results,
      payload,
    });
  } catch (error) {
    console.error("Error processing payload:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: HACK_MODE ? "HACK_MODE" : "LAYERZERO",
    bundlerAddress: bundlerWallet?.address || "NOT CONFIGURED",
  });
});

app.listen(PORT, () => {
  console.log(`Bundler/Orchestrator running on port ${PORT}`);
  console.log(`Chain A RPC: ${process.env.RPC_CHAIN_A || "https://sepolia.base.org"}`);
  console.log(`Chain B RPC: ${process.env.RPC_CHAIN_B || "https://sepolia-rollup.arbitrum.io/rpc"}`);
});

