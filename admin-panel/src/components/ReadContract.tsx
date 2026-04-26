import { useState } from "react";
import { ethers } from "ethers";
import { BookOpen, Play, ChevronDown, ChevronRight, Loader2, AlertCircle } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  ABIS,
  KNOWN_CONTRACTS,
  getProvider,
  isViewFunction,
  parseFunctionName,
  parseFunctionParams,
} from "@/lib/contracts";

interface ReadContractProps {
  walletConnected: boolean;
}

interface FunctionResult {
  name: string;
  result: string;
  error?: boolean;
}

const QUICK_READS = [
  {
    label: "KeyEscrow: getUserCount()",
    contract: KNOWN_CONTRACTS[0].address,
    abi: "KeyEscrow",
    fn: "getUserCount",
    params: [],
  },
  {
    label: "KeyEscrow: getAdminPublicKey()",
    contract: KNOWN_CONTRACTS[0].address,
    abi: "KeyEscrow",
    fn: "getAdminPublicKey",
    params: [],
  },
  {
    label: "Identity: getUsername(0xB19a...916eB)",
    contract: KNOWN_CONTRACTS[1].address,
    abi: "Identity",
    fn: "getUsername",
    params: ["0xB19aEe699eb4D2Af380c505E4d6A108b055916eB"],
  },
];

export default function ReadContract({ walletConnected }: ReadContractProps) {
  const [contractAddr, setContractAddr] = useState("");
  const [selectedAbi, setSelectedAbi] = useState<string>("");
  const [expandedFns, setExpandedFns] = useState<Record<string, boolean>>({});
  const [fnParams, setFnParams] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, FunctionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const abiSigs = selectedAbi ? ABIS[selectedAbi] || [] : [];
  const viewFns = abiSigs.filter(isViewFunction);

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

  async function callFunction(fnName: string, params: string[], addr: string, abiKey: string) {
    if (!addr) {
      toast({ title: "Error", description: "Enter a contract address.", variant: "destructive" });
      return;
    }
    setLoading((prev) => ({ ...prev, [fnName]: true }));
    try {
      const provider = await getProvider();
      const abi = ABIS[abiKey] || [];
      const contract = new ethers.Contract(addr, abi, provider);
      const result = await contract[fnName](...params);
      let display: string;
      if (typeof result === "object" && result._isBigNumber) {
        display = result.toString();
      } else if (Array.isArray(result)) {
        display = JSON.stringify(result.map((r: any) => (r._isBigNumber ? r.toString() : r)), null, 2);
      } else {
        display = String(result);
      }
      setResults((prev) => ({ ...prev, [fnName]: { name: fnName, result: display } }));
    } catch (e: any) {
      setResults((prev) => ({
        ...prev,
        [fnName]: { name: fnName, result: e.message || String(e), error: true },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [fnName]: false }));
    }
  }

  async function quickRead(item: (typeof QUICK_READS)[0]) {
    setContractAddr(item.contract);
    setSelectedAbi(item.abi);
    await callFunction(item.fn, item.params, item.contract, item.abi);
    setExpandedFns((prev) => ({ ...prev, [item.fn]: true }));
  }

  function loadKnown(known: (typeof KNOWN_CONTRACTS)[0]) {
    setContractAddr(known.address);
    setSelectedAbi(known.abi);
  }

  return (
    <div className="space-y-6" data-testid="section-read">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Read Contract</h2>
        <span className="text-[10px] text-muted-foreground">// Call view/pure functions</span>
      </div>

      {/* Quick reads */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Quick Read</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_READS.map((q) => (
            <Button
              key={q.label}
              variant="outline"
              size="sm"
              onClick={() => quickRead(q)}
              data-testid={`button-quickread-${q.fn}`}
              className="text-[10px] uppercase font-bold border-border text-muted-foreground hover:text-primary hover:border-primary h-7"
            >
              <Play className="w-2.5 h-2.5 mr-1" />
              {q.label}
            </Button>
          ))}
        </CardContent>
      </Card>

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
              data-testid={`button-load-${c.name}`}
              className="text-[10px] uppercase font-bold border-border text-muted-foreground hover:text-primary hover:border-primary h-7"
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
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <Input
              value={contractAddr}
              onChange={(e) => setContractAddr(e.target.value)}
              placeholder="0x..."
              className="flex-1 font-mono text-xs bg-background border-border"
              data-testid="input-contract-address"
            />
            <Select value={selectedAbi} onValueChange={setSelectedAbi}>
              <SelectTrigger
                className="w-48 text-xs font-bold uppercase border-border bg-background"
                data-testid="select-abi"
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
          </div>
        </CardContent>
      </Card>

      {/* View functions */}
      {viewFns.length > 0 && (
        <div className="space-y-2">
          {viewFns.map((sig) => {
            const name = parseFunctionName(sig);
            const params = parseFunctionParams(sig);
            const expanded = expandedFns[name];
            const result = results[name];
            const isLoading = loading[name];
            const curParams = fnParams[name] || [];

            return (
              <Card key={name} className="bg-card border-border">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => toggleFn(name)}
                  data-testid={`fn-toggle-${name}`}
                >
                  <span className="text-xs font-mono font-bold text-primary">{name}()</span>
                  <div className="flex items-center gap-2">
                    {result && !result.error && (
                      <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 border border-primary/30 truncate max-w-32">
                        {result.result.length > 20 ? result.result.slice(0, 20) + "..." : result.result}
                      </span>
                    )}
                    {result?.error && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
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
                          data-testid={`input-param-${name}-${i}`}
                        />
                      </div>
                    ))}
                    <Button
                      size="sm"
                      onClick={() =>
                        callFunction(name, curParams.slice(0, params.length), contractAddr, selectedAbi)
                      }
                      disabled={isLoading}
                      data-testid={`button-call-${name}`}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase text-[10px] font-bold h-7"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <><Play className="w-3 h-3 mr-1" /> Call</>
                      )}
                    </Button>
                    {result && (
                      <div
                        className={`p-3 text-[11px] font-mono border ${
                          result.error
                            ? "bg-destructive/5 border-destructive/30 text-destructive"
                            : "bg-primary/5 border-primary/20 text-primary"
                        } whitespace-pre-wrap break-all`}
                        data-testid={`result-${name}`}
                      >
                        {result.result}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
