import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  MoreHorizontal,
  Pencil,
  RefreshCw,
  FileWarning,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateNfseData, type NfseValidationResult } from "@/lib/nfse-validation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NfseServiceCodeCombobox, type NfseServiceCode } from "@/components/billing/nfse/NfseServiceCodeCombobox";
import { NfseTributacaoSection, type TributacaoData } from "@/components/billing/nfse/NfseTributacaoSection";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NfseRecord {
  id: string;
  numero_nfse: string | null;
  protocolo?: string | null;
  status: string;
  valor_servico: number;
  competencia: string | null;
  descricao_servico: string | null;
  mensagem_retorno: string | null;
  codigo_tributacao: string | null;
  cnae: string | null;
  aliquota: number | null;
  iss_retido?: boolean | null;
  valor_pis?: number | null;
  valor_cofins?: number | null;
  valor_csll?: number | null;
  valor_irrf?: number | null;
  valor_inss?: number | null;
  client_id: string | null;
  contract_id: string | null;
  created_at: string;
  updated_at: string | null;
  asaas_invoice_id?: string | null;
}

interface NfseActionsMenuProps {
  nfse: NfseRecord;
  onRefresh: () => void;
}

const parseCompetencia = (competencia: string | null): string => {
  if (!competencia) return format(new Date(), "yyyy-MM");
  if (competencia.length === 10) return competencia.slice(0, 7);
  return competencia;
};

