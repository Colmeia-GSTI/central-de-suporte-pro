import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
  History,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

interface NfseEventLog {
  id: string;
  nfse_history_id: string;
  event_type: string;
  event_level: string;
  message: string;
  details: Record<string, unknown> | null;
  correlation_id: string | null;
  source: string | null;
  created_at: string;
}

// Map Asaas error codes to friendly messages
const ERROR_MESSAGES: Record<string, { message: string; solution: string }> = {
  invalid_fiscal_info: {
    message: "Dados fiscais incompletos ou inválidos",
    solution: "Acesse o painel Asaas → Minha Conta → Dados Fiscais e complete CNPJ, Inscrição Municipal e Regime Tributário.",
  },
  invalid_customer: {
    message: "CPF ou CNPJ do cliente inválido",
    solution: "Edite o cadastro do cliente e corrija o campo de documento (CPF/CNPJ).",
  },
  insufficient_balance: {
    message: "Saldo insuficiente na conta Asaas",
    solution: "Adicione créditos à sua conta Asaas para continuar emitindo notas.",
  },
  city_not_integrated: {
    message: "Sua cidade não está integrada ao Asaas",
    solution: "Entre em contato com o suporte do Asaas para verificar a disponibilidade.",
  },
  ASAAS_NOT_CONFIGURED: {
    message: "Integração Asaas não configurada",
    solution: "Configure a integração Asaas em Configurações → Integrações.",
  },
  CLIENT_NOT_FOUND: {
    message: "Cliente não encontrado",
    solution: "Verifique se o cliente existe e está ativo no sistema.",
  },
  ORPHAN_RECORD: {
    message: "NFS-e não foi criada no Asaas",
    solution: "Verifique os dados fiscais e tente emitir novamente.",
  },
};

function getEventIcon(type: string, level: string) {
  if (level === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  
  switch (type) {
    case "created":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "api_call":
      return <ArrowRight className="h-4 w-4 text-blue-600" />;
    case "api_response":
      return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
    case "webhook":
      return <RefreshCw className="h-4 w-4 text-purple-600" />;
    case "status_change":
      return <RefreshCw className="h-4 w-4 text-orange-600" />;
    case "file_download":
      return <FileSearch className="h-4 w-4 text-green-600" />;
    case "retry":
      return <RefreshCw className="h-4 w-4 text-blue-600" />;
    case "cancelled":
      return <XCircle className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function getLevelBadge(level: string) {
  switch (level) {
    case "error":
      return <Badge variant="destructive" className="text-xs">ERRO</Badge>;
    case "warn":
      return <Badge className="bg-yellow-500 text-white text-xs">AVISO</Badge>;
    case "debug":
      return <Badge variant="outline" className="text-xs">DEBUG</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">INFO</Badge>;
  }
}

function EventLogItem({ log }: { log: NfseEventLog }) {
  const [open, setOpen] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  
  // Check if this is a known error with solution
  const errorCode = log.details?.code as string || log.details?.error_code as string;
  const knownError = errorCode ? ERROR_MESSAGES[errorCode] : null;
  
  const formattedTime = format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });

  return (
    <div className="relative pl-6 pb-4 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[7px] top-6 bottom-0 w-0.5 bg-border last:hidden" />
      
      {/* Event dot */}
      <div className="absolute left-0 top-1 flex items-center justify-center w-4 h-4 rounded-full bg-background border-2 border-border">
        {getEventIcon(log.event_type, log.event_level)}
      </div>
      
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-2 mb-1">
          <CollapsibleTrigger asChild disabled={!hasDetails && !knownError}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 hover:bg-transparent"
              disabled={!hasDetails && !knownError}
            >
              {(hasDetails || knownError) ? (
                open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />
              ) : null}
              <span className="text-xs text-muted-foreground font-mono">{formattedTime}</span>
            </Button>
          </CollapsibleTrigger>
          {getLevelBadge(log.event_level)}
        </div>
        
        <p className="text-sm font-medium">{log.message}</p>
        
        {log.source && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Origem: {log.source}
            {log.correlation_id && ` • ID: ${log.correlation_id.slice(0, 20)}...`}
          </p>
        )}
        
        <CollapsibleContent className="mt-2 space-y-2">
          {knownError && (
            <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {knownError.message}
              </p>
              <p className="text-sm mt-1 text-amber-700 dark:text-amber-300">
                💡 <strong>Solução:</strong> {knownError.solution}
              </p>
            </div>
          )}
          
          {hasDetails && (
            <pre className="p-2 rounded-md bg-muted text-xs overflow-x-auto max-h-48">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface NfseEventLogsDialogProps {
  nfseHistoryId: string;
  nfseNumber?: string | null;
  trigger?: React.ReactNode;
}

export function NfseEventLogsDialog({ nfseHistoryId, nfseNumber, trigger }: NfseEventLogsDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["nfse-event-logs", nfseHistoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_event_logs")
        .select("id, event_type, event_level, message, correlation_id, source, details, created_at")
        .eq("nfse_history_id", nfseHistoryId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as NfseEventLog[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <History className="h-4 w-4 mr-2" />
            Logs
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Eventos
            {nfseNumber && <span className="text-muted-foreground font-mono">• NFS-e #{nfseNumber}</span>}
          </DialogTitle>
          <DialogDescription>
            Timeline detalhada de todas as ações e eventos relacionados a esta nota fiscal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        <ScrollArea className="h-[50vh] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum evento registrado para esta NFS-e.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Os eventos serão registrados automaticamente durante o processamento.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {logs.map((log) => (
                <EventLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
