import { useState } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { buildCompletePayload } from "../utils/buildPayload.js";

export default function SignFlow({ 
  account, 
  provider, 
  cid, 
  bundlerUrl, 
  swapAdapter,
  nftAdapter,
  chainAId,
  chainBId,
  onStatusUpdate, 
  onTxLinks,
  onProgress 
}) {
  const [signing, setSigning] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleSignAndSubmit = async () => {
    if (!account || !provider || !cid) {
      onStatusUpdate("Please connect wallet and upload file first", "error");
      return;
    }

    setSigning(true);
    onStatusUpdate("Building UserOperation and payload...", "info");

    try {
      // Build EIL composite payload
      const payload = buildCompletePayload({
        userAccount: account,
        swapParams: {
          chainId: chainAId,
          adapter: swapAdapter,
          tokenIn: ethers.ZeroAddress,
          tokenOut: ethers.ZeroAddress,
          amountIn: "1000000000000000", // 0.001 ETH in wei (as string to avoid BigInt)
          amountOutMin: "0",
        },
        nftParams: {
          chainId: chainBId,
          adapter: nftAdapter,
          cid: cid,
        },
        fileOps: [
          {
            cid: cid,
            purpose: "nftMetadata",
          },
        ],
      });

      onStatusUpdate("Payload built. Requesting signature...", "info");
      if (onProgress) onProgress(75);

      // Build UserOperation (simplified for MVP)
      const maxFeePerGas = ethers.parseUnits("2", "gwei");
      const maxPriorityFeePerGas = ethers.parseUnits("1", "gwei");
      
      const userOp = {
        sender: account,
        nonce: (await provider.getTransactionCount(account)).toString(),
        callData: "0x",
        callGasLimit: "1000000",
        verificationGasLimit: "100000",
        preVerificationGas: "21000",
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        paymaster: ethers.ZeroAddress,
        paymasterData: "0x",
      };

      // Request signature
      // For MVP: Create a simple message to sign
      const messageToSign = JSON.stringify({ 
        userOp: {
          ...userOp,
          // Ensure all values are strings for serialization
        },
        payload: {
          ...payload,
          timestamp: payload.timestamp.toString(),
        }
      });
      
      // Get signer and sign the message (ethers v6 API)
      // In ethers v6, getSigner() returns a JsonRpcSigner synchronously (no await needed)
      // We don't pass account - it uses the connected account from the provider
      let signer;
      try {
        signer = provider.getSigner();
      } catch (error) {
        // If getSigner fails, try with account address
        signer = provider.getSigner(account);
      }
      
      // Verify signer exists
      if (!signer) {
        throw new Error('Unable to get signer from provider');
      }
      
      // In ethers v6, signMessage should be available on JsonRpcSigner
      // If it's not, we'll use the provider's send method directly
      let signature;
      if (typeof signer.signMessage === 'function') {
        // Use signMessage method (preferred)
        signature = await signer.signMessage(messageToSign);
      } else {
        // Fallback: Use provider.send with personal_sign
        console.warn('signMessage not available, using personal_sign fallback');
        signature = await provider.send('personal_sign', [messageToSign, account]);
      }

      onStatusUpdate("Signature received. Submitting to bundler...", "info");
      setSigning(false);
      setProcessing(true);
      if (onProgress) onProgress(80);

      // Convert payload to serializable format (handle any BigInt values)
      // Ensure actions array is explicitly preserved
      console.log("Original payload:", payload);
      console.log("Payload.actions:", payload.actions);
      console.log("Is payload.actions array?:", Array.isArray(payload.actions));
      
      // Build serializable payload explicitly
      const serializablePayload = {
        userAccount: payload.userAccount || account,
        actions: Array.isArray(payload.actions) ? payload.actions.map(action => ({
          chainId: action.chainId,
          adapter: action.adapter,
          calldata: action.calldata || "0x",
        })) : [],
        fileOps: Array.isArray(payload.fileOps) ? payload.fileOps : [],
        timestamp: payload.timestamp ? payload.timestamp.toString() : Math.floor(Date.now() / 1000).toString(),
      };
      
      // Validate actions array
      if (!Array.isArray(serializablePayload.actions) || serializablePayload.actions.length === 0) {
        console.error("ERROR: Actions array is empty or invalid!");
        console.error("Payload:", payload);
        throw new Error("Payload must contain at least one action. Actions: " + JSON.stringify(serializablePayload.actions));
      }
      
      console.log("Serializable payload:", serializablePayload);
      console.log("Actions array:", serializablePayload.actions);

      const response = await axios.post(`${bundlerUrl}/api/process-payload`, {
        userOp,
        signature,
        payload: serializablePayload,
      }, {
        timeout: 60000, // 60 second timeout
      });

      if (response.data.success) {
        onStatusUpdate("Transaction submitted successfully! Processing cross-chain actions...", "success");
        if (onProgress) onProgress(90);

        // Build transaction links - ONLY show real on-chain transactions
        const links = [];
        // Don't show UserOp link unless it's a real transaction hash
        // For MVP, EntryPoint submission is skipped (UserOp structure is simplified)
        // Only show it if we have a valid, non-null hash
        if (response.data.userOp?.hash && 
            response.data.userOp.hash !== null && 
            response.data.userOp.status === "submitted") {
          links.push({
            label: "UserOp (EntryPoint) - Chain A",
            hash: response.data.userOp.hash,
            url: `https://sepolia.basescan.org/tx/${response.data.userOp.hash}`,
            chain: "Base Sepolia",
          });
        }
        // For MVP: UserOp is skipped, only show real adapter transactions

        // Add links for all actions (cross-chain transactions)
        if (response.data.actions && Array.isArray(response.data.actions)) {
          response.data.actions.forEach((action, index) => {
            if (action.txHash) {
              const sourceChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_A_ID || "84532");
              const isLocalAction = action.chainId === sourceChainId;
              
              // Determine which chain the transaction is actually on
              // For local actions: same chain as action.chainId
              // For cross-chain (LayerZero): transaction is on source chain (Base Sepolia) where bundler sent message
              const isTransactionOnChainA = isLocalAction 
                ? (action.chainId === chainAId)
                : (action.method === "layerzero_oapp" || action.method === "layerzero_send");
              
              const explorerUrl = isTransactionOnChainA
                ? `https://sepolia.basescan.org/tx/${action.txHash}`
                : `https://sepolia.arbiscan.io/tx/${action.txHash}`;
              
              const transactionChainName = isTransactionOnChainA ? "Base Sepolia" : "Arbitrum Sepolia";
              const actionChainName = (action.chainId === chainAId || action.chainId === parseInt(process.env.NEXT_PUBLIC_CHAIN_A_ID || "84532")) ? "Base Sepolia" : "Arbitrum Sepolia";
              const actionType = action.actionType || (action.chainId === chainAId ? "Swap" : "NFT Mint");
              
              // For local actions: show transaction on same chain
              if (isLocalAction) {
                links.push({
                  label: `${actionType} - ${actionChainName}`,
                  hash: action.txHash,
                  url: explorerUrl,
                  chain: actionChainName,
                  actionType: actionType,
                });
              } else {
                // For cross-chain (LayerZero) actions:
                // 1. Show the LayerZero send transaction (on source chain)
                links.push({
                  label: `${actionType} - LayerZero Send (${transactionChainName})`,
                  hash: action.txHash,
                  url: explorerUrl,
                  chain: transactionChainName,
                  actionType: actionType,
                });
                
                // 2. Add pending indicator for destination execution
                links.push({
                  label: `${actionType} - Execution (${actionChainName})`,
                  hash: "Pending LayerZero delivery...",
                  url: "#",
                  chain: actionChainName,
                  actionType: actionType,
                  isPending: true,
                  note: "LayerZero message is being delivered. Execution will happen on destination chain in 30-60 seconds. Check the router events on Arbitrum Sepolia."
                });
              }
            } else if (action.error) {
              // Show error for failed actions
              links.push({
                label: `Action ${index + 1} - Error`,
                hash: action.error,
                url: "#",
                chain: `Chain ${action.chainId}`,
                isError: true,
              });
            }
          });
        }

        onTxLinks(links);
        if (onProgress) onProgress(100);
        onStatusUpdate(
          `Success! ${links.length} transaction(s) submitted. Check the links below.`,
          "success"
        );
      } else {
        throw new Error(response.data.error || "Submission failed");
      }
    } catch (error) {
      console.error("Error in sign and submit:", error);
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      onStatusUpdate(`Error: ${errorMessage}`, "error");
      
      if (errorMessage.includes("timeout")) {
        onStatusUpdate("Request timed out. Please check if the bundler is running.", "error");
      }
    } finally {
      setSigning(false);
      setProcessing(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSignAndSubmit}
        disabled={signing || processing || !account || !cid}
        className="btn btn-primary"
        style={{ 
          padding: "1rem 2rem",
          fontSize: "1.125rem",
          width: "100%",
          justifyContent: "center"
        }}
      >
        {signing ? (
          <>
            <span className="loading"></span>
            Signing...
          </>
        ) : processing ? (
          <>
            <span className="loading"></span>
            Processing...
          </>
        ) : (
          "Sign & Execute"
        )}
      </button>
      <p style={{ 
        marginTop: "1rem", 
        fontSize: "0.875rem", 
        color: "var(--text-muted)",
        textAlign: "center"
      }}>
        {signing
          ? "Please sign the message in MetaMask..."
          : processing
          ? "Submitting to bundler and executing cross-chain actions..."
          : "Click to sign once and execute actions on both chains"}
      </p>
      
      {account && cid && (
        <div style={{ 
          marginTop: "1rem", 
          padding: "1rem", 
          background: "var(--bg)", 
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          color: "var(--text-muted)"
        }}>
          <p><strong>Will execute:</strong></p>
          <ul style={{ marginLeft: "1.5rem", marginTop: "0.5rem" }}>
            <li>Swap on Chain A (Base Sepolia)</li>
            <li>Mint NFT on Chain B (Arbitrum Sepolia) with CID: {cid.substring(0, 20)}...</li>
          </ul>
        </div>
      )}
    </div>
  );
}
