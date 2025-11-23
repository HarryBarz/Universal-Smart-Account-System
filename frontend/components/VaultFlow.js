import { useState, useEffect } from "react";
import { ethers } from "ethers";
import axios from "axios";

export default function VaultFlow({
  account,
  provider,
  bundlerUrl,
  vaultA,
  vaultAdapterA,
  vaultB,
  vaultAdapterB,
  chainAId,
  chainBId,
  onStatusUpdate,
  onTxLinks,
  onProgress
}) {
  const [operation, setOperation] = useState("deposit"); // deposit, withdraw
  const [amount, setAmount] = useState("");
  const [targetChain, setTargetChain] = useState("chainA"); // chainA, chainB
  const [processing, setProcessing] = useState(false);
  const [vaultBalance, setVaultBalance] = useState(null);
  const [chainBalances, setChainBalances] = useState({ chainA: null, chainB: null });
  const [loadingBalance, setLoadingBalance] = useState(false);

  const loadBalance = async () => {
    if (!account || !provider) return;
    
    setLoadingBalance(true);
    try {
      const vaultABI = [
        "function getTotalBalance(address user) external view returns (uint256)",
        "function getPrincipalBalance(address user) external view returns (uint256)",
        "function getAccruedYield(address user) external view returns (uint256)",
        "function calculatePendingYield(address user) external view returns (uint256)",
        "function getChainBalance(address user, uint32 chainId) external view returns (uint256)",
        "function getAPYRate() external view returns (uint256)"
      ];
      
      const balances = { chainA: null, chainB: null };
      let totalBalance = 0;
      
      // Get network info from provider to determine current chain
      let network;
      try {
        network = await provider.getNetwork();
      } catch (error) {
        console.error("Error getting network:", error);
      }
      
      // Load balance from Chain A vault (Base Sepolia)
      if (vaultA) {
        try {
          const providerA = new ethers.JsonRpcProvider("https://sepolia.base.org");
          const vaultContractA = new ethers.Contract(vaultA, vaultABI, providerA);
          const balanceA = await vaultContractA.getTotalBalance(account);
          const principalA = await vaultContractA.getPrincipalBalance(account);
          const yieldA = await vaultContractA.calculatePendingYield(account);
          
          const balanceAFormatted = parseFloat(ethers.formatEther(balanceA));
          balances.chainA = balanceAFormatted;
          totalBalance += balanceAFormatted;
          
          console.log(`Chain A - Principal: ${ethers.formatEther(principalA)}, Yield: ${ethers.formatEther(yieldA)}, Total: ${balanceAFormatted}`);
        } catch (error) {
          console.error("Error loading Chain A balance:", error);
        }
      }
      
      // Load balance from Chain B vault (Arbitrum Sepolia)
      if (vaultB) {
        try {
          const providerB = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
          const vaultContractB = new ethers.Contract(vaultB, vaultABI, providerB);
          const balanceB = await vaultContractB.getTotalBalance(account);
          const principalB = await vaultContractB.getPrincipalBalance(account);
          const yieldB = await vaultContractB.calculatePendingYield(account);
          
          const balanceBFormatted = parseFloat(ethers.formatEther(balanceB));
          balances.chainB = balanceBFormatted;
          totalBalance += balanceBFormatted;
          
          console.log(`Chain B - Principal: ${ethers.formatEther(principalB)}, Yield: ${ethers.formatEther(yieldB)}, Total: ${balanceBFormatted}`);
        } catch (error) {
          console.error("Error loading Chain B balance:", error);
        }
      }
      
      // Set total balance and per-chain balances
      setVaultBalance(totalBalance > 0 ? totalBalance.toFixed(6) : "0.0");
      setChainBalances(balances);
      
    } catch (error) {
      console.error("Error loading balance:", error);
      setVaultBalance("0.0");
      setChainBalances({ chainA: null, chainB: null });
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleVaultOperation = async () => {
    if (!account || !provider || !amount) {
      onStatusUpdate("Please enter an amount", "error");
      return;
    }

    setProcessing(true);
    onStatusUpdate("Building vault operation payload...", "info");

    try {
      // Determine which vault adapter to use based on target chain
      const vaultAdapter = targetChain === "chainA" ? vaultAdapterA : vaultAdapterB;
      const chainId = targetChain === "chainA" ? chainAId : chainBId;
      
      if (!vaultAdapter) {
        throw new Error("Vault adapter not found for selected chain");
      }

      // Build vault action matching VaultAdapter.VaultAction struct
      // VaultOperation enum: Deposit=0, Withdraw=1, CrossChainDeposit=2, CrossChainWithdraw=3
      const amountWei = ethers.parseEther(amount);
      const vaultAction = {
        operation: operation === "deposit" ? 0 : 1, // VaultOperation.Deposit = 0, Withdraw = 1
        user: account,
        amount: amountWei,
        targetChainId: 0 // Local operation for now
      };

      // Encode vault action - matches VaultAction struct in VaultAdapter.sol
      // struct VaultAction {
      //   VaultOperation operation;  // uint8 (enum)
      //   address user;
      //   uint256 amount;
      //   uint32 targetChainId;
      // }
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const calldata = abiCoder.encode(
        ["uint8", "address", "uint256", "uint32"],
        [vaultAction.operation, vaultAction.user, vaultAction.amount, vaultAction.targetChainId]
      );

      // Build EIL payload with vault action
      const payload = {
        userAccount: account,
        actions: [{
          chainId: chainId,
          adapter: vaultAdapter,
          calldata: calldata
        }],
        fileOps: [],
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Build UserOperation
      const userOp = {
        sender: account,
        nonce: (await provider.getTransactionCount(account)).toString(),
        callData: "0x",
        callGasLimit: "1000000",
        verificationGasLimit: "100000",
        preVerificationGas: "21000",
        maxFeePerGas: ethers.parseUnits("2", "gwei").toString(),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei").toString(),
        paymaster: ethers.ZeroAddress,
        paymasterData: "0x",
      };

      // Request signature
      const messageToSign = JSON.stringify({ userOp, payload });
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(messageToSign);

      onStatusUpdate("Submitting vault operation...", "info");
      if (onProgress) onProgress(50);

      // Submit to bundler
      const response = await axios.post(`${bundlerUrl}/api/process-payload`, {
        userOp,
        signature,
        payload: {
          ...payload,
          actions: payload.actions.map(a => ({
            ...a,
            calldata: a.calldata || "0x"
          }))
        }
      }, {
        timeout: 60000
      });

      if (response.data.success) {
        onStatusUpdate(`${operation === "deposit" ? "Deposit" : "Withdraw"} submitted successfully!`, "success");
        if (onProgress) onProgress(90);

        // Build transaction links
        const links = [];
        let confirmedTxHash = null;
        let confirmedChainId = null;
        
        if (response.data.actions && Array.isArray(response.data.actions)) {
          response.data.actions.forEach((action) => {
            if (action.txHash) {
              const isChainA = action.chainId === chainAId;
              links.push({
                label: `Vault ${operation === "deposit" ? "Deposit" : "Withdraw"} - ${isChainA ? "Base Sepolia" : "Arbitrum Sepolia"}`,
                hash: action.txHash,
                url: isChainA 
                  ? `https://sepolia.basescan.org/tx/${action.txHash}`
                  : `https://sepolia.arbiscan.io/tx/${action.txHash}`,
                chain: isChainA ? "Base Sepolia" : "Arbitrum Sepolia",
                actionType: operation === "deposit" ? "Deposit" : "Withdraw"
              });
              
              // Track the first transaction hash for confirmation
              if (!confirmedTxHash) {
                confirmedTxHash = action.txHash;
                confirmedChainId = action.chainId;
              }
            }
          });
        }

        onTxLinks(links);
        
        // Wait for transaction confirmation and then refresh balance
        if (confirmedTxHash) {
          onStatusUpdate("Waiting for transaction confirmation...", "info");
          
          try {
            // Get the provider for the chain where the transaction was executed
            let txProvider = provider;
            if (confirmedChainId === chainAId) {
              txProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
            } else if (confirmedChainId === chainBId) {
              txProvider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
            }
            
            // Wait for transaction to be mined (with timeout)
            console.log(`Waiting for transaction ${confirmedTxHash} to be confirmed...`);
            const receipt = await txProvider.waitForTransaction(confirmedTxHash, 1, 60000); // Wait up to 60 seconds, 1 confirmation
            
            if (receipt && receipt.status === 1) {
              console.log(`Transaction confirmed! Block: ${receipt.blockNumber}`);
              onStatusUpdate("Transaction confirmed! Updating balance...", "success");
              
              // Wait a bit for state to sync, then refresh balance
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Refresh balance with retries
              let balanceUpdated = false;
              for (let i = 0; i < 5; i++) {
                await loadBalance();
                
                // Check if balance has changed (optional - can remove if balance is always expected to change)
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries
                
                if (i === 4) balanceUpdated = true; // After 5 retries, assume updated
              }
              
              if (balanceUpdated) {
                onStatusUpdate(`${operation === "deposit" ? "Deposit" : "Withdraw"} complete! Balance updated.`, "success");
                if (onProgress) onProgress(100);
              }
            } else {
              throw new Error("Transaction failed or was reverted");
            }
          } catch (error) {
            console.error("Error waiting for transaction confirmation:", error);
            onStatusUpdate(`Transaction sent but confirmation timeout. Please refresh manually.`, "warning");
            
            // Still try to refresh balance in case it went through
            setTimeout(async () => {
              for (let i = 0; i < 3; i++) {
                await loadBalance();
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }, 5000);
          }
        } else {
          // No transaction hash - might be pending LayerZero message
          onStatusUpdate("Action submitted. Balance will update when transaction confirms.", "info");
          if (onProgress) onProgress(100);
          
          // Try refreshing balance anyway after a delay
          setTimeout(async () => {
            for (let i = 0; i < 3; i++) {
              await loadBalance();
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }, 10000);
        }
      } else {
        throw new Error(response.data.error || "Operation failed");
      }
    } catch (error) {
      console.error("Error in vault operation:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    } finally {
      setProcessing(false);
    }
  };

  // Load balance on mount and when account changes
  useEffect(() => {
    if (account && (vaultA || vaultB)) {
      loadBalance();
    }
  }, [account, vaultA, vaultB]);
  
  // Also reload when target chain changes (to show correct chain balance)
  useEffect(() => {
    if (account && (vaultA || vaultB)) {
      loadBalance();
    }
  }, [targetChain]);
  
  // Auto-refresh balance every 30 seconds
  useEffect(() => {
    if (!account) return;
    
    const interval = setInterval(() => {
      loadBalance();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [account]);

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
          Operation:
        </label>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            onClick={() => setOperation("deposit")}
            className={operation === "deposit" ? "btn btn-primary" : "btn"}
            style={{ flex: 1 }}
          >
            Deposit
          </button>
          <button
            onClick={() => setOperation("withdraw")}
            className={operation === "withdraw" ? "btn btn-primary" : "btn"}
            style={{ flex: 1 }}
          >
            Withdraw
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
          Target Chain:
        </label>
        <select
          value={targetChain}
          onChange={(e) => setTargetChain(e.target.value)}
          className="input"
          style={{ width: "100%" }}
        >
          <option value="chainA">Base Sepolia (Chain A)</option>
          <option value="chainB">Arbitrum Sepolia (Chain B)</option>
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
          Amount (ETH):
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          step="0.001"
          min="0"
          className="input"
          style={{ width: "100%" }}
        />
      </div>

      {/* Dashboard Balance Display */}
      <div className="card" style={{ 
        marginBottom: "24px",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        border: "none",
        boxShadow: "0 10px 25px rgba(99, 102, 241, 0.3), 0 4px 6px rgba(0, 0, 0, 0.1)",
        position: "relative",
        overflow: "hidden"
      }}>
        <div style={{ 
          position: "absolute",
          top: -50,
          right: -50,
          width: "200px",
          height: "200px",
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)",
          borderRadius: "50%"
        }}></div>
        <div style={{ 
          position: "absolute",
          bottom: -30,
          left: -30,
          width: "150px",
          height: "150px",
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%)",
          borderRadius: "50%"
        }}></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", position: "relative", zIndex: 1 }}>
          <div>
            <h3 style={{ margin: 0, color: "white", fontSize: "20px", fontWeight: "700", marginBottom: "4px", letterSpacing: "-0.01em" }}>Your Vault Dashboard</h3>
            <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.8)", fontSize: "13px", fontWeight: "400" }}>Total balance across all chains</p>
          </div>
          <button
            onClick={loadBalance}
            disabled={loadingBalance}
            className="btn"
            style={{ 
              padding: "10px 20px", 
              fontSize: "13px",
              fontWeight: "600",
              background: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(10px)",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
            }}
          >
            {loadingBalance ? "Loading..." : "Refresh"}
          </button>
        </div>
        
        {vaultBalance !== null ? (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: "16px",
            marginTop: "8px",
            position: "relative",
            zIndex: 1
          }}>
            <div style={{ 
              padding: "20px", 
              background: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(20px)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              transition: "all 0.3s ease"
            }}>
              <div style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "11px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: "600" }}>
                Total Balance
              </div>
              <div style={{ color: "white", fontSize: "28px", fontWeight: "800", lineHeight: "1.2", letterSpacing: "-0.02em" }}>
                {parseFloat(vaultBalance).toFixed(6)}
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "13px", marginTop: "4px", fontWeight: "500" }}>ETH</div>
            </div>
            
            <div style={{ 
              padding: "20px", 
              background: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(20px)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              transition: "all 0.3s ease"
            }}>
              <div style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "11px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: "600" }}>
                Base Sepolia
              </div>
              <div style={{ color: "white", fontSize: "24px", fontWeight: "700", lineHeight: "1.2" }}>
                {chainBalances.chainA !== null ? `${chainBalances.chainA.toFixed(6)}` : "0.000000"}
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "13px", marginTop: "4px", fontWeight: "500" }}>ETH</div>
            </div>
            
            <div style={{ 
              padding: "20px", 
              background: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(20px)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              transition: "all 0.3s ease"
            }}>
              <div style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "11px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: "600" }}>
                Arbitrum Sepolia
              </div>
              <div style={{ color: "white", fontSize: "24px", fontWeight: "700", lineHeight: "1.2" }}>
                {chainBalances.chainB !== null ? `${chainBalances.chainB.toFixed(6)}` : "0.000000"}
              </div>
              <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "13px", marginTop: "4px", fontWeight: "500" }}>ETH</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255, 255, 255, 0.8)", fontSize: "14px", position: "relative", zIndex: 1 }}>
            {loadingBalance ? "Loading balance..." : "Click Refresh to load balance"}
          </div>
        )}
      </div>

      <button
        onClick={handleVaultOperation}
        disabled={processing || !amount || !account}
        className="btn btn-primary"
        style={{ width: "100%", padding: "1rem" }}
      >
        {processing ? (
          <>
            <span className="loading"></span>
            Processing...
          </>
        ) : (
          `${operation === "deposit" ? "Deposit" : "Withdraw"} ${amount || ""} ETH`
        )}
      </button>

      <p style={{ 
        marginTop: "1rem", 
        fontSize: "0.875rem", 
        color: "var(--text-muted)",
        textAlign: "center"
      }}>
        {operation === "deposit" 
          ? "Deposit tokens to the omnichain vault on the selected chain"
          : "Withdraw tokens from the omnichain vault on the selected chain"}
      </p>
    </div>
  );
}

