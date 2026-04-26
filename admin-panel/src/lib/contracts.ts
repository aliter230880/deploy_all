import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
export const IDENTITY_CONTRACT = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
export const MESSAGE_CONTRACT = "0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb";
export const ESCROW_CONTRACT = "0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53";
export const SOCIAL_REGISTRY = "0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036";

export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_HEX = "0x89";

export const ABIS: Record<string, string[]> = {
  KeyEscrow: [
    "function depositKey(bytes) external",
    "function getKey(address) external view returns (bytes)",
    "function getAdminPublicKey() external view returns (bytes)",
    "function setAdminPublicKey(bytes) external",
    "function getUserCount() external view returns (uint256)",
    "function getUsers(uint256,uint256) external view returns (address[])",
    "function isRegistered(address) external view returns (bool)",
    "function transferAdmin(address) external",
  ],
  PublicKeyRegistry: [
    "function registerKey(bytes32) external",
    "function getKey(address) external view returns (bytes32)",
    "function hasKey(address) external view returns (bool)",
  ],
  SocialWalletRegistry: [
    "function link(uint8,string) external",
    "function getWallet(uint8,string) external view returns (address)",
    "function hasWallet(address) external view returns (bool)",
    "function getProviders(address) external view returns (uint8[])",
  ],
  Identity: [
    "function getUsername(address) external view returns (string)",
    "function setUsername(string) external",
    "function hasUsername(address) external view returns (bool)",
  ],
  MessageStorage: [
    "function messageCount(address,address) external view returns (uint256)",
    "function sendMessage(address,string) external",
    "function getConversation(address,address,uint256,uint256) external view returns (tuple(address sender,address recipient,string text,uint256 timestamp)[],uint256)",
  ],
};

export const CONTRACT_BYTECODES: Record<string, string> = {
  KeyEscrow:
    "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550612345806100606000396000f3fe",
  PublicKeyRegistry: "0x608060405234801561001057600080fd5b50610abc806100206000396000f3fe",
  SocialWalletRegistry: "0x608060405234801561001057600080fd5b50610def806100206000396000f3fe",
};

export const KNOWN_CONTRACTS = [
  { name: "KeyEscrow", address: ESCROW_CONTRACT, abi: "KeyEscrow" },
  { name: "Identity", address: IDENTITY_CONTRACT, abi: "Identity" },
  { name: "MessageStorage", address: MESSAGE_CONTRACT, abi: "MessageStorage" },
  { name: "SocialWalletRegistry", address: SOCIAL_REGISTRY, abi: "SocialWalletRegistry" },
];

export async function getProvider(): Promise<ethers.providers.Web3Provider> {
  if (!window.ethereum) throw new Error("MetaMask not installed.");
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider;
}

export async function getSigner(): Promise<ethers.Signer> {
  const provider = await getProvider();
  const network = await provider.getNetwork();
  if (network.chainId !== POLYGON_CHAIN_ID) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_CHAIN_HEX }],
    });
    return new ethers.providers.Web3Provider(window.ethereum).getSigner();
  }
  return provider.getSigner();
}

export function getContract(
  address: string,
  abi: string[],
  signerOrProvider: ethers.Signer | ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(address, abi, signerOrProvider);
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function polygonscanTx(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`;
}

export function polygonscanAddr(addr: string): string {
  return `https://polygonscan.com/address/${addr}`;
}

export function getDeployedAddress(contractName: string): string | null {
  return localStorage.getItem(`deployed_${contractName}`) || null;
}

export function saveDeployedAddress(contractName: string, address: string): void {
  localStorage.setItem(`deployed_${contractName}`, address);
}

export function isViewFunction(sig: string): boolean {
  return sig.includes("view") || sig.includes("pure");
}

export function parseFunctionName(sig: string): string {
  const match = sig.match(/function (\w+)/);
  return match ? match[1] : sig;
}

export function parseFunctionParams(sig: string): string[] {
  const match = sig.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return [];
  return match[1].split(",").map((p) => p.trim());
}

export function parseReturnType(sig: string): string {
  const match = sig.match(/returns \(([^)]+)\)/);
  return match ? match[1] : "";
}
