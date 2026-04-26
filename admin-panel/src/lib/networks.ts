export interface NetworkConfig {
  id: string;
  name: string;
  shortName: string;
  chainId: number;
  chainHex: string;
  isTestnet: boolean;
  currency: string;
  rpcUrls: string[];
  blockExplorerUrl: string;
  explorerName: string;
  explorerTx: (hash: string) => string;
  explorerAddr: (addr: string) => string;
  dotClass: string;
  badgeClass: string;
  addParams?: object;
}

export const NETWORKS: NetworkConfig[] = [
  {
    id: "polygon-mainnet",
    name: "Polygon Mainnet",
    shortName: "Polygon",
    chainId: 137,
    chainHex: "0x89",
    isTestnet: false,
    currency: "POL",
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrl: "https://polygonscan.com",
    explorerName: "Polygonscan",
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    explorerAddr: (a) => `https://polygonscan.com/address/${a}`,
    dotClass: "bg-purple-400",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    addParams: {
      chainId: "0x89",
      chainName: "Polygon Mainnet",
      nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
      rpcUrls: ["https://polygon-rpc.com"],
      blockExplorerUrls: ["https://polygonscan.com"],
    },
  },
  {
    id: "polygon-amoy",
    name: "Polygon Amoy",
    shortName: "Amoy",
    chainId: 80002,
    chainHex: "0x13882",
    isTestnet: true,
    currency: "MATIC",
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrl: "https://amoy.polygonscan.com",
    explorerName: "Amoy Explorer",
    explorerTx: (h) => `https://amoy.polygonscan.com/tx/${h}`,
    explorerAddr: (a) => `https://amoy.polygonscan.com/address/${a}`,
    dotClass: "bg-yellow-400",
    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    addParams: {
      chainId: "0x13882",
      chainName: "Polygon Amoy Testnet",
      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
      rpcUrls: ["https://rpc-amoy.polygon.technology"],
      blockExplorerUrls: ["https://amoy.polygonscan.com"],
    },
  },
  {
    id: "bsc-mainnet",
    name: "BSC Mainnet",
    shortName: "BNB",
    chainId: 56,
    chainHex: "0x38",
    isTestnet: false,
    currency: "BNB",
    rpcUrls: ["https://bsc-dataseed.binance.org"],
    blockExplorerUrl: "https://bscscan.com",
    explorerName: "BscScan",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    explorerAddr: (a) => `https://bscscan.com/address/${a}`,
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    addParams: {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org"],
      blockExplorerUrls: ["https://bscscan.com"],
    },
  },
  {
    id: "bsc-testnet",
    name: "BSC Testnet",
    shortName: "tBNB",
    chainId: 97,
    chainHex: "0x61",
    isTestnet: true,
    currency: "tBNB",
    rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
    blockExplorerUrl: "https://testnet.bscscan.com",
    explorerName: "BSC Testnet Explorer",
    explorerTx: (h) => `https://testnet.bscscan.com/tx/${h}`,
    explorerAddr: (a) => `https://testnet.bscscan.com/address/${a}`,
    dotClass: "bg-orange-400",
    badgeClass: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    addParams: {
      chainId: "0x61",
      chainName: "BSC Testnet",
      nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
      rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
      blockExplorerUrls: ["https://testnet.bscscan.com"],
    },
  },
];

export const DEFAULT_NETWORK = NETWORKS[0];

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return NETWORKS.find((n) => n.chainId === chainId);
}

export async function switchToNetwork(net: NetworkConfig): Promise<void> {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: net.chainHex }],
    });
  } catch (err: any) {
    if ((err.code === 4902 || err.code === -32603) && net.addParams) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [net.addParams],
      });
    } else {
      throw err;
    }
  }
}
