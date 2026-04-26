import { useState } from "react";
import { ethers } from "ethers";
import {
  Rocket, CheckCircle2, Loader2, AlertCircle, ExternalLink,
  Copy, Coins, ChevronDown, ChevronUp, FlaskConical, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getProvider,
  CONTRACT_BYTECODES,
  FAKETOKEN_BYTECODE,
  ABIS,
  getDeployedAddress,
  saveDeployedAddress,
} from "@/lib/contracts";
import { switchToNetwork, type NetworkConfig } from "@/lib/networks";
import type { TxRecord } from "@/pages/Dashboard";

interface DeployProps {
  walletConnected: boolean;
  onAddTx: (tx: TxRecord) => void;
  onUpdateTx: (id: string, status: TxRecord["status"]) => void;
  selectedNetwork: NetworkConfig;
}

const CONTRACT_INFO: {
  name: keyof typeof CONTRACT_BYTECODES;
  label: string;
  description: string;
  functions: string[];
}[] = [
  {
    name: "KeyEscrow",
    label: "Key Escrow",
    description: "Stores encrypted user E2E keys. Admin can retrieve and decrypt any user's keys.",
    functions: ["depositKey", "getKey", "setAdminPublicKey", "getUserCount", "getUsers", "transferAdmin"],
  },
  {
    name: "PublicKeyRegistry",
    label: "Public Key Registry",
    description: "On-chain registry for E2E public keys. Enables DH key exchange without MetaMask popups.",
    functions: ["registerKey", "getKey", "hasKey"],
  },
  {
    name: "SocialWalletRegistry",
    label: "Social Wallet Registry",
    description: "Links social identities (Telegram, Google, Discord) to wallet addresses.",
    functions: ["link", "getWallet", "hasWallet", "getProviders"],
  },
];

type DeployStatus = "idle" | "deploying" | "deployed" | "error";

interface FakeTokenParams {
  name: string;
  symbol: string;
  decimals: string;
  initialSupply: string;
  maxSupply: string;
}

