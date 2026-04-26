import { useState, useRef } from "react";
import { ethers } from "ethers";
import {
  Upload, Loader2, CheckCircle2, AlertCircle, ExternalLink,
  Copy, FileCode2, ChevronDown, ChevronUp, Cpu, Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getProvider, formatAddress } from "@/lib/contracts";
import { switchToNetwork, type NetworkConfig } from "@/lib/networks";

interface ContractUploaderProps {
  walletConnected: boolean;
  selectedNetwork: NetworkConfig;
  onAddTx: (tx: any) => void;
  onUpdateTx: (id: string, status: any) => void;
}

interface AbiInput {
  name: string;
  type: string;
  internalType?: string;
}

interface CompiledContract {
  name: string;
  abi: any[];
  bytecode: string;
  constructorInputs: AbiInput[];
}

type CompileState = "idle" | "loading-compiler" | "compiling" | "compiled" | "error";
type DeployState = "idle" | "deploying" | "deployed" | "error";

const SOLC_VERSION = "v0.8.20+commit.a1b79de6";
const SOLC_URL = `https://binaries.soliditylang.org/bin/soljson-${SOLC_VERSION}.js`;

let cachedSolc: any = null;

function loadSolcCompiler(): Promise<any> {
  if (cachedSolc) return Promise.resolve(cachedSolc);
  return new Promise((resolve, reject) => {
    (window as any).Module = {
      onRuntimeInitialized() {
        cachedSolc = (window as any).Module;
        resolve(cachedSolc);
      },
    };
    const existing = document.querySelector(`script[src="${SOLC_URL}"]`);
    if (existing) {
      const poll = setInterval(() => {
        if (cachedSolc) { clearInterval(poll); resolve(cachedSolc); }
      }, 100);
      return;
    }
    const script = document.createElement("script");
    script.src = SOLC_URL;
    script.onerror = () => reject(new Error("Не удалось загрузить компилятор Solidity"));
    document.head.appendChild(script);
  });
}

function compileSolidity(source: string, filename: string, mod: any): any {
  const input = JSON.stringify({
    language: "Solidity",
    sources: { [filename]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "london",
      outputSelection: { "*": { "*": ["evm.bytecode.object", "abi"] } },
    },
  });
  const compileFunc = mod.cwrap("solidity_compile", "string", ["string", "number"]);
  return JSON.parse(compileFunc(input, 0));
}

function abiTypeToPlaceholder(type: string): string {
  if (type === "address") return "0x...";
  if (type.startsWith("uint") || type.startsWith("int")) return "0";
  if (type === "bool") return "true / false";
  if (type === "string") return "text";
  if (type.startsWith("bytes")) return "0x...";
  return "";
}

function parseArgValue(value: string, type: string): any {
  if (type === "bool") return value.trim().toLowerCase() === "true" || value.trim() === "1";
  if (type.startsWith("uint") || type.startsWith("int")) {
    return ethers.BigNumber.from(value.trim());
  }
  return value.trim();
}

