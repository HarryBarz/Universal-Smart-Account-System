import { ethers } from "ethers";

/**
 * Build EIL composite payload
 * @param {Object} params - Payload parameters
 * @param {string} params.userAccount - User account address
 * @param {Array} params.actions - Array of actions {chainId, adapter, calldata}
 * @param {Array} params.fileOps - Array of file operations {cid, purpose}
 * @returns {string} JSON string of composite payload
 */
export function buildEILPayload({ userAccount, actions, fileOps }) {
  const payload = {
    userAccount,
    actions: actions || [],
    fileOps: fileOps || [],
    timestamp: Math.floor(Date.now() / 1000),
  };
  return JSON.stringify(payload);
}

/**
 * Encode action calldata for SwapAdapter
 * @param {Object} params - Swap parameters
 * @returns {string} Encoded calldata hex
 */
export function encodeSwapCalldata({ tokenIn, tokenOut, amountIn, amountOutMin }) {
  const iface = new ethers.Interface([
    "function executeFromEIL(address userAccount, bytes calldata payload)",
  ]);
  
  // Encode SwapParams
  const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],
    [tokenIn || ethers.ZeroAddress, tokenOut || ethers.ZeroAddress, amountIn || 0, amountOutMin || 0]
  );
  
  // This would be the payload passed to executeFromEIL
  return swapParams;
}

/**
 * Encode action calldata for NFTAdapter
 * @param {string} cid - Filecoin CID
 * @returns {string} Encoded calldata hex
 */
export function encodeNFTMintCalldata(cid) {
  // Encode string CID as payload
  return ethers.AbiCoder.defaultAbiCoder().encode(["string"], [cid]);
}

/**
 * Build complete EIL payload with encoded calldata
 * @param {Object} config - Configuration object
 * @returns {Object} Complete payload object with encoded calldata
 */
export function buildCompletePayload(config) {
  const { userAccount, swapParams, nftParams, fileOps } = config;
  
  const actions = [];
  
  if (swapParams) {
    const swapCalldata = encodeSwapCalldata(swapParams);
    actions.push({
      chainId: swapParams.chainId || parseInt(process.env.CHAIN_A_ID || "84532"),
      adapter: swapParams.adapter || process.env.SWAP_ADAPTER_ADDRESS,
      calldata: swapCalldata,
    });
  }
  
  if (nftParams) {
    const nftCalldata = encodeNFTMintCalldata(nftParams.cid);
    actions.push({
      chainId: nftParams.chainId || parseInt(process.env.CHAIN_B_ID || "421614"),
      adapter: nftParams.adapter || process.env.NFT_ADAPTER_ADDRESS,
      calldata: nftCalldata,
    });
  }
  
  return {
    userAccount,
    actions,
    fileOps: fileOps || [],
    timestamp: Math.floor(Date.now() / 1000),
  };
}

