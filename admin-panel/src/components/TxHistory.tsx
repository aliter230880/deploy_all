import { Clock, ExternalLink, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { polygonscanTx } from "@/lib/contracts";
import type { TxRecord } from "@/pages/Dashboard";

interface TxHistoryProps {
  txHistory: TxRecord[];
  onClear: () => void;
}

export default function TxHistory({ txHistory, onClear }: TxHistoryProps) {
  return (
    <div className="space-y-4" data-testid="section-history">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Tx History</h2>
          <span className="text-[10px] text-muted-foreground">// Session transactions</span>
        </div>
        {txHistory.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            data-testid="button-clear-history"
            className="text-[10px] uppercase font-bold border-border text-muted-foreground hover:text-destructive hover:border-destructive h-7"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {txHistory.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground uppercase font-bold">No transactions yet</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Transactions from this session will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <div className="grid grid-cols-5 text-[10px] text-muted-foreground uppercase font-bold border-b border-border pb-2">
              <span>Time</span>
              <span>Contract</span>
              <span>Function</span>
              <span>Tx Hash</span>
              <span>Status</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {txHistory.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-5 items-center py-2.5 text-[11px] font-mono"
                  data-testid={`tx-row-${tx.id}`}
                >
                  <span className="text-muted-foreground">{tx.time}</span>
                  <span className="text-foreground font-bold truncate">{tx.contract}</span>
                  <span className="text-accent truncate">{tx.fn}</span>
                  <span>
                    {tx.txHash ? (
                      <a
                        href={polygonscanTx(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                        data-testid={`tx-link-${tx.id}`}
                      >
                        {tx.txHash.slice(0, 10)}...
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                  <span>
                    {tx.status === "pending" && (
                      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] uppercase">
                        <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" /> Pending
                      </Badge>
                    )}
                    {tx.status === "confirmed" && (
                      <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] uppercase">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Confirmed
                      </Badge>
                    )}
                    {tx.status === "failed" && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-[9px] uppercase">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Failed
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