export default function ContractUploader({
  walletConnected,
  selectedNetwork,
  onAddTx,
  onUpdateTx,
}: ContractUploaderProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [compileError, setCompileError] = useState<string>("");
  const [contracts, setContracts] = useState<CompiledContract[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployedAddress, setDeployedAddress] = useState<string>("");
  const [deployedTxHash, setDeployedTxHash] = useState<string>("");
  const [showAbi, setShowAbi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCompileState("idle");
    setContracts([]);
    setDeployState("idle");
    setDeployedAddress("");
    setArgValues({});
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target?.result as string);
    reader.readAsText(file);
  }

  async function handleCompile() {
    if (!fileContent) return;
    setCompileState("loading-compiler");
    setCompileError("");
    try {
      const mod = await loadSolcCompiler();
      setCompileState("compiling");
      const result = compileSolidity(fileContent, fileName, mod);

      if (result.errors) {
        const errs = result.errors.filter((e: any) => e.severity === "error");
        if (errs.length > 0) {
          setCompileState("error");
          setCompileError(errs.map((e: any) => e.formattedMessage || e.message).join("\n"));
          return;
        }
      }

      const compiled: CompiledContract[] = [];
      for (const [, contractsObj] of Object.entries(result.contracts || {}) as any) {
        for (const [name, data] of Object.entries(contractsObj) as any) {
          const bytecode = "0x" + data.evm.bytecode.object;
          if (!data.evm.bytecode.object) continue;
          const abi: any[] = data.abi || [];
          const constructorDef = abi.find((x: any) => x.type === "constructor");
          const constructorInputs: AbiInput[] = constructorDef?.inputs || [];
          compiled.push({ name, abi, bytecode, constructorInputs });
        }
      }

      if (compiled.length === 0) {
        setCompileState("error");
        setCompileError("Контрактов не найдено в файле.");
        return;
      }

      setContracts(compiled);
      setSelectedIdx(0);
      setArgValues({});
      setCompileState("compiled");
    } catch (err: any) {
      setCompileState("error");
      setCompileError(err.message || String(err));
    }
  }

  function setArg(name: string, val: string) {
    setArgValues((prev) => ({ ...prev, [name]: val }));
  }

  const selected = contracts[selectedIdx];

  async function handleDeploy() {
    if (!walletConnected || !selected) return;
    setDeployState("deploying");
    const txId = `custom-${Date.now()}`;
    onAddTx({
      id: txId,
      time: new Date().toLocaleTimeString(),
      contract: selected.name,
      fn: "deploy()",
      txHash: "",
      status: "pending",
    });

    try {
      await switchToNetwork(selectedNetwork);
      const provider = await getProvider();
      const signer = provider.getSigner();

      const constructorArgs = selected.constructorInputs.map((inp) => {
        const raw = argValues[inp.name] ?? "";
        return parseArgValue(raw, inp.type);
      });

      const factory = new ethers.ContractFactory(selected.abi, selected.bytecode, signer);
      const contract = await factory.deploy(...constructorArgs);
      setDeployedTxHash(contract.deployTransaction.hash);
      await contract.deployTransaction.wait(1);
      setDeployedAddress(contract.address);
      setDeployState("deployed");
      onUpdateTx(txId, "confirmed");

      localStorage.setItem(`deployed_custom_${selected.name}`, contract.address);

      toast({
        title: `${selected.name} задеплоен`,
        description: `Адрес: ${contract.address}`,
      });
    } catch (err: any) {
      setDeployState("error");
      onUpdateTx(txId, "failed");
      toast({
        title: "Ошибка деплоя",
        description: err.reason || err.message || String(err),
        variant: "destructive",
      });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано" });
  }

  const explorerUrl = selectedNetwork.blockExplorerUrl;
  const explorerAddr = deployedAddress ? `${explorerUrl}/address/${deployedAddress}` : "";
  const explorerTx = deployedTxHash ? `${explorerUrl}/tx/${deployedTxHash}` : "";

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-primary" />
            <CardTitle className="font-mono text-sm uppercase tracking-widest text-primary">
              Deploy из .sol файла
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground font-mono">
            Загрузи Solidity контракт — панель скомпилирует его и задеплоит через MetaMask.
            Импорты из внешних пакетов (OpenZeppelin и т.д.) не поддерживаются.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-8 cursor-pointer flex flex-col items-center gap-3 transition-colors group"
          >
            <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="text-center">
              <p className="text-sm font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                {fileName ? fileName : "Нажми чтобы выбрать .sol файл"}
              </p>
              {fileName && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">Файл выбран ✓</p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".sol"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Compile button */}
          {fileContent && compileState !== "compiled" && (
            <Button
              onClick={handleCompile}
              disabled={compileState === "loading-compiler" || compileState === "compiling"}
              className="w-full bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 font-mono uppercase text-xs tracking-widest"
            >
              {compileState === "loading-compiler" && (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Загрузка компилятора…</>
              )}
              {compileState === "compiling" && (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Компиляция…</>
              )}
              {(compileState === "idle" || compileState === "error") && (
                <><Cpu className="w-4 h-4 mr-2" />Скомпилировать</>
              )}
            </Button>
          )}

          {/* Compile error */}
          {compileState === "error" && (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-destructive text-xs font-mono mb-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Ошибка компиляции
              </div>
              <pre className="text-[10px] text-destructive/80 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {compileError}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compiled results */}
      {compileState === "compiled" && contracts.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              <CardTitle className="font-mono text-sm uppercase tracking-widest text-cyan-400">
                Контракт готов к деплою
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Contract selector (if multiple in one file) */}
            {contracts.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                  Выбери контракт
                </Label>
                <div className="flex flex-wrap gap-2">
                  {contracts.map((c, i) => (
                    <button
                      key={c.name}
                      onClick={() => { setSelectedIdx(i); setArgValues({}); setDeployState("idle"); setDeployedAddress(""); }}
                      className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                        selectedIdx === i
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-muted border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected contract info */}
            {selected && (
              <>
                <div className="bg-muted/30 rounded p-3 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-foreground">{selected.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {selected.abi.filter((x) => x.type === "function").length} функций ·{" "}
                      {selected.bytecode.length / 2 - 1} байт
                    </p>
                  </div>
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px] font-mono uppercase">
                    OK
                  </Badge>
                </div>

                {/* Constructor args */}
                {selected.constructorInputs.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      Аргументы конструктора
                    </p>
                    {selected.constructorInputs.map((inp) => (
                      <div key={inp.name} className="space-y-1.5">
                        <Label className="text-xs font-mono">
                          <span className="text-cyan-400">{inp.name}</span>
                          <span className="text-muted-foreground ml-2">{inp.type}</span>
                        </Label>
                        <Input
                          value={argValues[inp.name] ?? ""}
                          onChange={(e) => setArg(inp.name, e.target.value)}
                          placeholder={abiTypeToPlaceholder(inp.type)}
                          className="font-mono text-xs h-8 bg-background border-border"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selected.constructorInputs.length === 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Конструктор без аргументов — можно деплоить сразу.
                  </p>
                )}

                {/* ABI preview toggle */}
                <button
                  onClick={() => setShowAbi((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAbi ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  ABI ({selected.abi.filter((x) => x.type === "function").length} функций)
                </button>
                {showAbi && (
                  <div className="bg-black/40 rounded p-3 max-h-48 overflow-y-auto">
                    {selected.abi
                      .filter((x) => x.type === "function")
                      .map((fn: any) => (
                        <p key={fn.name} className="text-[11px] font-mono text-muted-foreground leading-5">
                          <span className={fn.stateMutability === "view" || fn.stateMutability === "pure" ? "text-cyan-400" : "text-purple-400"}>
                            {fn.name}
                          </span>
                          ({fn.inputs?.map((i: any) => `${i.type} ${i.name}`).join(", ")})
                        </p>
                      ))}
                  </div>
                )}

                {/* Network badge */}
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span>Сеть:</span>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                    {selectedNetwork.name}
                  </Badge>
                </div>

                {/* Deploy button */}
                {deployState !== "deployed" && (
                  <Button
                    onClick={handleDeploy}
                    disabled={!walletConnected || deployState === "deploying"}
                    className="w-full bg-primary/20 hover:bg-primary/40 border border-primary/30 text-primary font-mono uppercase text-xs tracking-widest"
                  >
                    {deployState === "deploying" ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Деплой через MetaMask…</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Deploy {selected.name}</>
                    )}
                  </Button>
                )}

                {deployState === "error" && (
                  <div className="flex items-center gap-2 text-destructive text-xs font-mono">
                    <AlertCircle className="w-4 h-4" />
                    Ошибка деплоя — смотри уведомление
                  </div>
                )}

                {/* Deployed result */}
                {deployState === "deployed" && deployedAddress && (
                  <div className="rounded border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-400 font-mono text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      {selected.name} задеплоен!
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">Адрес:</span>
                        <code className="text-xs text-green-400 font-mono">{formatAddress(deployedAddress)}</code>
                        <button onClick={() => copyToClipboard(deployedAddress)} className="text-muted-foreground hover:text-foreground">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {explorerAddr && (
                          <a href={explorerAddr} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {deployedTxHash && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">Tx:</span>
                          <code className="text-xs text-muted-foreground font-mono">{formatAddress(deployedTxHash)}</code>
                          <button onClick={() => copyToClipboard(deployedTxHash)} className="text-muted-foreground hover:text-foreground">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {explorerTx && (
                            <a href={explorerTx} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        setFileContent(null);
                        setFileName("");
                        setContracts([]);
                        setDeployState("idle");
                        setDeployedAddress("");
                        setDeployedTxHash("");
                        setArgValues({});
                        setCompileState("idle");
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      variant="outline"
                      className="w-full text-xs font-mono"
                    >
                      Загрузить ещё один контракт
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