export default function Deploy({ walletConnected, onAddTx, onUpdateTx, selectedNetwork }: DeployProps) {
  const [statuses, setStatuses] = useState<Record<string, DeployStatus>>({});
  const [deployedAddrs, setDeployedAddrs] = useState<Record<string, string>>(() => {
    const saved: Record<string, string> = {};
    for (const c of CONTRACT_INFO) {
      const addr = getDeployedAddress(c.name);
      if (addr) saved[c.name] = addr;
    }
    return saved;
  });

  const [tokenStatus, setTokenStatus] = useState<DeployStatus>("idle");
  const [tokenAddr, setTokenAddr] = useState<string>(getDeployedAddress("FakeToken") || "");
  const [tokenTxHash, setTokenTxHash] = useState<string>("");
  const [showTokenForm, setShowTokenForm] = useState(true);
  const [tokenParams, setTokenParams] = useState<FakeTokenParams>({
    name: "Tether USD",
    symbol: "USDT",
    decimals: "18",
    initialSupply: "1000000000",
    maxSupply: "1000000000",
  });

  const { toast } = useToast();

  function setParam(key: keyof FakeTokenParams, value: string) {
    setTokenParams((p) => ({ ...p, [key]: value }));
  }

  async function getSignerOnNetwork() {
    await switchToNetwork(selectedNetwork);
    const provider = await getProvider();
    return provider.getSigner();
  }

  async function handleDeploy(contractName: string) {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }
    setStatuses((s) => ({ ...s, [contractName]: "deploying" }));
    const txId = `${contractName}-${Date.now()}`;
    onAddTx({ id: txId, time: new Date().toLocaleTimeString(), contract: contractName, fn: "deploy()", txHash: "", status: "pending" });

    try {
      const signer = await getSignerOnNetwork();
      const bytecode = CONTRACT_BYTECODES[contractName];
      const abi = ABIS[contractName] || [];
      const factory = new ethers.ContractFactory(abi, bytecode, signer);
      const contract = await factory.deploy();
      await contract.deployTransaction.wait(1);
      const address = contract.address;
      saveDeployedAddress(contractName, address);
      setDeployedAddrs((prev) => ({ ...prev, [contractName]: address }));
      setStatuses((s) => ({ ...s, [contractName]: "deployed" }));
      onUpdateTx(txId, "confirmed");
      toast({ title: `${contractName} Deployed`, description: `Address: ${address}` });
    } catch (e: any) {
      setStatuses((s) => ({ ...s, [contractName]: "error" }));
      onUpdateTx(txId, "failed");
      toast({ title: "Deploy Failed", description: e.message || String(e), variant: "destructive" });
    }
  }

  async function handleDeployToken() {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }

    const dec = parseInt(tokenParams.decimals);
    const init = parseInt(tokenParams.initialSupply);
    const max = parseInt(tokenParams.maxSupply);
    if (!tokenParams.name || !tokenParams.symbol) {
      toast({ title: "Validation Error", description: "Name and symbol are required.", variant: "destructive" });
      return;
    }
    if (isNaN(dec) || dec < 0 || dec > 18) {
      toast({ title: "Validation Error", description: "Decimals must be 0–18.", variant: "destructive" });
      return;
    }
    if (isNaN(init) || init <= 0) {
      toast({ title: "Validation Error", description: "Initial supply must be > 0.", variant: "destructive" });
      return;
    }
    if (isNaN(max) || max < init) {
      toast({ title: "Validation Error", description: "Max supply must be >= initial supply.", variant: "destructive" });
      return;
    }

    setTokenStatus("deploying");
    const txId = `FakeToken-${Date.now()}`;
    onAddTx({ id: txId, time: new Date().toLocaleTimeString(), contract: "FakeToken", fn: "deploy()", txHash: "", status: "pending" });

    try {
      const signer = await getSignerOnNetwork();
      const abi = ABIS["FakeToken"];
      const factory = new ethers.ContractFactory(abi, FAKETOKEN_BYTECODE, signer);

      toast({ title: `Deploying to ${selectedNetwork.name}`, description: "Confirm the transaction in MetaMask…" });

      const contract = await factory.deploy(tokenParams.name, tokenParams.symbol, dec, init, max);

      setTokenTxHash(contract.deployTransaction.hash);
      onAddTx({ id: `${txId}-hash`, time: new Date().toLocaleTimeString(), contract: "FakeToken", fn: "deploy()", txHash: contract.deployTransaction.hash, status: "pending" });

      await contract.deployTransaction.wait(1);
      const address = contract.address;

      saveDeployedAddress("FakeToken", address);
      setTokenAddr(address);
      setTokenStatus("deployed");
      onUpdateTx(txId, "confirmed");

      toast({ title: "Token Deployed!", description: `${selectedNetwork.name}: ${address}` });
    } catch (e: any) {
      setTokenStatus("error");
      onUpdateTx(txId, "failed");
      toast({ title: "Deploy Failed", description: e.message?.slice(0, 200) || String(e), variant: "destructive" });
    }
  }

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr);
    toast({ title: "Copied", description: "Address copied to clipboard." });
  }

  return (
    <div className="space-y-4" data-testid="section-deploy">
      <div className="flex items-center gap-2 mb-6">
        <Rocket className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Deploy Contracts</h2>
        <span className="text-[10px] text-muted-foreground">// One-click deployment</span>
      </div>

      {/* ── FakeToken Deployer ─────────────────────────────────────────────── */}
      <Card className="bg-card border-accent/40" data-testid="card-deploy-FakeToken">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-accent" />
                USDT
                <Badge className="bg-accent/10 text-accent border-accent/30 text-[9px] uppercase">ERC-20</Badge>
                <Badge className={`text-[9px] uppercase border ${selectedNetwork.badgeClass}`}>
                  {selectedNetwork.isTestnet ? <FlaskConical className="w-2 h-2 mr-0.5 inline" /> : <Globe className="w-2 h-2 mr-0.5 inline" />}
                  {selectedNetwork.name}
                </Badge>
                {tokenAddr && (
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] uppercase">Deployed</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                ERC-20 · permit · blacklist · pause · mint/burn · maxSupply — деплой на <span className="font-mono text-foreground">{selectedNetwork.name}</span> (chain {selectedNetwork.chainId}).
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={tokenStatus} />
              <button
                onClick={() => setShowTokenForm((v) => !v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {showTokenForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Functions */}
          <div className="space-y-2">
            <div>
              <p className="text-[9px] text-primary/60 uppercase font-bold tracking-wider mb-1">// Read</p>
              <div className="flex flex-wrap gap-1">
                {[
                  "name", "symbol", "decimals", "totalSupply", "maxSupply",
                  "owner", "pools", "metaURI", "isPaused",
                  "balanceOf", "allowance", "nonces",
                  "isBlacklisted", "DOMAIN_SEPARATOR", "eip712Domain",
                ].map((fn) => (
                  <span key={fn} className="text-[10px] font-mono bg-primary/5 text-primary/70 px-2 py-0.5 border border-primary/20">
                    {fn}()
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] text-accent/60 uppercase font-bold tracking-wider mb-1">// Write</p>
              <div className="flex flex-wrap gap-1">
                {[
                  "transfer", "transferFrom", "approve",
                  "increaseAllowance", "decreaseAllowance",
                  "mint", "burn", "burnFrom",
                  "setBlacklist", "setPaused", "setPools", "setMetaURI",
                  "transferOwnership", "renounceOwnership", "permit",
                ].map((fn) => (
                  <span key={fn} className="text-[10px] font-mono bg-accent/5 text-accent/70 px-2 py-0.5 border border-accent/20">
                    {fn}()
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Constructor Form */}
          {showTokenForm && (
            <div className="border border-border bg-muted/30 p-3 space-y-3">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">// Constructor Parameters</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Name</Label>
                  <Input
                    value={tokenParams.name}
                    onChange={(e) => setParam("name", e.target.value)}
                    placeholder="Tether USD"
                    className="h-7 text-xs font-mono bg-background border-border"
                    data-testid="token-input-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Symbol</Label>
                  <Input
                    value={tokenParams.symbol}
                    onChange={(e) => setParam("symbol", e.target.value)}
                    placeholder="USDT"
                    className="h-7 text-xs font-mono bg-background border-border"
                    data-testid="token-input-symbol"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Decimals</Label>
                  <Input
                    value={tokenParams.decimals}
                    onChange={(e) => setParam("decimals", e.target.value)}
                    placeholder="18"
                    type="number"
                    min="0"
                    max="18"
                    className="h-7 text-xs font-mono bg-background border-border"
                    data-testid="token-input-decimals"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Initial Supply (units)</Label>
                  <Input
                    value={tokenParams.initialSupply}
                    onChange={(e) => setParam("initialSupply", e.target.value)}
                    placeholder="1000000000"
                    type="number"
                    className="h-7 text-xs font-mono bg-background border-border"
                    data-testid="token-input-initial"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Max Supply (units)</Label>
                  <Input
                    value={tokenParams.maxSupply}
                    onChange={(e) => setParam("maxSupply", e.target.value)}
                    placeholder="1000000000"
                    type="number"
                    className="h-7 text-xs font-mono bg-background border-border"
                    data-testid="token-input-max"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="bg-background border border-border p-2 text-[10px] font-mono text-muted-foreground">
                <span className="text-accent">constructor</span>
                {"("}
                <span className="text-primary">"{tokenParams.name || "..."}"</span>
                {", "}
                <span className="text-primary">"{tokenParams.symbol || "..."}"</span>
                {", "}
                <span className="text-yellow-400">{tokenParams.decimals || "18"}</span>
                {", "}
                <span className="text-yellow-400">{tokenParams.initialSupply || "0"}</span>
                {", "}
                <span className="text-yellow-400">{tokenParams.maxSupply || "0"}</span>
                {")"}
              </div>

              {selectedNetwork.isTestnet ? (
                <div className="text-[10px] text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 px-2 py-1.5">
                  ⚠ MetaMask переключится на <span className="text-yellow-400 font-mono">{selectedNetwork.name} ({selectedNetwork.chainId})</span>.
                  Нужен {selectedNetwork.currency} — получи на{" "}
                  {selectedNetwork.id === "bsc-testnet" && (
                    <a href="https://testnet.bnbchain.org/faucet-smart" target="_blank" rel="noopener noreferrer" className="text-primary underline">BSC Faucet</a>
                  )}
                  {selectedNetwork.id === "polygon-amoy" && (
                    <a href="https://faucet.polygon.technology" target="_blank" rel="noopener noreferrer" className="text-primary underline">Polygon Faucet</a>
                  )}
                  {selectedNetwork.id !== "bsc-testnet" && selectedNetwork.id !== "polygon-amoy" && (
                    <span className="text-primary">{selectedNetwork.blockExplorerUrl}</span>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-red-400/90 bg-red-500/5 border border-red-500/20 px-2 py-1.5">
                  🔴 Выбрана <span className="font-mono font-bold">{selectedNetwork.name}</span> — mainnet с реальными деньгами. Убедись что сеть правильная.
                </div>
              )}
            </div>
          )}

          {/* Deployed address */}
          {tokenAddr && (
            <div className="bg-muted border border-border p-2 flex items-center justify-between">
              <span className="text-[11px] font-mono text-primary">{tokenAddr}</span>
              <div className="flex gap-1">
                <button onClick={() => copyAddress(tokenAddr)} className="text-muted-foreground hover:text-primary transition-colors" data-testid="button-copy-FakeToken">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a href={selectedNetwork.explorerAddr(tokenAddr)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {tokenTxHash && !tokenAddr && (
            <div className="bg-muted border border-border p-2 flex items-center justify-between">
              <span className="text-[10px] font-mono text-yellow-400">Tx: {tokenTxHash.slice(0, 20)}…</span>
              <a href={selectedNetwork.explorerTx(tokenTxHash)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <Button
            onClick={handleDeployToken}
            disabled={tokenStatus === "deploying" || !walletConnected}
            data-testid="button-deploy-FakeToken"
            className={`font-bold uppercase tracking-wider text-xs h-8 ${
              tokenAddr
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            }`}
          >
            {tokenStatus === "deploying" ? (
              <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Deploying → {selectedNetwork.shortName}…</>
            ) : tokenAddr ? (
              <><Rocket className="w-3 h-3 mr-2" /> Redeploy → {selectedNetwork.shortName}</>
            ) : (
              <><Rocket className="w-3 h-3 mr-2" /> Deploy → {selectedNetwork.shortName}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Other Contracts ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-6 mb-2">
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">// Other Contracts → {selectedNetwork.name}</span>
      </div>

      <div className="grid gap-4">
        {CONTRACT_INFO.map((info) => {
          const status = statuses[info.name] || "idle";
          const addr = deployedAddrs[info.name];
          const prevAddr = getDeployedAddress(info.name);

          return (
            <Card key={info.name} className="bg-card border-border" data-testid={`card-deploy-${info.name}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      {info.label}
                      {(addr || prevAddr) && (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] uppercase">Deployed</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-1">{info.description}</CardDescription>
                  </div>
                  <StatusBadge status={status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {info.functions.map((fn) => (
                    <span key={fn} className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 border border-border">
                      {fn}()
                    </span>
                  ))}
                </div>
                {(addr || prevAddr) && (
                  <div className="bg-muted border border-border p-2 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-primary">{addr || prevAddr}</span>
                    <div className="flex gap-1">
                      <button onClick={() => copyAddress(addr || prevAddr || "")} className="text-muted-foreground hover:text-primary transition-colors" data-testid={`button-copy-${info.name}`}>
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a href={selectedNetwork.explorerAddr(addr || prevAddr || "")} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
                {!selectedNetwork.isTestnet && (
                  <div className="text-[10px] text-red-400/80 bg-red-500/5 border border-red-500/20 px-2 py-1">
                    🔴 Мейннет: <span className="font-mono">{selectedNetwork.name}</span> — реальные деньги
                  </div>
                )}
                <Button
                  onClick={() => handleDeploy(info.name)}
                  disabled={status === "deploying" || !walletConnected}
                  data-testid={`button-deploy-${info.name}`}
                  className={`w-full font-bold uppercase tracking-wider text-xs h-8 ${
                    addr || prevAddr
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
                  }`}
                >
                  {status === "deploying" ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Deploying on {selectedNetwork.shortName}...</>
                  ) : addr || prevAddr ? (
                    <><Rocket className="w-3 h-3 mr-2" /> Redeploy → {selectedNetwork.shortName}</>
                  ) : (
                    <><Rocket className="w-3 h-3 mr-2" /> Deploy → {selectedNetwork.shortName}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DeployStatus }) {
  if (status === "idle") return null;
  if (status === "deploying")
    return (
      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] uppercase">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Deploying
      </Badge>
    );
  if (status === "deployed")
    return (
      <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] uppercase">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Deployed
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[9px] uppercase">
        <AlertCircle className="w-3 h-3 mr-1" /> Failed
      </Badge>
    );
  return null;
}
