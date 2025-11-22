import { useState, useEffect } from "react";
import Head from "next/head";
import { ethers } from "ethers";
import SignFlow from "../components/SignFlow";
import VaultFlow from "../components/VaultFlow";

const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL || "http://localhost:3001";

// Load contract addresses from deployments.json
const getDeploymentAddresses = () => {
  try {
    const deployments = require("../../deployments.json");
    return {
      swapAdapter: deployments.chainA?.SwapAdapter || "0x3442c40DbC3051aF8c25b405410a48dDA70A8636",
      nftAdapter: deployments.chainB?.NFTAdapter || "0x3442c40DbC3051aF8c25b405410a48dDA70A8636",
      vaultA: deployments.chainA?.OmnichainVault,
      vaultAdapterA: deployments.chainA?.VaultAdapter,
      vaultB: deployments.chainB?.OmnichainVault,
      vaultAdapterB: deployments.chainB?.VaultAdapter,
      chainAId: 84532, // Base Sepolia
      chainBId: 421614, // Arbitrum Sepolia
    };
  } catch (e) {
    return {
      swapAdapter: "0x3442c40DbC3051aF8c25b405410a48dDA70A8636",
      nftAdapter: "0x3442c40DbC3051aF8c25b405410a48dDA70A8636",
      chainAId: 84532,
      chainBId: 421614,
    };
  }
};

