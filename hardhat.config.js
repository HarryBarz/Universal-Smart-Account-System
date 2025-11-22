require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    chainA: {
      url: process.env.RPC_CHAIN_A || "https://sepolia.base.org",
      chainId: parseInt(process.env.CHAIN_A_ID || "84532"),
      accounts: process.env.PRIVATE_KEY_CHAIN_A ? [process.env.PRIVATE_KEY_CHAIN_A] : [],
    },
    chainB: {
      url: process.env.RPC_CHAIN_B || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: parseInt(process.env.CHAIN_B_ID || "421614"),
      accounts: process.env.PRIVATE_KEY_CHAIN_B ? [process.env.PRIVATE_KEY_CHAIN_B] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

