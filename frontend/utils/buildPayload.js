import { ethers } from "ethers";

/**
 * Build EIL composite payload
 * Client-side version for frontend
 */
export function buildEILPayload({ userAccount, actions, fileOps }) {
  const payload = {
    userAccount,
    actions: actions || [],
    fileOps: fileOps || [],
    timestamp: Math.floor(Date.now() / 1000),
  };
  return payload;
}

/**
 * Build complete EIL payload with encoded calldata
 */
export function buildCompletePayload(config) {
  const { userAccount, swapParams, nftParams, fileOps } = config;
  
  const actions = [];
  
  if (swapParams) {
    // Use ethers to encode properly
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    // Convert amountIn to BigInt if it's a string, otherwise use default
    const amountIn = swapParams.amountIn 
      ? (typeof swapParams.amountIn === 'string' ? BigInt(swapParams.amountIn) : swapParams.amountIn)
      : ethers.parseEther("0.001");
    const amountOutMin = swapParams.amountOutMin 
      ? (typeof swapParams.amountOutMin === 'string' ? BigInt(swapParams.amountOutMin) : BigInt(swapParams.amountOutMin))
      : BigInt(0);
    
    const swapData = abiCoder.encode(
      ["address", "address", "uint256", "uint256"],
      [
        swapParams.tokenIn || ethers.ZeroAddress,
        swapParams.tokenOut || ethers.ZeroAddress,
        amountIn,
        amountOutMin
      ]
    );
    
    actions.push({
      chainId: swapParams.chainId || 84532,
      adapter: swapParams.adapter || "0x0000000000000000000000000000000000000000",
      calldata: swapData,
    });
  }
  
  if (nftParams) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const nftData = abiCoder.encode(["string"], [nftParams.cid]);
    
    actions.push({
      chainId: nftParams.chainId || 421614,
      adapter: nftParams.adapter || "0x0000000000000000000000000000000000000000",
      calldata: nftData,
    });
  }
  
  return {
    userAccount,
    actions,
    fileOps: fileOps || [],
    timestamp: Math.floor(Date.now() / 1000),
  };
}