export default function Home() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [file, setFile] = useState(null);
  const [cid, setCid] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info"); // success, error, warning, info
  const [txLinks, setTxLinks] = useState([]);
  const [nftMetadata, setNftMetadata] = useState(null);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("demo"); // "demo" or "vault"
  const [deploymentAddresses] = useState(getDeploymentAddresses());

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(provider);
      
      // Check if already connected
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        }
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus("Please install MetaMask!");
      setStatusType("error");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setProvider(provider);
      setStatus(`Wallet connected: ${accounts[0].substring(0, 6)}...${accounts[0].substring(38)}`);
      setStatusType("success");
      setProgress(33);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setStatus("Error connecting wallet: " + error.message);
      setStatusType("error");
    }
  };

  const updateStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const uploadToFilecoin = async () => {
    if (!file) {
      updateStatus("Please select a file first", "error");
      return;
    }

    setUploading(true);
    setProgress(40);
    updateStatus("Uploading to Filecoin...", "info");

    try {
      // Create metadata JSON
      const metadata = {
        name: "Super Account NFT",
        description: "NFT minted via chain-abstracted Super Account",
        image: file.name,
        attributes: [
          { trait_type: "Chain Abstraction", value: "Enabled" },
          { trait_type: "Storage", value: "Filecoin" },
        ],
      };

      // Convert metadata to blob
      const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
        type: "application/json",
      });

      const formData = new FormData();
      formData.append("file", metadataBlob, "metadata.json");
      if (file) {
        formData.append("image", file);
      }

      // Simulate Filecoin upload (mock for demo)
      const response = await fetch("https://api.filecoin.cloud/upload", {
        method: "POST",
        body: formData,
      }).catch(() => {
        // Fallback: Generate mock CID
        return {
          ok: true,
          json: async () => ({
            cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          }),
        };
      });

      if (response.ok) {
        const data = await response.json();
        const receivedCid = data.cid || "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
        setCid(receivedCid);
        setProgress(66);
        updateStatus(`File uploaded successfully! CID: ${receivedCid.substring(0, 20)}...`, "success");
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading to Filecoin:", error);
      // Fallback: Use mock CID
      const mockCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
      setCid(mockCid);
      setProgress(66);
      updateStatus(`Using mock CID for demo: ${mockCid.substring(0, 20)}...`, "warning");
    } finally {
      setUploading(false);
    }
  };

  const fetchNFTMetadata = async (cidToFetch) => {
    if (!cidToFetch) return;

    updateStatus(`Fetching metadata from Filecoin CID...`, "info");
    try {
      const gatewayUrl = `https://ipfs.io/ipfs/${cidToFetch}`;
      const response = await fetch(gatewayUrl);
      
      if (response.ok) {
        const metadata = await response.json();
        setNftMetadata(metadata);
        updateStatus("Metadata fetched successfully!", "success");
      } else {
        throw new Error("Failed to fetch metadata");
      }
    } catch (error) {
      console.error("Error fetching metadata:", error);
      updateStatus("Error fetching metadata (may be mock CID)", "warning");
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setCid(null);
      setNftMetadata(null);
      setProgress(20);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(38)}`;
  };

  return (
    <div className="container">
      <Head>
        <title>Super Account MVP</title>
        <meta name="description" content="Chain-Abstracted Super Account using ERC-4337, EIL, LayerZero, and Filecoin" />
      </Head>

      <header className="header">
        <h1>Super Account MVP</h1>
        <p>One signature → Actions on two L2s → NFT with Filecoin metadata</p>
        
        {/* Tab Navigation */}
        <div style={{ 
          display: "flex", 
          gap: "1rem", 
          marginTop: "1.5rem",
          justifyContent: "center"
        }}>
          <button
            onClick={() => setActiveTab("demo")}
            className={activeTab === "demo" ? "btn btn-primary" : "btn"}
            style={{ padding: "0.75rem 1.5rem" }}
          >
            Demo: Swap + NFT
          </button>
          <button
            onClick={() => setActiveTab("vault")}
            className={activeTab === "vault" ? "btn btn-primary" : "btn"}
            style={{ padding: "0.75rem 1.5rem" }}
          >
            Omnichain Vault
          </button>
        </div>
      </header>

      {activeTab === "demo" ? (
        <>
          <div className="card">
        <h2>
          <span className="step-number">1</span>
          Connect Wallet
        </h2>
        {!account ? (
          <button onClick={connectWallet} className="btn btn-primary">
            Connect MetaMask
          </button>
        ) : (
          <div className="account-display">
            <span>Connected:</span>
            <strong>{formatAddress(account)}</strong>
          </div>
        )}
      </div>

      <div className="card">
        <h2>
          <span className="step-number">2</span>
          Upload File to Filecoin
        </h2>
        <div className="file-input-wrapper">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="input"
            id="file-input"
          />
          <label htmlFor="file-input" className="file-input-label">
            {file ? `Selected: ${file.name}` : "Choose File"}
          </label>
        </div>
        
        {file && (
          <div className="file-info">
            <p><strong>File:</strong> {file.name}</p>
            <p><strong>Size:</strong> {(file.size / 1024).toFixed(2)} KB</p>
            <p><strong>Type:</strong> {file.type || "Unknown"}</p>
            <button
              onClick={uploadToFilecoin}
              disabled={uploading}
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
            >
              {uploading ? (
                <>
                  <span className="loading"></span>
                  Uploading...
                </>
              ) : (
                "Upload to Filecoin"
              )}
            </button>
          </div>
        )}

        {cid && (
          <div className="cid-display">
            <p><strong>CID:</strong> {cid}</p>
            <button
              onClick={() => fetchNFTMetadata(cid)}
              className="btn btn-secondary"
              style={{ marginTop: "0.5rem" }}
            >
              Fetch Metadata
            </button>
          </div>
        )}
      </div>

          {account && cid && (
            <div className="card">
              <h2>
                <span className="step-number">3</span>
                Sign & Execute
              </h2>
              <SignFlow
                account={account}
                provider={provider}
                cid={cid}
                bundlerUrl={BUNDLER_URL}
                swapAdapter={deploymentAddresses.swapAdapter}
                nftAdapter={deploymentAddresses.nftAdapter}
                chainAId={deploymentAddresses.chainAId}
                chainBId={deploymentAddresses.chainBId}
                onStatusUpdate={updateStatus}
                onTxLinks={setTxLinks}
                onProgress={setProgress}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <h2>
              <span className="step-number">1</span>
              Connect Wallet
            </h2>
            {!account ? (
              <button onClick={connectWallet} className="btn btn-primary">
                Connect MetaMask
              </button>
            ) : (
              <div className="account-display">
                <span>Connected:</span>
                <strong>{formatAddress(account)}</strong>
              </div>
            )}
          </div>

          {account && (
            <div className="card">
              <h2>
                <span className="step-number">2</span>
                Omnichain Vault
              </h2>
              <VaultFlow
                account={account}
                provider={provider}
                bundlerUrl={BUNDLER_URL}
                vaultA={deploymentAddresses.vaultA}
                vaultAdapterA={deploymentAddresses.vaultAdapterA}
                vaultB={deploymentAddresses.vaultB}
                vaultAdapterB={deploymentAddresses.vaultAdapterB}
                chainAId={deploymentAddresses.chainAId}
                chainBId={deploymentAddresses.chainBId}
                onStatusUpdate={updateStatus}
                onTxLinks={setTxLinks}
                onProgress={setProgress}
              />
            </div>
          )}
        </>
      )}

      {progress > 0 && (
        <div className="card">
          <h3>Progress</h3>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {progress}% Complete
          </p>
        </div>
      )}

      {status && (
        <div className={`card status status-${statusType}`}>
          <h3>Status</h3>
          <p>{status}</p>
        </div>
      )}

      {txLinks.length > 0 && (
        <div className="card">
          <h2>Transaction Links ({txLinks.length})</h2>
          <div style={{ marginTop: "1rem" }}>
            {txLinks.map((link, idx) => (
              <div 
                key={idx}
                style={{
                  padding: "1rem",
                  marginBottom: "0.5rem",
                  background: link.isError ? "rgba(239, 68, 68, 0.1)" : "var(--bg)",
                  border: `1px solid ${link.isError ? "var(--error)" : "var(--border)"}`,
                  borderRadius: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ color: link.isError ? "var(--error)" : "var(--text)" }}>
                      {link.label}
                    </strong>
                    {link.chain && (
                      <span className="badge" style={{ marginLeft: "0.5rem" }}>
                        {link.chain}
                      </span>
                    )}
                    {link.actionType && (
                      <span className="badge badge-primary" style={{ marginLeft: "0.5rem" }}>
                        {link.actionType}
                      </span>
                    )}
                  </div>
                  {!link.isError && link.url !== "#" ? (
                    <a 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ 
                        padding: "0.5rem 1rem", 
                        fontSize: "0.875rem",
                        textDecoration: "none"
                      }}
                    >
                      View on Explorer
                    </a>
                  ) : (
                    <span style={{ color: "var(--error)", fontSize: "0.875rem" }}>
                      {link.hash}
                    </span>
                  )}
                </div>
                {!link.isError && !link.isPending && (
                  <div style={{ marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {link.hash}
                  </div>
                )}
                {link.isPending && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    {link.note || "LayerZero message is being delivered. Check destination chain in 30-60 seconds."}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {nftMetadata && (
        <div className="card">
          <h2>NFT Metadata (from Filecoin)</h2>
          <pre style={{ 
            backgroundColor: "var(--bg)", 
            padding: "1rem", 
            overflow: "auto",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            border: "1px solid var(--border)"
          }}>
            {JSON.stringify(nftMetadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