export function NfseActionsMenu({ nfse, onRefresh }: NfseActionsMenuProps) {
  const queryClient = useQueryClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCancelAndDeleteConfirmOpen, setIsCancelAndDeleteConfirmOpen] = useState(false);
  const [isAbortProcessingConfirmOpen, setIsAbortProcessingConfirmOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<NfseValidationResult | null>(null);
  
  // Edit form state
  const [valor, setValor] = useState(nfse.valor_servico);
  const [descricao, setDescricao] = useState(nfse.descricao_servico || "");
  const [competencia, setCompetencia] = useState(parseCompetencia(nfse.competencia));
  const [codigoTributacao, setCodigoTributacao] = useState(nfse.codigo_tributacao || "");
  const [cnae, setCnae] = useState(nfse.cnae || "");
  const [tributacao, setTributacao] = useState<TributacaoData>({
    issRetido: nfse.iss_retido ?? false,
    aliquotaIss: Number(nfse.aliquota) || 0,
    valorPis: Number(nfse.valor_pis) || 0,
    valorCofins: Number(nfse.valor_cofins) || 0,
    valorCsll: Number(nfse.valor_csll) || 0,
    valorIrrf: Number(nfse.valor_irrf) || 0,
    valorInss: Number(nfse.valor_inss) || 0,
  });

  const canEdit = ["pendente", "rejeitada", "erro"].includes(nfse.status);
  const canResend = ["pendente", "rejeitada", "erro"].includes(nfse.status);
  const canCancel = nfse.status === "autorizada" && !!nfse.asaas_invoice_id;
  const canCancelAndDelete = nfse.status === "autorizada" && !!nfse.asaas_invoice_id;
  const canDelete = ["pendente", "erro", "rejeitada", "processando", "cancelada"].includes(nfse.status);
  const canAbortProcessing = nfse.status === "processando";
  const hasError = ["rejeitada", "erro"].includes(nfse.status);

  // Fetch client data for validation
  const { data: clientData } = useQuery({
    queryKey: ["client-for-validation", nfse.client_id],
    queryFn: async () => {
      if (!nfse.client_id) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("name, document, address, city, state, zip_code, email")
        .eq("id", nfse.client_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!nfse.client_id,
  });

  // Fetch company data for validation
  const { data: companyData } = useQuery({
    queryKey: ["company-for-validation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("cnpj, inscricao_municipal, endereco_codigo_ibge")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Generate competencia options
  const competenciaOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const value = format(date, "yyyy-MM");
    const label = format(date, "MMMM yyyy", { locale: ptBR });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  // Validate before resend
  const handleValidateAndResend = () => {
    const result = validateNfseData(
      {
        valor_servico: nfse.valor_servico,
        competencia: nfse.competencia,
        descricao_servico: nfse.descricao_servico,
        codigo_tributacao: nfse.codigo_tributacao,
        cnae: nfse.cnae,
        aliquota: nfse.aliquota,
        client_id: nfse.client_id,
      },
      clientData,
      companyData
    );
    
    setValidationResult(result);
    
    if (result.isValid) {
      if (result.warnings.length > 0) {
        setIsValidationOpen(true);
      } else {
        resendMutation.mutate();
      }
    } else {
      setIsValidationOpen(true);
    }
  };

  const handleProceedAfterValidation = () => {
    setIsValidationOpen(false);
    resendMutation.mutate();
  };

  // Update mutation - saves ALL fiscal fields
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("nfse_history")
        .update({
          valor_servico: valor,
          descricao_servico: descricao,
          competencia: competencia + "-01",
          codigo_tributacao: codigoTributacao || null,
          cnae: cnae || null,
          aliquota: tributacao.aliquotaIss,
          iss_retido: tributacao.issRetido,
          valor_pis: tributacao.valorPis,
          valor_cofins: tributacao.valorCofins,
          valor_csll: tributacao.valorCsll,
          valor_irrf: tributacao.valorIrrf,
          valor_inss: tributacao.valorInss,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nfse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("NFS-e atualizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      setIsEditOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar", { description: error.message });
    },
  });

  // Resend mutation - uses EDITED values
  const resendMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit",
          client_id: nfse.client_id,
          value: valor,
          service_description: descricao,
          nfse_history_id: nfse.id,
          contract_id: nfse.contract_id || undefined,
          competencia: competencia,
          municipal_service_code: codigoTributacao || nfse.codigo_tributacao || undefined,
          retain_iss: tributacao.issRetido,
          iss_rate: tributacao.aliquotaIss,
          pis_value: tributacao.valorPis,
          cofins_value: tributacao.valorCofins,
          csll_value: tributacao.valorCsll,
          irrf_value: tributacao.valorIrrf,
          inss_value: tributacao.valorInss,
        },
      });
      
      if (error) {
        // For FunctionsHttpError (409, etc.), try to extract the JSON body
        if (error.context?.body) {
          try {
            const reader = error.context.body.getReader?.();
            if (reader) {
              const { value } = await reader.read();
              const text = new TextDecoder().decode(value);
              const parsed = JSON.parse(text);
              throw new Error(parsed.error || error.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== error.message) {
              throw parseErr;
            }
          }
        }
        // Fallback: check if data was returned despite error flag
        if (data && typeof data === "object" && "error" in data) {
          throw new Error(String(data.error));
        }
        throw new Error(String(error.message || error));
      }
      if (!data.success) throw new Error(data.error || "Erro ao reenviar NFS-e");
      return data;
    },
    onSuccess: (data) => {
      toast.success("NFS-e reenviada para processamento", {
        description: `ID: ${data.invoice_id || data.history_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onRefresh();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      
      // Detect E0014 - DPS Duplicada: offer cancel and re-emit
      if (msg.includes("E0014") || msg.includes("DPS_DUPLICADA") || msg.includes("Vincular Nota")) {
        toast.error("Nota com erro E0014 (DPS duplicada)", {
          description: "Clique em 'Cancelar e Reemitir' no painel de erros, ou use 'Vincular Nota Existente' se a nota já existe.",
          duration: 10000,
        });
      } else {
        toast.error("Erro ao reenviar", { description: msg });
      }
    },
  });

  // Cancel mutation (via Asaas)
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!nfse.asaas_invoice_id) {
        throw new Error("NFS-e não possui ID no Asaas");
      }
      
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "cancel",
          invoice_id: nfse.asaas_invoice_id,
          nfse_history_id: nfse.id,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao cancelar NFS-e");
      return data;
    },
    onSuccess: () => {
      toast.success("NFS-e cancelada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setIsCancelConfirmOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao cancelar NFS-e", { description: error.message });
      setIsCancelConfirmOpen(false);
    },
  });

  // Delete mutation (via Asaas)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "delete_record",
          nfse_history_id: nfse.id,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao excluir registro");
      return data;
    },
    onSuccess: () => {
      toast.success("Registro excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setIsDeleteConfirmOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir registro", { description: error.message });
      setIsDeleteConfirmOpen(false);
    },
  });

  // Cancel and Delete mutation (for authorized notes - cancel in Asaas then delete locally)
  const cancelAndDeleteMutation = useMutation({
    mutationFn: async () => {
      if (!nfse.asaas_invoice_id) {
        throw new Error("NFS-e não possui ID no Asaas");
      }
      
      // First cancel in Asaas
      const { data: cancelData, error: cancelError } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "cancel",
          invoice_id: nfse.asaas_invoice_id,
          nfse_history_id: nfse.id,
        },
      });
      
      if (cancelError) throw cancelError;
      if (!cancelData.success) throw new Error(cancelData.error || "Erro ao cancelar NFS-e");
      
      // Then delete the record
      const { data: deleteData, error: deleteError } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "delete_record",
          nfse_history_id: nfse.id,
          force: true,
        },
      });
      
      if (deleteError) throw deleteError;
      if (!deleteData.success) throw new Error(deleteData.error || "Erro ao excluir registro");
      
      return deleteData;
    },
    onSuccess: () => {
      toast.success("NFS-e cancelada e registro excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setIsCancelAndDeleteConfirmOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao cancelar e excluir", { description: error.message });
      setIsCancelAndDeleteConfirmOpen(false);
    },
  });

  // Abort processing mutation (revert to pendente)
  const abortProcessingMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("nfse_history")
        .update({
          status: "pendente",
          updated_at: new Date().toISOString(),
        })
        .eq("id", nfse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Processamento cancelado - NFS-e voltou para pendente");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setIsAbortProcessingConfirmOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao cancelar processamento", { description: error.message });
      setIsAbortProcessingConfirmOpen(false);
    },
  });

  // Manual status update
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("nfse_history")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === "autorizada" ? { data_autorizacao: new Date().toISOString() } : {}),
          ...(newStatus === "cancelada" ? { data_cancelamento: new Date().toISOString() } : {}),
        })
        .eq("id", nfse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setIsStatusOpen(false);
      onRefresh();
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar status", { description: error.message });
    },
  });

  const handleOpenEdit = () => {
    setValor(nfse.valor_servico);
    setDescricao(nfse.descricao_servico || "");
    setCompetencia(parseCompetencia(nfse.competencia));
    setCodigoTributacao(nfse.codigo_tributacao || "");
    setCnae(nfse.cnae || "");
    setTributacao({
      issRetido: nfse.iss_retido ?? false,
      aliquotaIss: Number(nfse.aliquota) || 0,
      valorPis: Number(nfse.valor_pis) || 0,
      valorCofins: Number(nfse.valor_cofins) || 0,
      valorCsll: Number(nfse.valor_csll) || 0,
      valorIrrf: Number(nfse.valor_irrf) || 0,
      valorInss: Number(nfse.valor_inss) || 0,
    });
    setIsEditOpen(true);
    setIsMenuOpen(false);
  };

  return (
    <>
      <div className="relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-muted"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        
        {isMenuOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
              <div className="py-1">
                {canEdit && (
                  <button
                    onClick={handleOpenEdit}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                )}
                {canResend && (
                  <button
                    onClick={() => {
                      handleValidateAndResend();
                      setIsMenuOpen(false);
                    }}
                    disabled={resendMutation.isPending}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Validar e Reenviar
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsStatusOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Alterar Status
                </button>

                <div className="border-t border-border my-1" />

                {/* Abort processing - only for processing notes */}
                {canAbortProcessing && (
                  <button
                    onClick={() => {
                      setIsAbortProcessingConfirmOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-orange-600"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar Processamento
                  </button>
                )}

                {/* Cancel - only for authorized notes */}
                {canCancel && (
                  <button
                    onClick={() => {
                      setIsCancelConfirmOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-destructive"
                  >
                    <Ban className="h-4 w-4" />
                    Cancelar NFS-e
                  </button>
                )}

                {/* Cancel and Delete - only for authorized notes */}
                {canCancelAndDelete && (
                  <button
                    onClick={() => {
                      setIsCancelAndDeleteConfirmOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Cancelar e Excluir
                  </button>
                )}

                {/* Delete - only for pending/error/cancelled notes */}
                {canDelete && (
                  <button
                    onClick={() => {
                      setIsDeleteConfirmOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir Registro
                  </button>
                )}

                {hasError && (
                  <button
                    onClick={() => {
                      setIsLogOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-destructive"
                  >
                    <FileWarning className="h-4 w-4" />
                    Ver Log de Erro
                  </button>
                )}
                {!hasError && nfse.mensagem_retorno && (
                  <button
                    onClick={() => {
                      setIsLogOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <FileWarning className="h-4 w-4" />
                    Ver Mensagem
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={isCancelConfirmOpen}
        onOpenChange={setIsCancelConfirmOpen}
        title="Cancelar NFS-e?"
        description={`Esta ação irá solicitar o cancelamento da NFS-e ${nfse.numero_nfse ? `#${nfse.numero_nfse}` : ""} no Asaas. O cancelamento será processado e o status atualizado automaticamente.`}
        confirmLabel="Confirmar Cancelamento"
        variant="destructive"
        onConfirm={() => cancelMutation.mutate()}
        isLoading={cancelMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Excluir Registro?"
        description="Esta ação irá remover permanentemente o registro da NFS-e do sistema. Esta ação não pode ser desfeita."
        confirmLabel="Excluir Permanentemente"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />

      {/* Cancel and Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isCancelAndDeleteConfirmOpen}
        onOpenChange={setIsCancelAndDeleteConfirmOpen}
        title="Cancelar e Excluir NFS-e?"
        description={`Esta ação irá: 1) Solicitar o cancelamento da NFS-e ${nfse.numero_nfse ? `#${nfse.numero_nfse}` : ""} no Asaas; 2) Excluir permanentemente o registro do sistema após o cancelamento. Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar e Excluir"
        variant="destructive"
        onConfirm={() => cancelAndDeleteMutation.mutate()}
        isLoading={cancelAndDeleteMutation.isPending}
      />

      {/* Abort Processing Confirmation Dialog */}
      <ConfirmDialog
        open={isAbortProcessingConfirmOpen}
        onOpenChange={setIsAbortProcessingConfirmOpen}
        title="Cancelar Processamento?"
        description="Esta ação irá interromper o processamento atual e retornar a NFS-e para o status 'pendente'. Você poderá editar e reenviar posteriormente."
        confirmLabel="Cancelar Processamento"
        variant="default"
        onConfirm={() => abortProcessingMutation.mutate()}
        isLoading={abortProcessingMutation.isPending}
      />

      {/* Edit Dialog - Formulário Completo */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar NFS-e
            </DialogTitle>
            <DialogDescription>
              Corrija os dados fiscais antes de reenviar para processamento
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4">
              {/* Erro atual */}
              {nfse.mensagem_retorno && hasError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Erro atual:</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">{nfse.mensagem_retorno}</pre>
                  </AlertDescription>
                </Alert>
              )}

              {/* Dados básicos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor do Serviço</Label>
                  <CurrencyInput value={valor} onChange={setValor} />
                </div>
                <div className="space-y-2">
                  <Label>Competência</Label>
                  <Select value={competencia} onValueChange={setCompetencia}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {competenciaOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição do Serviço</Label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                />
              </div>

              <Separator />

              {/* Código de Serviço */}
              <div className="space-y-2">
                <Label>Código de Serviço (LC 116/2003)</Label>
                <NfseServiceCodeCombobox
                  value={codigoTributacao}
                  onChange={(code: NfseServiceCode | null) => {
                    if (code) {
                      setCodigoTributacao(code.codigo_tributacao);
                      if (code.cnae_principal) setCnae(code.cnae_principal);
                      if (code.aliquota_sugerida !== null && code.aliquota_sugerida !== undefined) {
                        setTributacao(prev => ({ ...prev, aliquotaIss: code.aliquota_sugerida! }));
                      }
                    } else {
                      setCodigoTributacao("");
                    }
                  }}
                />
              </div>

              {/* CNAE */}
              <div className="space-y-2">
                <Label>CNAE</Label>
                <Input
                  value={cnae}
                  onChange={(e) => setCnae(e.target.value)}
                  placeholder="Ex: 6202-3/00"
                />
              </div>

              {/* Tributação completa */}
              <NfseTributacaoSection
                valorServico={valor}
                aliquotaIss={tributacao.aliquotaIss}
                data={tributacao}
                onChange={setTributacao}
              />
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              {hasError ? "Log de Erro" : "Mensagem de Retorno"}
            </DialogTitle>
            <DialogDescription>
              Detalhes do processamento da NFS-e
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2 capitalize">{nfse.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Última Atualização:</span>
                <span className="ml-2">
                  {nfse.updated_at 
                    ? format(new Date(nfse.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "-"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <ScrollArea className="h-40 rounded border p-3 bg-muted/50">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {nfse.mensagem_retorno || "Nenhuma mensagem disponível"}
                </pre>
              </ScrollArea>
            </div>

            {hasError && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Corrija os dados e reenvie para processamento.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogOpen(false)}>
              Fechar
            </Button>
            {hasError && (
              <Button onClick={handleOpenEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar NFS-e
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Status Manualmente</DialogTitle>
            <DialogDescription>
              Use esta opção para atualizar o status quando verificar no portal externo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Use com cuidado. Altere o status apenas após confirmar no portal oficial.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => updateStatusMutation.mutate("pendente")}
                disabled={updateStatusMutation.isPending || nfse.status === "pendente"}
              >
                <RefreshCw className="h-4 w-4 mr-2 text-yellow-500" />
                Pendente
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => updateStatusMutation.mutate("processando")}
                disabled={updateStatusMutation.isPending || nfse.status === "processando"}
              >
                <RefreshCw className="h-4 w-4 mr-2 text-blue-500 animate-spin" />
                Processando
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => updateStatusMutation.mutate("autorizada")}
                disabled={updateStatusMutation.isPending || nfse.status === "autorizada"}
              >
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                Autorizada
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => updateStatusMutation.mutate("rejeitada")}
                disabled={updateStatusMutation.isPending || nfse.status === "rejeitada"}
              >
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
                Rejeitada
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => updateStatusMutation.mutate("erro")}
                disabled={updateStatusMutation.isPending || nfse.status === "erro"}
              >
                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                Erro
              </Button>
              <Button
                variant="outline"
                className="justify-start col-span-2"
                onClick={() => updateStatusMutation.mutate("cancelada")}
                disabled={updateStatusMutation.isPending || nfse.status === "cancelada"}
              >
                <XCircle className="h-4 w-4 mr-2 text-gray-500" />
                Cancelada
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Dialog */}
      <Dialog open={isValidationOpen} onOpenChange={setIsValidationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationResult?.isValid ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-500" />
              )}
              Validação dos Dados
            </DialogTitle>
            <DialogDescription>
              Resultado da validação dos dados antes do envio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-4">
              <Badge variant={validationResult?.errors.length === 0 ? "default" : "destructive"}>
                {validationResult?.errors.length || 0} erro(s)
              </Badge>
              <Badge variant="secondary">
                {validationResult?.warnings.length || 0} aviso(s)
              </Badge>
            </div>

            {validationResult?.errors && validationResult.errors.length > 0 && (
              <div className="space-y-2">
                <Label className="text-destructive">Erros (impedem o envio)</Label>
                <ScrollArea className="h-40 rounded border border-destructive/50 p-3 bg-destructive/10">
                  <div className="space-y-2">
                    {validationResult.errors.map((error, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">{error.message}</span>
                          <span className="text-xs text-muted-foreground ml-2">[{error.code}]</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {validationResult?.warnings && validationResult.warnings.length > 0 && (
              <div className="space-y-2">
                <Label className="text-yellow-600">Avisos (não impedem o envio)</Label>
                <ScrollArea className="h-32 rounded border border-yellow-500/50 p-3 bg-yellow-50 dark:bg-yellow-950/30">
                  <div className="space-y-2">
                    {validationResult.warnings.map((warning, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                        <span>{warning.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {validationResult?.isValid && validationResult.warnings.length === 0 && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-300">
                  Todos os dados estão válidos! A NFS-e pode ser enviada para processamento.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsValidationOpen(false)}>
              Cancelar
            </Button>
            {!validationResult?.isValid && (
              <Button variant="outline" onClick={handleOpenEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Corrigir Dados
              </Button>
            )}
            {validationResult?.isValid && (
              <Button 
                onClick={handleProceedAfterValidation}
                disabled={resendMutation.isPending}
              >
                {resendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Enviar para Processamento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
