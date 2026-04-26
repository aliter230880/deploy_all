import { useState } from "react";
import { ethers } from "ethers";
import { PenLine, Send, ChevronDown, ChevronRight, Loader2, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ABIS,
  KNOWN_CONTRACTS,
  getSigner,
  isViewFunction,
  parseFunctionName,
  parseFunctionParams,
  polygonscanTx,
} from "@/lib/contracts";
import type { TxRecord } from "@/pages/Dashboard";

interface WriteContractProps {
  walletConnected: boolean;
  onAddTx: (tx: TxRecord) => void;
  onUpdateTx: (id: string, status: TxRecord["status"]) => void;
}

export default function WriteContract({ walletConnected, onAddTx, onUpdateTx }: WriteContractProps) {
  const [contractAddr, setContractAddr] = useState("");
  const [selectedAbi, setSelectedAbi] = useState<string>("");
  const [expandedFns, setExpandedFns] = useState<Record<string, boolean>>({});
  const [fnParams, setFnParams] = useState<Record<string, string[]>>({});
  const [txHashes, setTxHashes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [confirmFn, setConfirmFn] = useState<{ name: string; params: string[] } | null>(null);
  const { toast } = useToast();

  const abiSigs = selectedAbi ? ABIS[selectedAbi] || [] : [];
  const writeFns = abiSigs.filter((sig) => !isViewFunction(sig));

  function toggleFn(name: string) {
    setExpandedFns((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function setParam(fnName: string, idx: number, value: string) {
    setFnParams((prev) => {
      const cur = prev[fnName] ? [...prev[fnName]] : [];
      cur[idx] = value;
      return { ...prev, [fnName]: cur };
    });
  }

  function requestSend(name: string, params: string[]) {
    if (!walletConnected) {
      toast({ title: "Wallet Required", description: "Connect MetaMask first.", variant: "destructive" });
      return;
    }
    if (!contractAddr) {
      toast({ title: "Error", description: "Enter a contract address.", variant: "destructive" });
      return;
    }
    setConfirmFn({ name, params });
  }

  async function executeSend() {
    if (!confirmFn) return;
    const { name, params } = confirmFn;
    setConfirmFn(null);
    setLoading((prev) => ({ ...prev, [name]: true }));

    const txId = `write-${name}-${Date.now()}`;
    onAddTx({
      id: txId,
      time: new Date().toLocaleTimeString(),
      contract: selectedAbi || contractAddr,
      fn: `${name}()`,
      txHash: "",
      status: "pending",
    });

    try {
      const signer = await getSigner();
      const abi = ABIS[selectedAbi] || [];
      const contract = new ethers.Contract(contractAddr, abi, signer);
      const tx = await contract[name](...params);
      onAddTx({
        id: txId,
        time: new Date().toLocaleTimeString(),
        contract: selectedAbi || contractAddr,
        fn: `${name}()`,
        txHash: tx.hash,
        status: "pending",
      });
      setTxHashes((prev) => ({ ...prev, [name]: tx.hash }));
      toast({ title: "Transaction Sent", description: `Hash: ${tx.hash.slice(0, 20)}...` });
      await tx.wait(1);
      onUpdateTx(txId, "confirmed");
      toast({ title: "Confirmed", description: `${name}() executed successfully.` });
    } catch (e: any) {
      onUpdateTx(txId, "failed");
      toast({ title: "Transaction Failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setLoading((prev) => ({ ...prev, [name]: false }));
    }
  }

  function loadKnown(known: (typeof KNOWN_CONTRACTS)[0]) {
    setContractAddr(known.address);
    setSelectedAbi(known.abi);
  }

  return (
    <div className="space-y-6" data-testid="section-write">
      <div className="flex items-center gap-2 mb-2">
        <PenLine className="w-4 h-4 text-accent" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Write Contract</h2>
        <span className="text-[10px] text-muted-foreground">// Send transactions</span>
      </div>

      {/* Known contracts */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Known Contracts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {KNOWN_CONTRACTS.map((c) => (
            <Button
              key={c.name}
              variant="outline"
              size="sm"
              onClick={() => loadKnown(c)}
              data-testid={`button-load-write-${c.name}`}
              className="text-[10px] uppercase font-bold border-border text-muted-foreground hover:text-accent hover:border-accent h-7"
            >
              {c.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Contract selector */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Contract</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Input
            value={contractAddr}
            onChange={(e) => setContractAddr(e.target.value)}
            placeholder="0x..."
            className="flex-1 font-mono text-xs bg-background border-border"
            data-testid="input-write-contract-address"
          />
          <Select value={selectedAbi} onValueChange={setSelectedAbi}>
            <SelectTrigger
              className="w-48 text-xs font-bold uppercase border-border bg-background"
              data-testid="select-write-abi"
            >
              <SelectValue placeholder="Select ABI" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {Object.keys(ABIS).map((k) => (
                <SelectItem key={k} value={k} className="text-xs font-bold uppercase">
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Write functions */}
      {writeFns.length > 0 && (
        <div className="space-y-2">
          {writeFns.map((sig) => {
            const name = parseFunctionName(sig);
            const params = parseFunctionParams(sig);
            const expanded = expandedFns[name];
            const isLoading = loading[name];
            const txHash = txHashes[name];
            const curParams = fnParams[name] || [];

            return (
              <Card key={name} className="bg-card border-border">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => toggleFn(name)}
                  data-testid={`write-fn-toggle-${name}`}
                >
                  <span className="text-xs font-mono font-bold text-accent">{name}()</span>
                  <div className="flex items-center gap-2">
                    {txHash && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    )}
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {expanded && (
                  <CardContent className="border-t border-border space-y-3 pt-3">
                    {params.map((p, i) => (
                      <div key={i}>
                        <label className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">
                          {p}
                        </label>
                        <Input
                          value={curParams[i] || ""}
                          onChange={(e) => setParam(name, i, e.target.value)}
                          placeholder={p}
                          className="text-xs font-mono bg-background border-border h-8"
                          data-testid={`write-param-${name}-${i}`}
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={() => requestSend(name, curParams.slice(0, params.length))}
                      disabled={isLoading}
                      data-testid={`button-send-${name}`}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase text-[10px] font-bold h-7 glow-accent"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <><Send className="w-3 h-3 mr-1" /> Send Transaction</>
                      )}
                    </Button>
                    {txHash && (
                      <a
                        href={polygonscanTx(txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                        data-testid={`link-tx-${name}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {txHash.slice(0, 20)}...
                      </a>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmFn} onOpenChange={(o) => !o && setConfirmFn(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold uppercase text-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-accent" />
              Confirm Transaction
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground space-y-2">
              <div>
                <span className="uppercase font-bold text-[10px] text-muted-foreground">Function:</span>
                <div className="font-mono text-accent mt-0.5">{confirmFn?.name}()</div>
              </div>
              {confirmFn?.params.length ? (
                <div>
                  <span className="uppercase font-bold text-[10px] text-muted-foreground">Params:</span>
                  <div className="font-mono text-foreground mt-0.5 break-all">
                    {confirmFn.params.join(", ")}
                  </div>
                </div>
              ) : null}
              <div className="text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 p-2 mt-2">
                This will send a real transaction on Polygon Mainnet. Gas fees apply.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-xs uppercase font-bold border-border"
              data-testid="button-confirm-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeSend}
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs uppercase font-bold"
              data-testid="button-confirm-send"
            >
              <Send className="w-3 h-3 mr-1" /> Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
