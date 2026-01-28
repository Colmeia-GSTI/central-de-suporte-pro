import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, AlertTriangle, CheckCircle2, Settings, Zap, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRL } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface EmitNfseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices"> & { clients: { name: string } | null };
}

interface AsaasSettings {
  api_key: string;
  environment: "sandbox" | "production";
}

export function EmitNfseDialog({ open, onOpenChange, invoice }: EmitNfseDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [competenciaDate, setCompetenciaDate] = useState<Date>(() => {
    return new Date(invoice.due_date);
  });
  const [descricao, setDescricao] = useState("");

  // Check if Asaas integration is active
  const { data: asaasConfig, isLoading: isLoadingAsaas } = useQuery({
    queryKey: ["asaas-integration-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("id, settings, is_active")
        .eq("integration_type", "asaas")
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      return data.settings as unknown as AsaasSettings;
    },
  });

  // Fetch contract for this invoice if exists
  const { data: contract } = useQuery({
    queryKey: ["contract-for-invoice", invoice.contract_id],
    queryFn: async () => {
      if (!invoice.contract_id) return null;
      const { data, error } = await supabase
        .from("contracts")
        .select("*, nfse_service_codes(codigo_tributacao, cnae_principal, aliquota_sugerida)")
        .eq("id", invoice.contract_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!invoice.contract_id,
  });

  // Check company configuration
  const { data: companyConfig } = useQuery({
    queryKey: ["company-config-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, cnpj, inscricao_municipal, nfse_ambiente")
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  const isAsaasConfigured = !!asaasConfig?.api_key;

  const emitMutation = useMutation({
    mutationFn: async () => {
      if (!invoice.contract_id) {
        throw new Error("Fatura não possui contrato vinculado");
      }

      if (!isAsaasConfigured) {
        throw new Error("Integração Asaas não está configurada. Configure em Configurações → Integrações.");
      }

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit",
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          contract_id: invoice.contract_id,
          value: invoice.amount,
          service_description: descricao || contract?.nfse_descricao_customizada || contract?.description || `Prestação de serviços - ${contract?.name}`,
          municipal_service_code: contract?.nfse_service_code,
          effective_date: competencia + "-01",
          competencia,
          iss_rate: (contract as any)?.nfse_service_codes?.aliquota_sugerida || null,
          retain_iss: false,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao emitir NFS-e");
      return data;
    },
    onSuccess: (data) => {
      toast.success("NFS-e gerada com sucesso!", {
        description: `ID: ${data.invoice_id} | Correlation: ${data.correlation_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao emitir NFS-e", { description: error.message });
    },
  });

  const isConfigured = companyConfig?.cnpj && companyConfig?.inscricao_municipal;
  const hasContract = !!invoice.contract_id;
  const canEmit = isConfigured && hasContract && isAsaasConfigured;

  // Competência formatada para API (yyyy-MM)
  const competencia = format(competenciaDate, "yyyy-MM");

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate("/settings?tab=integrations");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Emitir NFS-e
          </DialogTitle>
          <DialogDescription>
            Gerar nota fiscal de serviço para a fatura #{invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Provedor:</span>
            <Badge variant="default" className="gap-1">
              <Zap className="h-3 w-3" />
              Asaas
            </Badge>
          </div>

          {/* Invoice Info */}
          <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Cliente</span>
              <span className="font-medium">{invoice.clients?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Valor</span>
              <span className="font-medium">{formatCurrencyBRL(invoice.amount)}</span>
            </div>
            {contract && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Contrato</span>
                <span className="font-medium">{contract.name}</span>
              </div>
            )}
          </div>

          {/* Alerts */}
          {!isAsaasConfigured && !isLoadingAsaas && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Integração Asaas não configurada. Configure para emitir NFS-e.</span>
                <Button variant="outline" size="sm" onClick={handleGoToSettings} className="ml-2">
                  <Settings className="h-4 w-4 mr-1" />
                  Configurar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!isConfigured && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Configure os dados da empresa (CNPJ, Inscrição Municipal) em Configurações → Empresa
                antes de emitir NFS-e.
              </AlertDescription>
            </Alert>
          )}

          {!hasContract && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Esta fatura não possui contrato vinculado. Vincule um contrato para emitir NFS-e.
              </AlertDescription>
            </Alert>
          )}

          {canEmit && (
            <>
              {/* Competência */}
              <div className="space-y-2">
                <Label>Competência</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !competenciaDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {competenciaDate ? format(competenciaDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={competenciaDate}
                      onSelect={(date) => date && setCompetenciaDate(date)}
                      initialFocus
                      locale={ptBR}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Descrição adicional */}
              <div className="space-y-2">
                <Label>Descrição do Serviço (opcional)</Label>
                <Textarea
                  placeholder="Descrição adicional para a NFS-e..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Se vazio, será usada a descrição padrão do contrato
                </p>
              </div>

              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Ambiente: <strong>
                    {asaasConfig?.environment === "production" ? "Produção" : "Sandbox"}
                  </strong>
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => emitMutation.mutate()}
            disabled={!canEmit || emitMutation.isPending}
          >
            {emitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Emitir NFS-e
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
