import { useState } from "react";
import { ethers } from "ethers";
import { Rocket, CheckCircle2, Loader2, AlertCircle, ExternalLink, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getSigner,
  CONTRACT_BYTECODES,
  ABIS,
  polygonscanAddr,
  getDeployedAddress,
  saveDeployedAddress,
} from "@/lib/contracts";
import type { TxRecord } from "@/pages/Dashboard";

interface DeployProps {
  walletConnected: boolean;
  onAddTx: (tx: TxRecord) => void;
  onUpdateTx: (id: string, status: TxRecord["status"]) => void;
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

export default function Deploy({ walletConnected, onAddTx, onUpdateTx }: DeployProps) {
  const [statuses, setStatuses] = useState<Record<string, DeployStatus>>({});
  const [deployedAddrs, setDeployedAddrs] = useState<Record<string, string>>(() => {
    const saved: Record<string, string> = {};
    for (const c of CONTRACT_INFO) {
      const addr = getDeployedAddress(c.name);
      if (addr) saved[c.name] = addr;
    }
    return saved;
  });
  const { toast } = useToast();

  async function handleDeploy(contractName: string) {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }
    setStatuses((s) => ({ ...s, [contractName]: "deploying" }));

    const txId = `${contractName}-${Date.now()}`;
    onAddTx({
      id: txId,
      time: new Date().toLocaleTimeString(),
      contract: contractName,
      fn: "deploy()",
      txHash: "",
      status: "pending",
    });

    try {
      const signer = await getSigner();
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

      toast({
        title: `${contractName} Deployed`,
        description: `Address: ${address}`,
      });
    } catch (e: any) {
      setStatuses((s) => ({ ...s, [contractName]: "error" }));
      onUpdateTx(txId, "failed");
      toast({ title: "Deploy Failed", description: e.message || String(e), variant: "destructive" });
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
        <span className="text-[10px] text-muted-foreground">// One-click deployment to Polygon Mainnet</span>
      </div>

      <div className="grid gap-4">
        {CONTRACT_INFO.map((info) => {
          const status = statuses[info.name] || "idle";
          const addr = deployedAddrs[info.name];
          const prevAddr = getDeployedAddress(info.name);

          return (
            <Card
              key={info.name}
              className="bg-card border-border"
              data-testid={`card-deploy-${info.name}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      {info.label}
                      {(addr || prevAddr) && (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] uppercase">
                          Deployed
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      {info.description}
                    </CardDescription>
                  </div>
                  <StatusBadge status={status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Functions list */}
                <div className="flex flex-wrap gap-1">
                  {info.functions.map((fn) => (
                    <span
                      key={fn}
                      className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 border border-border"
                    >
                      {fn}()
                    </span>
                  ))}
                </div>

                {/* Deployed address */}
                {(addr || prevAddr) && (
                  <div className="bg-muted border border-border p-2 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-primary">{addr || prevAddr}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyAddress(addr || prevAddr || "")}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        data-testid={`button-copy-${info.name}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={polygonscanAddr(addr || prevAddr || "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => handleDeploy(info.name)}
                  disabled={status === "deploying" || !walletConnected}
                  data-testid={`button-deploy-${info.name}`}
                  className={`font-bold uppercase tracking-wider text-xs h-8 ${
                    addr || prevAddr
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
                  }`}
                >
                  {status === "deploying" ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Deploying...</>
                  ) : addr || prevAddr ? (
                    <><Rocket className="w-3 h-3 mr-2" /> Redeploy</>
                  ) : (
                    <><Rocket className="w-3 h-3 mr-2" /> Deploy</>
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
