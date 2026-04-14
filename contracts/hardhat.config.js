require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545" },

    // Base Sepolia (testnet)
    baseSepolia: {
      url: ALCHEMY_API_KEY
        ? `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
        : (process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
      accounts: [PRIVATE_KEY],
      chainId: 84532,
    },

    // Base Mainnet
    base: {
      url: ALCHEMY_API_KEY
        ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
        : "https://mainnet.base.org",
      accounts: [PRIVATE_KEY],
      chainId: 8453,
    },

    // Ethereum Sepolia (source chain for cross-chain testing)
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
      timeout: 120000,
    },

    // Optimism Sepolia (source chain for cross-chain testing)
    optimismSepolia: {
      url: process.env.OP_SEPOLIA_RPC || "https://sepolia.optimism.io",
      accounts: [PRIVATE_KEY],
      chainId: 11155420,
      timeout: 120000,
    },

    // Status Network Testnet (Sepolia-based L2 by Logos/Status)
    statusNetworkTestnet: {
      url: process.env.STATUS_NETWORK_RPC || "https://public.sepolia.rpc.status.network",
      accounts: [PRIVATE_KEY],
      chainId: 1660990954,
      timeout: 120000,
    },
  },

  etherscan: {
    apiKey: {
      baseSepolia: BASESCAN_API_KEY,
      base: BASESCAN_API_KEY,
      statusNetworkTestnet: "no-api-key-needed",  // Blockscout doesn't require an API key
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "statusNetworkTestnet",
        chainId: 1660990954,
        urls: {
          apiURL: "https://sepoliascan.status.network/api",
          browserURL: "https://sepoliascan.status.network",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};
