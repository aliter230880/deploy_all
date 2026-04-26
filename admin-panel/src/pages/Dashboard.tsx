import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Rocket, BookOpen, PenLine, Zap, Clock, LogOut,
  Wifi, WifiOff, AlertCircle, ExternalLink, ChevronDown,
  FlaskConical, Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getProvider, formatAddress } from "@/lib/contracts";
import { NETWORKS, DEFAULT_NETWORK, getNetworkByChainId, switchToNetwork, type NetworkConfig } from "@/lib/networks";
import Deploy from "@/components/Deploy";
import ReadContract from "@/components/ReadContract";
import WriteContract from "@/components/WriteContract";
import QuickActions from "@/components/QuickActions";
import TxHistory from "@/components/TxHistory";

export interface TxRecord {
  id: string;
  time: string;
  contract: string;
  fn: string;
  txHash: string;
  status: "pending" | "confirmed" | "failed";
}

type Section = "deploy" | "read" | "write" | "quick" | "history";

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "read", label: "Read Contract", icon: BookOpen },
  { id: "write", label: "Write Contract", icon: PenLine },
  { id: "quick", label: "Quick Actions", icon: Zap },
  { id: "history", label: "Tx History", icon: Clock },
];

const MAINNET_IDS = new Set(["polygon-mainnet", "bsc-mainnet"]);

