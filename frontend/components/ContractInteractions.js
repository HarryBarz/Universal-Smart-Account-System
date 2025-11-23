import { useState, useEffect } from "react";
import { ethers } from "ethers";

/**
 * Component for direct smart contract interactions
 * Implements all contract function calls
 */
export default function ContractInteractions({
  account,
  provider,
  vaultA,
  vaultB,
  vaultTokenA,
  vaultTokenB,
  routerA,
  routerB,
  chainAId,
  chainBId,
  onStatusUpdate,
}) {
  const [activeChain, setActiveChain] = useState("chainA");
  const [vaultBalance, setVaultBalance] = useState(null);
  const [principalBalance, setPrincipalBalance] = useState(null);
  const [accruedYield, setAccruedYield] = useState(null);
  const [pendingYield, setPendingYield] = useState(null);
  const [apyRate, setApyRate] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  // Contract ABIs
  const vaultABI = [
    // View functions
    "function getTotalBalance(address user) external view returns (uint256)",
    "function getPrincipalBalance(address user) external view returns (uint256)",
    "function getAccruedYield(address user) external view returns (uint256)",
    "function calculatePendingYield(address user) external view returns (uint256)",
    "function getChainBalance(address user, uint32 chainId) external view returns (uint256)",
    "function getAPYRate() external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function userBalances(address) external view returns (uint256)",
    
    // Write functions
    "function deposit(uint256 amount) external",
    "function withdraw(uint256 amount) external",
    "function depositFor(address user, uint256 amount) external payable",
    
    // Events
    "event Deposit(address indexed user, uint32 chainId, uint256 amount, uint256 totalUserBalance)",
    "event Withdraw(address indexed user, uint32 chainId, uint256 amount, uint256 totalUserBalance)",
  ];

  const vaultTokenABI = [
    // View functions
    "function balanceOf(address account) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function getTotalVaultBalance(address user) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    
    // Write functions
    "function depositToVault() external payable returns (uint256)",
    "function withdrawFromVault(uint256 amount) external returns (uint256)",
    "function sendVaultToChain(uint32 dstEid, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composedMsg, bytes oftCmd, tuple(uint256 nativeFee, uint256 lzTokenFee) fee) external payable returns (tuple(bytes32 guid, uint64 nonce))",
    "function depositAndSendCrossChain(uint32 dstEid, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, tuple(uint256 nativeFee, uint256 lzTokenFee) fee) external payable returns (tuple(bytes32 guid, uint64 nonce))",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
    
    // OFT functions
    "function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) external payable returns (tuple(bytes32 guid, uint64 nonce) msgReceipt, tuple(uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)",
  ];

  const routerABI = [
    // View functions
    "function isActionExecuted(bytes32 actionId) external view returns (bool)",
    "function quoteCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
    
    // Write functions
    "function sendCrossChainAction(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external payable returns (bytes32)",
    "function executeLocalAction(tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId) action) external payable returns (bool)",
    "function sendBatchCrossChainActions(uint32 dstEid, tuple(address userAccount, address targetAdapter, bytes adapterCalldata, uint256 timestamp, bytes32 actionId)[] actions, tuple(uint128 nativeDropAmount, bytes executorLzReceiveOption) options) external payable returns (bytes32)",
  ];

  // Get current chain addresses
  const getCurrentAddresses = () => {
    if (activeChain === "chainA") {
      return {
        vault: vaultA,
        vaultToken: vaultTokenA,
        router: routerA,
        rpcUrl: "https://sepolia.base.org",
        chainId: chainAId,
        chainName: "Base Sepolia",
      };
    } else {
      return {
        vault: vaultB,
        vaultToken: vaultTokenB,
        router: routerB,
        rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
        chainId: chainBId,
        chainName: "Arbitrum Sepolia",
      };
    }
  };

  // Load vault data
  const loadVaultData = async () => {
    if (!account || !provider) return;

    const addresses = getCurrentAddresses();
    if (!addresses.vault) {
      onStatusUpdate("Vault address not configured", "error");
      return;
    }

    setLoading(true);
    try {
      const rpcProvider = new ethers.JsonRpcProvider(addresses.rpcUrl);
      const vaultContract = new ethers.Contract(addresses.vault, vaultABI, rpcProvider);

      // Load all vault data
      const [totalBalance, principal, accrued, pending, apy] = await Promise.all([
        vaultContract.getTotalBalance(account),
        vaultContract.getPrincipalBalance(account),
        vaultContract.getAccruedYield(account),
        vaultContract.calculatePendingYield(account),
        vaultContract.getAPYRate(),
      ]);

      setVaultBalance(ethers.formatEther(totalBalance));
      setPrincipalBalance(ethers.formatEther(principal));
      setAccruedYield(ethers.formatEther(accrued));
      setPendingYield(ethers.formatEther(pending));
      setApyRate(apy.toString());

      // Load token balance if vault token is configured
      if (addresses.vaultToken) {
        const tokenContract = new ethers.Contract(addresses.vaultToken, vaultTokenABI, rpcProvider);
        const tokenBal = await tokenContract.balanceOf(account);
        setTokenBalance(ethers.formatEther(tokenBal));
      }
    } catch (error) {
      console.error("Error loading vault data:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Direct vault deposit
  const directVaultDeposit = async (amount) => {
    if (!account || !provider) {
      onStatusUpdate("Please connect wallet", "error");
      return;
    }

    const addresses = getCurrentAddresses();
    if (!addresses.vault) {
      onStatusUpdate("Vault address not configured", "error");
      return;
    }

    try {
      const signer = await provider.getSigner();
      const vaultContract = new ethers.Contract(addresses.vault, vaultABI, signer);
      
      const amountWei = ethers.parseEther(amount);
      onStatusUpdate(`Depositing ${amount} ETH to vault...`, "info");

      const tx = await vaultContract.deposit(amountWei, { value: amountWei });
      onStatusUpdate(`Transaction sent: ${tx.hash}`, "info");

      const receipt = await tx.wait();
      onStatusUpdate(`Deposit successful! Block: ${receipt.blockNumber}`, "success");
      
      // Reload data
      await loadVaultData();
    } catch (error) {
      console.error("Error depositing:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    }
  };

  // Direct vault withdraw
  const directVaultWithdraw = async (amount) => {
    if (!account || !provider) {
      onStatusUpdate("Please connect wallet", "error");
      return;
    }

    const addresses = getCurrentAddresses();
    if (!addresses.vault) {
      onStatusUpdate("Vault address not configured", "error");
      return;
    }

    try {
      const signer = await provider.getSigner();
      const vaultContract = new ethers.Contract(addresses.vault, vaultABI, signer);
      
      const amountWei = ethers.parseEther(amount);
      onStatusUpdate(`Withdrawing ${amount} ETH from vault...`, "info");

      const tx = await vaultContract.withdraw(amountWei);
      onStatusUpdate(`Transaction sent: ${tx.hash}`, "info");

      const receipt = await tx.wait();
      onStatusUpdate(`Withdraw successful! Block: ${receipt.blockNumber}`, "success");
      
      // Reload data
      await loadVaultData();
    } catch (error) {
      console.error("Error withdrawing:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    }
  };

  // Deposit to vault via OFT token
  const depositToVaultToken = async (amount) => {
    if (!account || !provider) {
      onStatusUpdate("Please connect wallet", "error");
      return;
    }

    const addresses = getCurrentAddresses();
    if (!addresses.vaultToken) {
      onStatusUpdate("Vault token address not configured", "error");
      return;
    }

    try {
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(addresses.vaultToken, vaultTokenABI, signer);
      
      const amountWei = ethers.parseEther(amount);
      onStatusUpdate(`Depositing ${amount} ETH to get vault tokens...`, "info");

      const tx = await tokenContract.depositToVault({ value: amountWei });
      onStatusUpdate(`Transaction sent: ${tx.hash}`, "info");

      const receipt = await tx.wait();
      onStatusUpdate(`Deposit successful! Received vault tokens. Block: ${receipt.blockNumber}`, "success");
      
      // Reload data
      await loadVaultData();
    } catch (error) {
      console.error("Error depositing to vault token:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    }
  };

  // Withdraw from vault via OFT token
  const withdrawFromVaultToken = async (amount) => {
    if (!account || !provider) {
      onStatusUpdate("Please connect wallet", "error");
      return;
    }

    const addresses = getCurrentAddresses();
    if (!addresses.vaultToken) {
      onStatusUpdate("Vault token address not configured", "error");
      return;
    }

    try {
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(addresses.vaultToken, vaultTokenABI, signer);
      
      const amountWei = ethers.parseEther(amount);
      onStatusUpdate(`Withdrawing ${amount} vault tokens...`, "info");

      const tx = await tokenContract.withdrawFromVault(amountWei);
      onStatusUpdate(`Transaction sent: ${tx.hash}`, "info");

      const receipt = await tx.wait();
      onStatusUpdate(`Withdraw successful! Received ETH. Block: ${receipt.blockNumber}`, "success");
      
      // Reload data
      await loadVaultData();
    } catch (error) {
      console.error("Error withdrawing from vault token:", error);
      onStatusUpdate(`Error: ${error.message}`, "error");
    }
  };

  // Quote cross-chain action fee
  const quoteCrossChainAction = async (dstEid, action) => {
    if (!addresses.router) {
      onStatusUpdate("Router address not configured", "error");
      return null;
    }

    try {
      const rpcProvider = new ethers.JsonRpcProvider(addresses.rpcUrl);
      const routerContract = new ethers.Contract(addresses.router, routerABI, rpcProvider);

      const options = {
        nativeDropAmount: 0,
        executorLzReceiveOption: "0x",
      };

      const fee = await routerContract.quoteCrossChainAction(dstEid, action, options);
      return fee;
    } catch (error) {
      console.error("Error quoting fee:", error);
      onStatusUpdate(`Error quoting fee: ${error.message}`, "error");
      return null;
    }
  };

  // Check if action is executed
  const checkActionExecuted = async (actionId) => {
    if (!addresses.router) {
      onStatusUpdate("Router address not configured", "error");
      return false;
    }

    try {
      const rpcProvider = new ethers.JsonRpcProvider(addresses.rpcUrl);
      const routerContract = new ethers.Contract(addresses.router, routerABI, rpcProvider);
      const executed = await routerContract.isActionExecuted(actionId);
      return executed;
    } catch (error) {
      console.error("Error checking action:", error);
      return false;
    }
  };

  // Load data on mount and chain change
  useEffect(() => {
    if (account) {
      loadVaultData();
    }
  }, [account, activeChain]);

  const addresses = getCurrentAddresses();

  return (
    <div>
      {/* Chain Selector */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px", color: "var(--text)" }}>
          Select Chain
        </label>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select
            value={activeChain}
            onChange={(e) => setActiveChain(e.target.value)}
            className="input"
            style={{ flex: 1, marginBottom: 0 }}
          >
            <option value="chainA">Base Sepolia (Chain A)</option>
            <option value="chainB">Arbitrum Sepolia (Chain B)</option>
          </select>
          <div style={{ 
            padding: "10px 16px", 
            background: "var(--bg-hover)", 
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "13px",
            fontWeight: "500",
            color: "var(--text)",
            whiteSpace: "nowrap"
          }}>
            {addresses.chainName}
          </div>
        </div>
      </div>

      {/* Vault Data Display */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>
              Vault Dashboard
            </h4>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", fontWeight: "400" }}>
              {addresses.chainName}
            </p>
          </div>
          <button 
            onClick={loadVaultData} 
            disabled={loading} 
            className="btn btn-secondary"
            style={{ 
              padding: "8px 16px",
              fontSize: "13px"
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {vaultBalance !== null ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            <div style={{
              padding: "16px",
              background: "var(--bg-card)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                Total Balance
              </div>
              <div style={{ fontSize: "24px", fontWeight: "600", color: "var(--text)", lineHeight: "1.2" }}>
                {parseFloat(vaultBalance).toFixed(6)}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>ETH</div>
            </div>
            
            <div style={{
              padding: "16px",
              background: "var(--bg-card)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                Principal
              </div>
              <div style={{ fontSize: "20px", fontWeight: "600", color: "var(--text)", lineHeight: "1.2" }}>
                {parseFloat(principalBalance).toFixed(6)}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>ETH</div>
            </div>
            
            <div style={{
              padding: "16px",
              background: "var(--bg-card)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                Accrued Yield
              </div>
              <div style={{ fontSize: "20px", fontWeight: "600", color: "#d97706", lineHeight: "1.2" }}>
                {parseFloat(accruedYield).toFixed(6)}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>ETH</div>
            </div>
            
            <div style={{
              padding: "16px",
              background: "var(--bg-card)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                Pending Yield
              </div>
              <div style={{ fontSize: "20px", fontWeight: "600", color: "#818cf8", lineHeight: "1.2" }}>
                {parseFloat(pendingYield).toFixed(6)}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>ETH</div>
            </div>
            
            <div style={{
              padding: "16px",
              background: "var(--bg-card)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                APY Rate
              </div>
              <div style={{ fontSize: "20px", fontWeight: "600", color: "var(--primary)", lineHeight: "1.2" }}>
                {apyRate ? (parseInt(apyRate) / 100).toFixed(2) : "N/A"}%
              </div>
            </div>
            
            {tokenBalance !== null && (
              <div style={{
                padding: "16px",
                background: "var(--bg-card)",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)"
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "500" }}>
                  Token Balance
                </div>
                <div style={{ fontSize: "20px", fontWeight: "600", color: "var(--text)", lineHeight: "1.2" }}>
                  {parseFloat(tokenBalance).toFixed(6)}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>OVT</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: "14px" }}>
            {loading ? "Loading vault data..." : "Click Refresh to load vault data"}
          </div>
        )}
      </div>

      {/* Direct Vault Functions */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <h4 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
          Direct Vault Functions
        </h4>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
          Call vault contract functions directly from your wallet (no bundler/router needed)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <button 
            onClick={() => {
              const amount = prompt("Enter amount to deposit (ETH):");
              if (amount && parseFloat(amount) > 0) directVaultDeposit(amount);
            }}
            className="btn btn-primary"
            disabled={!addresses.vault}
            style={{ 
              padding: "12px 20px",
              fontSize: "14px",
              justifyContent: "center"
            }}
          >
            Deposit to Vault
          </button>
          <button 
            onClick={() => {
              const amount = prompt("Enter amount to withdraw (ETH):");
              if (amount && parseFloat(amount) > 0) directVaultWithdraw(amount);
            }}
            className="btn btn-secondary"
            disabled={!addresses.vault}
            style={{ 
              padding: "12px 20px",
              fontSize: "14px",
              justifyContent: "center"
            }}
          >
            Withdraw from Vault
          </button>
        </div>
      </div>

      {/* Vault Token Functions */}
      {addresses.vaultToken && addresses.vaultToken !== "0x0000000000000000000000000000000000000000" ? (
        <div className="card" style={{ marginBottom: "24px" }}>
          <h4 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
            Vault Token (OFT) Functions
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
            Deposit/withdraw using OFT tokens - enables seamless cross-chain transfers via LayerZero
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <button 
              onClick={() => {
                const amount = prompt("Enter amount to deposit (ETH):");
                if (amount && parseFloat(amount) > 0) depositToVaultToken(amount);
              }}
              className="btn btn-primary"
              style={{ 
                padding: "12px 20px",
                fontSize: "14px",
                justifyContent: "center"
              }}
            >
              Deposit & Get Tokens
            </button>
            <button 
              onClick={() => {
                const amount = prompt("Enter amount to withdraw (tokens):");
                if (amount && parseFloat(amount) > 0) withdrawFromVaultToken(amount);
              }}
              className="btn btn-secondary"
              style={{ 
                padding: "12px 20px",
                fontSize: "14px",
                justifyContent: "center"
              }}
            >
              Withdraw Tokens
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: "24px", opacity: 0.6 }}>
          <h4 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
            Vault Token (OFT) Functions
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.5" }}>
            Vault token (OFT) not deployed yet. Deploy OmnichainVaultToken to enable cross-chain transfers.
          </p>
        </div>
      )}

      {/* Router Functions */}
      {addresses.router && (
        <div className="card" style={{ marginBottom: "24px" }}>
          <h4 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
            Router Functions
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
            View router functions (cross-chain actions require bundler authorization)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <button 
              onClick={async () => {
                const actionId = prompt("Enter action ID to check:");
                if (actionId) {
                  onStatusUpdate("Checking action status...", "info");
                  const executed = await checkActionExecuted(actionId);
                  onStatusUpdate(
                    `Action ${actionId.substring(0, 8)}...${actionId.substring(56)} is ${executed ? "executed" : "not executed"}`,
                    executed ? "success" : "info"
                  );
                }
              }}
              className="btn btn-secondary"
              style={{ 
                padding: "12px 20px",
                fontSize: "14px",
                justifyContent: "center"
              }}
            >
              Check Action Status
            </button>
            <button 
              onClick={() => {
                onStatusUpdate("Router functions require authorization. Use the bundler tab for cross-chain actions.", "info");
              }}
              className="btn btn-secondary"
              style={{ 
                padding: "12px 20px",
                fontSize: "14px",
                justifyContent: "center"
              }}
            >
              Quote Fee
            </button>
          </div>
        </div>
      )}

      {/* Contract Addresses */}
      <div className="card" style={{ marginTop: "24px" }}>
        <h4 style={{ marginBottom: "12px", fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
          Contract Addresses
        </h4>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
          {addresses.chainName}
        </p>
        <div style={{ display: "grid", gap: "8px", fontFamily: "'SF Mono', 'Monaco', 'Courier New', monospace", fontSize: "12px" }}>
          <div style={{ 
            padding: "12px", 
            background: "var(--bg-hover)",
            borderRadius: "6px",
            border: "1px solid var(--border)"
          }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Vault
            </div>
            <div style={{ color: addresses.vault ? "var(--text)" : "var(--error)", wordBreak: "break-all" }}>
              {addresses.vault || "Not configured"}
            </div>
          </div>
          {addresses.vaultToken && addresses.vaultToken !== "0x0000000000000000000000000000000000000000" && (
            <div style={{ 
              padding: "12px", 
              background: "var(--bg-hover)",
              borderRadius: "6px",
              border: "1px solid var(--border)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Vault Token (OFT)
              </div>
              <div style={{ color: "var(--text)", wordBreak: "break-all" }}>
                {addresses.vaultToken}
              </div>
            </div>
          )}
          {addresses.router && (
            <div style={{ 
              padding: "12px", 
              background: "var(--bg-hover)",
              borderRadius: "6px",
              border: "1px solid var(--border)"
            }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Router
              </div>
              <div style={{ color: "var(--text)", wordBreak: "break-all" }}>
                {addresses.router}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

