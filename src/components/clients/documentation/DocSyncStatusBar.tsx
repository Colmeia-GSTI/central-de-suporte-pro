import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Server, Wifi, Loader2 } from "lucide-react";
import { useDocSync } from "@/hooks/useDocSync";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  clientId: string;
}

function formatSyncTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

export function DocSyncStatusBar({ clientId }: Props) {
  const navigate = useNavigate();
  const {
    syncingTrmm, syncingUnifi, syncingAll,
    trmmConfigured, unifiConfigured,
    lastTrmmSync, lastUnifiSync,
    syncAll,
  } = useDocSync(clientId);

  // Don't show if nothing is configured
  if (!trmmConfigured && !unifiConfigured) return null;

  const isSyncing = syncingTrmm || syncingUnifi || syncingAll;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
      {/* TRMM status */}
      <div className="flex items-center gap-1.5">
        <Server className="h-3.5 w-3.5" />
        <span className="font-medium">TRMM:</span>
        {trmmConfigured ? (
          lastTrmmSync ? (
            <span>
              {formatSyncTime(lastTrmmSync.synced_at)} · {lastTrmmSync.devices_synced} disp.
              {lastTrmmSync.status === "error" && (
                <Badge variant="destructive" className="ml-1 text-[10px] py-0">Erro</Badge>
              )}
            </span>
          ) : (
            <span>Nunca sincronizado</span>
          )
        ) : (
          <button
            type="button"
            className="text-primary hover:underline cursor-pointer"
            onClick={() => navigate("/settings?tab=mappings")}
          >
            Não mapeado — Configure em Operações → Mapeamentos
          </button>
        )}
      </div>

      <span className="text-muted-foreground/30">|</span>

      {/* UniFi status */}
      <div className="flex items-center gap-1.5">
        <Wifi className="h-3.5 w-3.5" />
        <span className="font-medium">UniFi:</span>
        {unifiConfigured ? (
          lastUnifiSync ? (
            <span>
              {formatSyncTime(lastUnifiSync.synced_at)} · {lastUnifiSync.devices_synced} itens
              {lastUnifiSync.status === "error" && (
                <Badge variant="destructive" className="ml-1 text-[10px] py-0">Erro</Badge>
              )}
            </span>
          ) : (
            <span>Nunca sincronizado</span>
          )
        ) : (
          <span className="text-muted-foreground/50">Não configurado</span>
        )}
      </div>

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={syncAll}
          disabled={isSyncing}
        >
          {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sincronizar tudo
        </Button>
      </div>
    </div>
  );
}