export default function Dashboard() {
  const [section, setSection] = useState<Section>("deploy");
  const [wallet, setWallet] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeChainId, setActiveChainId] = useState<number | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig>(DEFAULT_NETWORK);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectWallet();
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", connectWallet);
      window.ethereum.on("chainChanged", handleChainChanged);
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", connectWallet);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNetworkOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChainChanged(chainIdHex: string) {
    const chainId = parseInt(chainIdHex, 16);
    setActiveChainId(chainId);
    const known = getNetworkByChainId(chainId);
    if (known) setSelectedNetwork(known);
  }

  async function connectWallet() {
    try {
      const provider = await getProvider();
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const net = await provider.getNetwork();
      setWallet(address);
      setActiveChainId(net.chainId);
      const known = getNetworkByChainId(net.chainId);
      if (known) setSelectedNetwork(known);
      setConnected(true);
    } catch (e: any) {
      setConnected(false);
    }
  }

  async function handleSelectNetwork(net: NetworkConfig) {
    setNetworkOpen(false);
    try {
      await switchToNetwork(net);
      setSelectedNetwork(net);
      toast({ title: `Switched to ${net.name}`, description: `Chain ID: ${net.chainId}` });
    } catch (e: any) {
      toast({ title: "Network Switch Failed", description: e.message?.slice(0, 120), variant: "destructive" });
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("isAdminAuthenticated");
    setLocation("/login");
  }

  function addTx(tx: TxRecord) {
    setTxHistory((prev) => [tx, ...prev]);
  }

  function updateTx(id: string, status: TxRecord["status"]) {
    setTxHistory((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  const networkMismatch = activeChainId !== null && activeChainId !== selectedNetwork.chainId;
  const isMainnet = MAINNET_IDS.has(selectedNetwork.id);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col" data-testid="sidebar">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-black">AT</span>
            </div>
            <div>
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">AliTerra</p>
              <p className="text-[10px] text-muted-foreground uppercase">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              data-testid={`nav-${id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                section === id
                  ? "bg-primary/10 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border-l-2 border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {/* Network picker in sidebar */}
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Network</p>
          <div className="space-y-0.5">
            {NETWORKS.map((net) => (
              <button
                key={net.id}
                onClick={() => handleSelectNetwork(net)}
                data-testid={`net-${net.id}`}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-mono transition-all rounded-sm ${
                  selectedNetwork.id === net.id
                    ? "bg-primary/10 text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${net.dotClass} ${
                  selectedNetwork.id === net.id ? "opacity-100" : "opacity-40"
                }`} />
                <span className="flex-1 text-left truncate">{net.name}</span>
                {net.isTestnet && (
                  <span className="text-[8px] text-yellow-500/70 uppercase">TEST</span>
                )}
                {selectedNetwork.id === net.id && (
                  <span className="text-[8px] text-primary">●</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Wallet status */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-3 h-3 text-primary" />
            ) : (
              <WifiOff className="w-3 h-3 text-destructive" />
            )}
            <span className="text-[10px] text-muted-foreground uppercase font-bold">
              {connected ? (activeChainId ? (getNetworkByChainId(activeChainId)?.shortName ?? `Chain ${activeChainId}`) : "Connected") : "Disconnected"}
            </span>
          </div>
          {wallet && (
            <div className="text-[10px] text-primary font-mono">{formatAddress(wallet)}</div>
          )}
          {!connected && (
            <button
              onClick={connectWallet}
              className="text-[10px] text-primary underline"
              data-testid="button-connect-wallet"
            >
              Connect
            </button>
          )}
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            data-testid="button-logout"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-destructive transition-colors uppercase font-bold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold uppercase tracking-widest text-foreground">
              {NAV_ITEMS.find((n) => n.id === section)?.label}
            </h1>
            <span className="text-[10px] text-muted-foreground font-mono">
              // {selectedNetwork.name.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Network badge pill in header */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setNetworkOpen((v) => !v)}
                data-testid="button-network-switcher"
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase border rounded-sm transition-colors ${selectedNetwork.badgeClass} hover:opacity-80`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedNetwork.dotClass}`} />
                {selectedNetwork.isTestnet ? (
                  <FlaskConical className="w-2.5 h-2.5" />
                ) : (
                  <Globe className="w-2.5 h-2.5" />
                )}
                {selectedNetwork.shortName}
                {selectedNetwork.isTestnet && <span className="opacity-60">testnet</span>}
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${networkOpen ? "rotate-180" : ""}`} />
              </button>

              {networkOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-card border border-border shadow-xl">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Select Network</p>
                  </div>
                  {NETWORKS.map((net) => (
                    <button
                      key={net.id}
                      onClick={() => handleSelectNetwork(net)}
                      data-testid={`dropdown-net-${net.id}`}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                        selectedNetwork.id === net.id
                          ? "bg-primary/10 text-foreground font-bold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${net.dotClass}`} />
                      <span className="flex-1 text-left font-mono">{net.name}</span>
                      <div className="flex items-center gap-1">
                        {net.isTestnet ? (
                          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-[8px] uppercase px-1 py-0">
                            TEST
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[8px] uppercase px-1 py-0">
                            LIVE
                          </Badge>
                        )}
                        {selectedNetwork.id === net.id && (
                          <span className="text-primary text-[10px]">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {isMainnet && (
                    <div className="px-3 py-1.5 border-t border-border bg-red-500/5">
                      <p className="text-[9px] text-red-400/80 uppercase font-bold">⚠ Mainnet — реальные деньги</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Wallet status badge */}
            {connected ? (
              <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] uppercase font-bold">
                Connected
              </Badge>
            ) : (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] uppercase font-bold">
                <AlertCircle className="w-3 h-3 mr-1" />
                No Wallet
              </Badge>
            )}

            {/* Mismatch warning */}
            {networkMismatch && (
              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px] uppercase font-bold">
                Wallet ≠ Selected
              </Badge>
            )}

            {/* Explorer link */}
            <a
              href={selectedNetwork.blockExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-explorer"
              title={selectedNetwork.explorerName}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {section === "deploy" && (
            <Deploy
              walletConnected={connected}
              onAddTx={addTx}
              onUpdateTx={updateTx}
              selectedNetwork={selectedNetwork}
            />
          )}
          {section === "read" && (
            <ReadContract walletConnected={connected} selectedNetwork={selectedNetwork} />
          )}
          {section === "write" && (
            <WriteContract
              walletConnected={connected}
              onAddTx={addTx}
              onUpdateTx={updateTx}
              selectedNetwork={selectedNetwork}
            />
          )}
          {section === "quick" && (
            <QuickActions
              walletConnected={connected}
              onAddTx={addTx}
              onUpdateTx={updateTx}
              selectedNetwork={selectedNetwork}
            />
          )}
          {section === "history" && (
            <TxHistory txHistory={txHistory} onClear={() => setTxHistory([])} />
          )}
        </div>
      </main>
    </div>
  );
}
