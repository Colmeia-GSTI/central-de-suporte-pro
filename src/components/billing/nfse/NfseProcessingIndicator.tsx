import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Loader2, RefreshCw, Info, CheckCircle2, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface NfseProcessingIndicatorProps {
  nfse: {
    id: string;
    asaas_invoice_id: string | null;
    asaas_status: string | null;
    created_at: string;
    data_emissao: string | null;
    ambiente: string | null;
    status: string;
  };
  onRefresh?: () => void;
  compact?: boolean;
}

// Estimativas de tempo por ambiente (minutos)
const ESTIMATED_TIMES = {
  sandbox: { min: 1, max: 5 },
  production: { min: 15, max: 60 },
};

// Mapeamento de status Asaas para descrição
export const ASAAS_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada para envio",
  SYNCHRONIZED: "Sincronizada com prefeitura",
  AUTHORIZATION_PENDING: "Aguardando autorização",
  AUTHORIZED: "Autorizada",
  ERROR: "Erro no processamento",
  CANCELED: "Cancelada",
  CANCELLATION_PENDING: "Cancelamento pendente",
  CANCELLATION_DENIED: "Cancelamento negado",
};

// Progresso estimado por status
const STATUS_PROGRESS: Record<string, number> = {
  SCHEDULED: 15,
  SYNCHRONIZED: 40,
  AUTHORIZATION_PENDING: 70,
  AUTHORIZED: 100,
  ERROR: 0,
  CANCELED: 0,
  CANCELLATION_PENDING: 85,
  CANCELLATION_DENIED: 75,
};

function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Agora mesmo";
  if (diffMins === 1) return "1 minuto";
  if (diffMins < 60) return `${diffMins} minutos`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hora";
  if (diffHours < 24) return `${diffHours} horas`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 dia";
  return `${diffDays} dias`;
}

function useCheckNfseStatus(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (nfseHistoryId: string) => {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "check_single_status",
          nfse_history_id: nfseHistoryId,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao verificar status");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      
      const statusLabel = ASAAS_STATUS_LABELS[data.invoice?.status] || data.invoice?.status;
      toast.success("Status atualizado", {
        description: `Status atual: ${statusLabel}`,
      });
      
      onSuccess?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao verificar status", { description: e.message });
    },
  });
}

export function NfseProcessingIndicator({ nfse, onRefresh, compact = false }: NfseProcessingIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(() => formatElapsedTime(nfse.created_at));
  const checkStatusMutation = useCheckNfseStatus(onRefresh);
  
  // Update elapsed time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(nfse.created_at));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [nfse.created_at]);
  
  const isProduction = nfse.ambiente === "producao";
  const estimatedTime = isProduction ? ESTIMATED_TIMES.production : ESTIMATED_TIMES.sandbox;
  const asaasStatus = nfse.asaas_status || "SCHEDULED";
  const progress = STATUS_PROGRESS[asaasStatus] ?? 20;
  const statusLabel = ASAAS_STATUS_LABELS[asaasStatus] || asaasStatus;
  
  const canCheck = !!nfse.asaas_invoice_id && nfse.status === "processando";
  
  const handleCheckStatus = () => {
    if (!canCheck) return;
    checkStatusMutation.mutate(nfse.id);
  };
  
  // Compact version for table cells
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span className="text-xs text-muted-foreground">{elapsedTime}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1.5">
              <p className="font-medium">{statusLabel}</p>
              <p className="text-xs text-muted-foreground">
                Tempo decorrido: {elapsedTime}
              </p>
              <p className="text-xs text-muted-foreground">
                Estimativa: {estimatedTime.min}-{estimatedTime.max} min ({isProduction ? "produção" : "sandbox"})
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  // Full version for details sheet
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h4 className="font-medium text-blue-900 dark:text-blue-100">
            Aguardando Autorização da Prefeitura
          </h4>
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {statusLabel}
        </Badge>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progresso estimado</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Tempo decorrido</p>
          <p className="font-medium flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {elapsedTime}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Estimativa</p>
          <p className="font-medium">
            {estimatedTime.min}-{estimatedTime.max} min
            <span className="text-xs text-muted-foreground ml-1">
              ({isProduction ? "produção" : "sandbox"})
            </span>
          </p>
        </div>
      </div>
      
      <Alert className="bg-transparent border-blue-200 dark:border-blue-800">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200 text-xs">
          A nota foi transmitida e está na fila de autorização da prefeitura. 
          O status é atualizado automaticamente via webhook, mas você pode verificar manualmente.
        </AlertDescription>
      </Alert>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleCheckStatus}
        disabled={!canCheck || checkStatusMutation.isPending}
        className="w-full"
      >
        {checkStatusMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Verificar Status Agora
      </Button>
    </div>
  );
}

// Compact status indicator for table cells
export function NfseProcessingStatusCell({ nfse }: { nfse: NfseProcessingIndicatorProps["nfse"] }) {
  const isProcessing = nfse.status === "processando";
  
  if (!isProcessing) {
    return null;
  }
  
  return <NfseProcessingIndicator nfse={nfse} compact />;
}
