import { useState } from "react";
import { ethers } from "ethers";
import { Zap, Key, Download, Activity, MessageSquare, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getSigner,
  getProvider,
  ABIS,
  ESCROW_CONTRACT,
  IDENTITY_CONTRACT,
  MESSAGE_CONTRACT,
  KNOWN_CONTRACTS,
  polygonscanTx,
  getDeployedAddress,
} from "@/lib/contracts";
import type { TxRecord } from "@/pages/Dashboard";

interface QuickActionsProps {
  walletConnected: boolean;
  onAddTx: (tx: TxRecord) => void;
  onUpdateTx: (id: string, status: TxRecord["status"]) => void;
}

export default function QuickActions({ walletConnected, onAddTx, onUpdateTx }: QuickActionsProps) {
  const [adminKeyStatus, setAdminKeyStatus] = useState<"idle" | "signing" | "sending" | "done" | "error">("idle");
  const [adminKeyTx, setAdminKeyTx] = useState("");

  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exportData, setExportData] = useState<any>(null);

  const [pingStatus, setPingStatus] = useState<Record<string, "idle" | "ok" | "error">>({});
  const [pinging, setPinging] = useState(false);

  const [readAddr1, setReadAddr1] = useState("");
  const [readAddr2, setReadAddr2] = useState("");
  const [readMessages, setReadMessages] = useState<any[]>([]);
  const [readLoading, setReadLoading] = useState(false);

  const { toast } = useToast();

  // Quick Action 1: Set Admin Key
  async function handleSetAdminKey() {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }
    setAdminKeyStatus("signing");
    const txId = `admin-key-${Date.now()}`;
    try {
      const signer = await getSigner();
      const sig = await signer.signMessage("Web3Messenger-Admin-Escrow-KeyPair-v1");
      const sigBytes = ethers.utils.arrayify(sig);
      const hashBuffer = await crypto.subtle.digest("SHA-256", sigBytes);
      const secretKey = new Uint8Array(hashBuffer);
      const pubKeyHex = ethers.utils.hexlify(secretKey);

      setAdminKeyStatus("sending");
      const escrowAddr = getDeployedAddress("KeyEscrow") || ESCROW_CONTRACT;
      const contract = new ethers.Contract(escrowAddr, ABIS.KeyEscrow, signer);

      onAddTx({ id: txId, time: new Date().toLocaleTimeString(), contract: "KeyEscrow", fn: "setAdminPublicKey()", txHash: "", status: "pending" });
      const tx = await contract.setAdminPublicKey(ethers.utils.arrayify(pubKeyHex));
      setAdminKeyTx(tx.hash);
      await tx.wait(1);
      setAdminKeyStatus("done");
      onUpdateTx(txId, "confirmed");
      toast({ title: "Admin Key Set", description: "Admin public key saved to escrow contract." });
    } catch (e: any) {
      setAdminKeyStatus("error");
      onUpdateTx(txId, "failed");
      toast({ title: "Error", description: e.message || String(e), variant: "destructive" });
    }
  }

  // Quick Action 2: Export Key Archive
  async function handleExportKeys() {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }
    setExportStatus("loading");
    try {
      const provider = await getProvider();
      const escrowAddr = getDeployedAddress("KeyEscrow") || ESCROW_CONTRACT;
      const contract = new ethers.Contract(escrowAddr, ABIS.KeyEscrow, provider);
      const count = (await contract.getUserCount()).toNumber();
      const batchSize = 50;
      const users: string[] = [];
      for (let i = 0; i < count; i += batchSize) {
        const batch = await contract.getUsers(i, Math.min(batchSize, count - i));
        users.push(...batch);
      }
      const records = await Promise.all(
        users.map(async (addr: string) => {
          try {
            const key = await contract.getKey(addr);
            return { address: addr, status: "retrieved", keyHex: key, keyLength: (key.length - 2) / 2 };
          } catch {
            return { address: addr, status: "error", keyHex: null };
          }
        })
      );
      const archive = {
        version: 2,
        exportedAt: new Date().toISOString(),
        contractAddress: escrowAddr,
        chainId: 137,
        totalUsers: count,
        users: records,
      };
      setExportData(archive);
      setExportStatus("done");
      toast({ title: "Archive Ready", description: `${count} users retrieved.` });
    } catch (e: any) {
      setExportStatus("error");
      toast({ title: "Export Failed", description: e.message || String(e), variant: "destructive" });
    }
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `key-archive-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Quick Action 3: Check Contract Status
  async function handlePingContracts() {
    setPinging(true);
    const provider = await getProvider();
    const results: Record<string, "ok" | "error"> = {};
    for (const c of KNOWN_CONTRACTS) {
      try {
        const code = await provider.getCode(c.address);
        results[c.name] = code && code !== "0x" ? "ok" : "error";
      } catch {
        results[c.name] = "error";
      }
    }
    setPingStatus(results);
    setPinging(false);
    toast({ title: "Ping Complete", description: "Contract status updated." });
  }

  // Quick Action 4: Read Conversation
  async function handleReadConversation() {
    if (!readAddr1 || !readAddr2) {
      toast({ title: "Error", description: "Enter both addresses.", variant: "destructive" });
      return;
    }
    setReadLoading(true);
    try {
      const provider = await getProvider();
      const contract = new ethers.Contract(MESSAGE_CONTRACT, ABIS.MessageStorage, provider);
      const count = await contract.messageCount(readAddr1, readAddr2);
      const total = count.toNumber();
      if (total === 0) {
        setReadMessages([]);
        toast({ title: "No Messages", description: "No messages found between these addresses." });
        return;
      }
      const [messages] = await contract.getConversation(readAddr1, readAddr2, 0, Math.min(50, total));
      setReadMessages(messages.map((m: any) => ({
        sender: m.sender,
        text: m.text,
        timestamp: new Date(m.timestamp.toNumber() * 1000).toLocaleString(),
      })));
    } catch (e: any) {
      toast({ title: "Error", description: e.message || String(e), variant: "destructive" });
    } finally {
      setReadLoading(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="section-quick">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="w-4 h-4 text-yellow-400" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Quick Actions</h2>
        <span className="text-[10px] text-muted-foreground">// One-click admin operations</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Set Admin Key */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-primary" />
              Set Admin Key
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Sign MetaMask message, derive admin keypair, push public key to escrow contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleSetAdminKey}
              disabled={adminKeyStatus === "signing" || adminKeyStatus === "sending"}
              data-testid="button-set-admin-key"
              className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase text-[10px] font-bold h-8 w-full glow-primary"
            >
              {adminKeyStatus === "signing" ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Signing...</>
              ) : adminKeyStatus === "sending" ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending...</>
              ) : (
                <><Key className="w-3 h-3 mr-1" /> Derive & Set Admin Key</>
              )}
            </Button>
            {adminKeyStatus === "done" && adminKeyTx && (
              <a href={polygonscanTx(adminKeyTx)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary hover:underline" data-testid="link-admin-key-tx">
                <CheckCircle2 className="w-3 h-3" /> Confirmed: {adminKeyTx.slice(0, 16)}...
              </a>
            )}
            {adminKeyStatus === "error" && (
              <div className="flex items-center gap-1 text-[10px] text-destructive">
                <AlertCircle className="w-3 h-3" /> Failed. Try again.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export Key Archive */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-accent" />
              Export Key Archive
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Read all user keys from escrow contract and download as JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleExportKeys}
              disabled={exportStatus === "loading"}
              data-testid="button-export-keys"
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase text-[10px] font-bold h-8 w-full glow-accent"
            >
              {exportStatus === "loading" ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading...</>
              ) : (
                <><Download className="w-3 h-3 mr-1" /> Export Archive</>
              )}
            </Button>
            {exportData && (
              <div className="space-y-2">
                <div className="bg-muted border border-border p-2 text-[10px] font-mono text-muted-foreground">
                  {exportData.totalUsers} users · {new Date(exportData.exportedAt).toLocaleString()}
                </div>
                <Button size="sm" variant="outline" onClick={downloadExport}
                  data-testid="button-download-archive"
                  className="text-[10px] uppercase font-bold border-border h-7 w-full">
                  <Download className="w-3 h-3 mr-1" /> Download JSON
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-yellow-400" />
              Contract Status
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Ping all known contracts to verify they're deployed and accessible.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handlePingContracts}
              disabled={pinging}
              data-testid="button-ping-contracts"
              className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 uppercase text-[10px] font-bold h-8 w-full"
            >
              {pinging ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Pinging...</> : <><Activity className="w-3 h-3 mr-1" /> Check All</>}
            </Button>
            {Object.keys(pingStatus).length > 0 && (
              <div className="space-y-1">
                {KNOWN_CONTRACTS.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-muted-foreground">{c.name}</span>
                    {pingStatus[c.name] === "ok" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px]">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Live
                      </Badge>
                    ) : pingStatus[c.name] === "error" ? (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[9px]">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Down
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Read Conversation */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              Read Conversation
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Fetch raw on-chain messages between two addresses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={readAddr1} onChange={(e) => setReadAddr1(e.target.value)} placeholder="Address A (0x...)" className="text-xs font-mono bg-background border-border h-8" data-testid="input-read-addr1" />
            <Input value={readAddr2} onChange={(e) => setReadAddr2(e.target.value)} placeholder="Address B (0x...)" className="text-xs font-mono bg-background border-border h-8" data-testid="input-read-addr2" />
            <Button onClick={handleReadConversation} disabled={readLoading} data-testid="button-read-conversation"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 uppercase text-[10px] font-bold h-8 w-full">
              {readLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading...</> : <><MessageSquare className="w-3 h-3 mr-1" /> Read Messages</>}
            </Button>
            {readMessages.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {readMessages.map((m, i) => (
                  <div key={i} className="bg-muted border border-border p-2 text-[10px]">
                    <div className="text-muted-foreground font-mono">{m.sender.slice(0, 10)}... · {m.timestamp}</div>
                    <div className="text-foreground font-mono mt-0.5 break-all">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
            {readMessages.length === 0 && readLoading === false && readAddr1 && (
              <div className="text-[10px] text-muted-foreground">No messages loaded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
