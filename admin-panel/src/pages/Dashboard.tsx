import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Rocket,
  BookOpen,
  PenLine,
  Zap,
  Clock,
  LogOut,
  Wifi,
  WifiOff,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getProvider, formatAddress, POLYGON_CHAIN_ID } from "@/lib/contracts";
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

export default function Dashboard() {
  const [section, setSection] = useState<Section>("deploy");
  const [wallet, setWallet] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    connectWallet();
  }, []);

  async function connectWallet() {
    try {
      const provider = await getProvider();
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const net = await provider.getNetwork();
      setWallet(address);
      setNetwork(net.chainId === POLYGON_CHAIN_ID ? "Polygon Mainnet" : `Chain ${net.chainId}`);
      setConnected(true);
    } catch (e: any) {
      setConnected(false);
      toast({ title: "Wallet Error", description: e.message, variant: "destructive" });
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

        {/* Wallet status */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-3 h-3 text-primary" />
            ) : (
              <WifiOff className="w-3 h-3 text-destructive" />
            )}
            <span className="text-[10px] text-muted-foreground uppercase font-bold">
              {connected ? network : "Disconnected"}
            </span>
          </div>
          {wallet && (
            <div className="text-[10px] text-primary font-mono">
              {formatAddress(wallet)}
            </div>
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
            <span className="text-[10px] text-muted-foreground font-mono">// POLYGON MAINNET</span>
          </div>
          <div className="flex items-center gap-3">
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
            {network && network !== "Polygon Mainnet" && (
              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px] uppercase font-bold">
                Wrong Network
              </Badge>
            )}
            <a
              href="https://polygonscan.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-polygonscan"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {section === "deploy" && (
            <Deploy walletConnected={connected} onAddTx={addTx} onUpdateTx={updateTx} />
          )}
          {section === "read" && (
            <ReadContract walletConnected={connected} />
          )}
          {section === "write" && (
            <WriteContract walletConnected={connected} onAddTx={addTx} onUpdateTx={updateTx} />
          )}
          {section === "quick" && (
            <QuickActions walletConnected={connected} onAddTx={addTx} onUpdateTx={updateTx} />
          )}
          {section === "history" && (
            <TxHistory txHistory={txHistory} onClear={() => setTxHistory([])} />
          )}
        </div>
      </main>
    </div>
  );
}
