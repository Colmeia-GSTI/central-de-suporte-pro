import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileCode,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";
import { buildNfseValidation, normalizeCompetencia, type ValidationIssue } from "./nfseValidation";
import { formatCompetenciaLabel, formatDateTime, providerLabel, statusLabel, asaasStatusLabel, type NfseStatus } from "./nfseFormat";
import { NfseEventLogsDialog } from "./NfseEventLogsDialog";
import { NfseProcessingIndicator } from "./NfseProcessingIndicator";

export type NfseWithRelations = Tables<"nfse_history"> & {
  clients: {
    name: string;
    document: string | null;
    address?: string | null;
    email?: string | null;
  } | null;
  contracts: { name: string } | null;
};

function statusBadgeVariant(status: NfseStatus): { className: string; icon: React.ReactNode } {
  switch (status) {
    case "autorizada":
      return { className: "bg-status-success text-white", icon: <CheckCircle2 className="h-3 w-3" /> };
    case "processando":
      return { className: "bg-blue-600 text-white", icon: <RefreshCw className="h-3 w-3 animate-spin" /> };
    case "pendente":
      return { className: "bg-status-warning text-white", icon: <AlertTriangle className="h-3 w-3" /> };
    case "rejeitada":
      return { className: "bg-status-danger text-white", icon: <XCircle className="h-3 w-3" /> };
    case "erro":
      return { className: "bg-red-700 text-white", icon: <XCircle className="h-3 w-3" /> };
    case "cancelada":
      return { className: "bg-muted text-muted-foreground", icon: <XCircle className="h-3 w-3" /> };
    case "substituida":
      return { className: "bg-orange-600 text-white", icon: <AlertTriangle className="h-3 w-3" /> };
    default:
      return { className: "bg-muted text-muted-foreground", icon: <AlertTriangle className="h-3 w-3" /> };
  }
}

async function openUrlOrSigned(url: string) {
  if (url.startsWith("nfse-files/")) {
    const path = url.replace("nfse-files/", "");
    const { data, error } = await supabase.storage.from("nfse-files").createSignedUrl(path, 60);
    if (error) throw error;
    window.open(data.signedUrl, "_blank");
    return;
  }
  window.open(url, "_blank");
}

function IssuesList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Badge variant={errors.length === 0 ? "secondary" : "destructive"}>{errors.length} erro(s)</Badge>
        <Badge variant="secondary">{warnings.length} aviso(s)</Badge>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">Erros (impedem o envio)</p>
          <ul className="mt-2 space-y-1 text-sm">
            {errors.map((e) => (
              <li key={e.code} className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <span>
                  {e.message} <span className="text-xs text-muted-foreground">[{e.code}]</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-50 p-3 dark:bg-yellow-950/30">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Avisos</p>
          <ul className="mt-2 space-y-1 text-sm text-yellow-900 dark:text-yellow-200">
            {warnings.map((w) => (
              <li key={w.code} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  {w.message} <span className="text-xs opacity-70">[{w.code}]</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function NfseDetailsSheet(props: {
  nfse: NfseWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const nfse = props.nfse;

  const [editOpen, setEditOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cancelAndDeleteConfirmOpen, setCancelAndDeleteConfirmOpen] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const [valor, setValor] = useState<number>(nfse?.valor_servico ?? 0);
  const [competencia, setCompetencia] = useState<string>(normalizeCompetencia(nfse?.competencia));
  const [descricao, setDescricao] = useState<string>(nfse?.descricao_servico ?? "");

  const canEdit = nfse ? ["pendente", "rejeitada", "erro"].includes(nfse.status) : false;
  const canResend = canEdit;
  const canCancel = nfse ? nfse.status === "autorizada" && !!nfse.asaas_invoice_id : false;
  const canDelete = nfse ? ["pendente", "erro", "rejeitada", "processando", "cancelada"].includes(nfse.status) : false;
  const canAbortProcessing = nfse ? nfse.status === "processando" : false;

  // Sincronizar estados quando a prop nfse mudar
  useEffect(() => {
    if (nfse) {
      setValor(nfse.valor_servico ?? 0);
      setCompetencia(normalizeCompetencia(nfse.competencia));
      setDescricao(nfse.descricao_servico ?? "");
    }
  }, [nfse?.id, nfse?.valor_servico, nfse?.competencia, nfse?.descricao_servico]);

  const { data: clientForValidation } = useQuery({
    queryKey: ["nfse-client-validation", nfse?.client_id],
    queryFn: async () => {
      if (!nfse?.client_id) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("name, document, address, email, zip_code")
        .eq("id", nfse.client_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!nfse?.client_id,
    staleTime: 0, // Sempre buscar dados frescos para validação
  });

  const { data: companyForValidation } = useQuery({
    queryKey: ["nfse-company-validation"],
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

  const validation = useMemo(() => {
    if (!nfse) return null;
    return buildNfseValidation({
      valor_servico: valor,
      competencia,
      descricao_servico: descricao,
      codigo_tributacao: nfse.codigo_tributacao,
      cnae: nfse.cnae,
      aliquota: nfse.aliquota,
      client: clientForValidation,
      company: companyForValidation,
    });
  }, [nfse, valor, competencia, descricao, clientForValidation, companyForValidation]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      const comp = normalizeCompetencia(competencia);
      // O banco espera tipo date (YYYY-MM-DD), então adicionamos o dia 01
      const compAsDate = comp ? `${comp}-01` : null;
      const { error } = await supabase
        .from("nfse_history")
        .update({
          valor_servico: valor,
          descricao_servico: descricao,
          competencia: compAsDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nfse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("NFS-e atualizada");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setEditOpen(false);
      props.onChanged?.();
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      
      // 1. Salvar alterações locais primeiro (se foram editadas)
      const comp = normalizeCompetencia(competencia);
      const compAsDate = comp ? `${comp}-01` : null;
      
      const { error: updateError } = await supabase
        .from("nfse_history")
        .update({
          valor_servico: valor,
          descricao_servico: descricao,
          competencia: compAsDate,
          status: "processando",
          mensagem_retorno: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nfse.id);
      
      if (updateError) throw updateError;
      
      // 2. Chamar edge function para reemitir no Asaas
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit",
          client_id: nfse.client_id,
          value: valor,
          service_description: descricao,
          municipal_service_code: nfse.codigo_tributacao || "010701",
          nfse_history_id: nfse.id,
          competencia: comp,
          // Tributos (caso existam no registro)
          retain_iss: nfse.iss_retido,
          iss_rate: nfse.aliquota,
          pis_value: nfse.valor_pis,
          cofins_value: nfse.valor_cofins,
          csll_value: nfse.valor_csll,
          irrf_value: nfse.valor_irrf,
          inss_value: nfse.valor_inss,
          valor_liquido: nfse.valor_liquido,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao reemitir NFS-e");
      return data;
    },
    onSuccess: (data) => {
      toast.success("NFS-e reenviada para processamento", {
        description: `ID: ${data.invoice_id || data.history_id || "Aguardando..."}`,
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setValidationOpen(false);
      props.onChanged?.();
    },
    onError: (e: Error) => toast.error("Erro ao reenviar", { description: e.message }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      const { error } = await supabase
        .from("nfse_history")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === "autorizada" ? { data_autorizacao: new Date().toISOString() } : {}),
        })
        .eq("id", nfse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      setStatusOpen(false);
      props.onChanged?.();
    },
    onError: (e: Error) => toast.error("Erro ao atualizar status", { description: e.message }),
  });

  // Cancel mutation (via Asaas) - now with mandatory reason
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      if (!nfse.asaas_invoice_id) throw new Error("NFS-e não possui ID no Asaas");
      if (!motivoCancelamento.trim()) throw new Error("Motivo do cancelamento é obrigatório");
      
      // 1. Salvar o motivo do cancelamento localmente
      const { error: updateError } = await supabase
        .from("nfse_history")
        .update({
          motivo_cancelamento: motivoCancelamento.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", nfse.id);
      
      if (updateError) throw updateError;
      
      // 2. Chamar API para cancelar no Asaas
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "cancel",
          invoice_id: nfse.asaas_invoice_id,
          nfse_history_id: nfse.id,
          motivo: motivoCancelamento.trim(),
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
      setCancelConfirmOpen(false);
      setMotivoCancelamento("");
      props.onChanged?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao cancelar NFS-e", { description: e.message });
      setCancelConfirmOpen(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      
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
      setDeleteConfirmOpen(false);
      props.onOpenChange(false);
      props.onChanged?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao excluir registro", { description: e.message });
      setDeleteConfirmOpen(false);
    },
  });

  // Cancel and Delete mutation
  const cancelAndDeleteMutation = useMutation({
    mutationFn: async () => {
      if (!nfse) throw new Error("NFS-e não selecionada");
      if (!nfse.asaas_invoice_id) throw new Error("NFS-e não possui ID no Asaas");
      
      // First cancel
      const { data: cancelData, error: cancelError } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "cancel",
          invoice_id: nfse.asaas_invoice_id,
          nfse_history_id: nfse.id,
        },
      });
      
      if (cancelError) throw cancelError;
      if (!cancelData.success) throw new Error(cancelData.error || "Erro ao cancelar NFS-e");
      
      // Then delete
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
      setCancelAndDeleteConfirmOpen(false);
      props.onOpenChange(false);
      props.onChanged?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao cancelar e excluir", { description: e.message });
      setCancelAndDeleteConfirmOpen(false);
    },
  });

  if (!nfse) return null;

  const s = nfse.status as NfseStatus;
  const badge = statusBadgeVariant(s);

  return (
    <>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between gap-4">
              <span className="font-mono">NFS-e {nfse.numero_nfse || "-"}</span>
              <Badge className={badge.className}>
                {badge.icon}
                <span className="ml-1">{statusLabel(s)}</span>
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Cliente: <strong>{nfse.clients?.name || "-"}</strong> • Competência: <strong>{formatCompetenciaLabel(nfse.competencia)}</strong>
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            <NfseEventLogsDialog
              nfseHistoryId={nfse.id}
              nfseNumber={nfse.numero_nfse}
              trigger={
                <Button variant="outline">
                  <History className="h-4 w-4 mr-2" />
                  Ver logs
                </Button>
              }
            />
            <Button
              variant="outline"
              onClick={async () => {
                if (!nfse.xml_url) return toast.error("XML não disponível");
                try {
                  await openUrlOrSigned(nfse.xml_url);
                } catch (e: unknown) {
                  toast.error("Erro ao abrir XML", { description: getErrorMessage(e) });
                }
              }}
              disabled={!nfse.xml_url}
            >
              <FileCode className="h-4 w-4 mr-2" />
              XML
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!nfse.pdf_url) return toast.error("PDF não disponível");
                try {
                  await openUrlOrSigned(nfse.pdf_url);
                } catch (e: unknown) {
                  toast.error("Erro ao abrir PDF", { description: getErrorMessage(e) });
                }
              }}
              disabled={!nfse.pdf_url}
            >
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!nfse.danfse_url) return toast.error("DANFSe não disponível");
                try {
                  await openUrlOrSigned(nfse.danfse_url);
                } catch (e: unknown) {
                  toast.error("Erro ao abrir DANFSe", { description: getErrorMessage(e) });
                }
              }}
              disabled={!nfse.danfse_url}
            >
              <FileText className="h-4 w-4 mr-2" />
              DANFSe
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!canEdit}>
              Editar
            </Button>
            <Button onClick={() => setValidationOpen(true)} disabled={!canResend}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validar e reenviar
            </Button>
            <Button variant="outline" onClick={() => setStatusOpen(true)}>
              Alterar status
            </Button>
            {canAbortProcessing && (
              <Button
                variant="outline"
                className="text-orange-600 border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                onClick={() => updateStatusMutation.mutate("pendente")}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Cancelar processamento
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => setCancelConfirmOpen(true)}
              >
                <Ban className="h-4 w-4 mr-2" />
                Cancelar NFS-e
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => setCancelAndDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Cancelar e Excluir
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Registro
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          {/* Processing Indicator */}
          {nfse.status === "processando" && (
            <NfseProcessingIndicator
              nfse={{
                id: nfse.id,
                asaas_invoice_id: nfse.asaas_invoice_id,
                asaas_status: nfse.asaas_status,
                created_at: nfse.created_at,
                data_emissao: nfse.data_emissao,
                ambiente: nfse.ambiente,
                status: nfse.status,
              }}
              onRefresh={() => props.onChanged?.()}
            />
          )}

          <ScrollArea className="h-[52vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Valor</p>
                  <p className="font-medium">{formatCurrencyBRL(nfse.valor_servico)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ISS</p>
                  <p className="font-medium">{formatCurrencyBRL(nfse.valor_iss)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Emissão</p>
                  <p className="font-medium">{formatDateTime(nfse.data_emissao)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Autorização</p>
                  <p className="font-medium">{formatDateTime(nfse.data_autorizacao)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Provedor</p>
                  <p className="font-medium">{providerLabel(nfse.provider)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Código tributação</p>
                  <p className="font-mono">{nfse.codigo_tributacao || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">CNAE</p>
                  <p className="font-mono">{nfse.cnae || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Alíquota</p>
                  <p className="font-medium">{nfse.aliquota !== null && nfse.aliquota !== undefined ? `${nfse.aliquota}%` : "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ambiente</p>
                  <p className="font-medium">{nfse.ambiente || "-"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Descrição</p>
                <div className="mt-1 rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {nfse.descricao_servico || "-"}
                </div>
              </div>

              {nfse.mensagem_retorno && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Mensagem de retorno</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">{nfse.mensagem_retorno}</pre>
                  </AlertDescription>
                </Alert>
              )}

              {nfse.chave_acesso && (
                <div>
                  <p className="text-sm text-muted-foreground">Chave de acesso</p>
                  <p className="mt-1 font-mono text-sm break-all">{nfse.chave_acesso}</p>
                </div>
              )}

              {nfse.codigo_verificacao && (
                <div>
                  <p className="text-sm text-muted-foreground">Código de verificação</p>
                  <p className="mt-1 font-mono text-sm break-all">{nfse.codigo_verificacao}</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Fechar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open) {
            setValor(nfse.valor_servico);
            setCompetencia(normalizeCompetencia(nfse.competencia));
            setDescricao(nfse.descricao_servico || "");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar NFS-e</DialogTitle>
            <DialogDescription>Permitido apenas para notas não autorizadas.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor do serviço</Label>
              <CurrencyInput value={valor} onChange={setValor} />
            </div>

            <div className="space-y-2">
              <Label>Competência (AAAA-MM)</Label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                placeholder="2026-01"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição do serviço</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A competência é armazenada como <strong>AAAA-MM</strong> (sem dia). Isso melhora filtros e relatórios.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation */}
      <Dialog open={validationOpen} onOpenChange={setValidationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validation?.isValid ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className="h-5 w-5 text-red-600" />}
              Validação antes do envio
            </DialogTitle>
            <DialogDescription>
              Esta validação é preventiva (front-end). O portal oficial ainda pode rejeitar por regras específicas.
            </DialogDescription>
          </DialogHeader>

          {!validation ? null : (
            <>
              <IssuesList issues={validation.issues} />

              {validation.isValid && validation.issues.filter((i) => i.level === "warning").length === 0 && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
                  <CheckCircle2 className="h-4 w-4 text-green-700" />
                  <AlertDescription className="text-green-900 dark:text-green-200">
                    Tudo certo. Você pode reenviar para processamento.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationOpen(false)}>
              Fechar
            </Button>
            <Button onClick={() => resendMutation.mutate()} disabled={!validation?.isValid || resendMutation.isPending}>
              {resendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Reenviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar status manualmente</DialogTitle>
            <DialogDescription>Use apenas após conferir no portal oficial.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
              <AlertTriangle className="h-4 w-4 text-yellow-700" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-200">
                Alterar status não substitui a autorização oficial. Serve para ajuste operacional.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2">
              {(["pendente", "processando", "autorizada", "rejeitada", "erro", "cancelada"] as const).map((st) => (
                <Button
                  key={st}
                  variant="outline"
                  className="justify-start"
                  disabled={updateStatusMutation.isPending || nfse.status === st}
                  onClick={() => updateStatusMutation.mutate(st)}
                >
                  {st === "autorizada" ? (
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                  ) : st === "processando" ? (
                    <RefreshCw className="h-4 w-4 mr-2 text-blue-600" />
                  ) : st === "pendente" ? (
                    <AlertTriangle className="h-4 w-4 mr-2 text-yellow-700" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2 text-red-600" />
                  )}
                  {statusLabel(st)}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation with Mandatory Reason */}
      <Dialog open={cancelConfirmOpen} onOpenChange={(open) => {
        setCancelConfirmOpen(open);
        if (!open) setMotivoCancelamento("");
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Cancelar NFS-e?
            </DialogTitle>
            <DialogDescription>
              Esta ação irá solicitar o cancelamento da NFS-e {nfse.numero_nfse ? `#${nfse.numero_nfse}` : ""} no Asaas.
              O cancelamento será processado e o status atualizado automaticamente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
              <AlertTriangle className="h-4 w-4 text-yellow-700" />
              <AlertDescription className="text-yellow-900 dark:text-yellow-200">
                O motivo do cancelamento é obrigatório para fins de auditoria e conformidade fiscal.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="motivo-cancelamento">Motivo do Cancelamento *</Label>
              <Textarea
                id="motivo-cancelamento"
                placeholder="Ex: Erro na descrição do serviço, cliente solicitou cancelamento, nota emitida em duplicidade..."
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                rows={3}
                className={!motivoCancelamento.trim() && cancelMutation.isPending ? "border-destructive" : ""}
              />
              {!motivoCancelamento.trim() && (
                <p className="text-xs text-muted-foreground">
                  Informe o motivo pelo qual esta nota está sendo cancelada.
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCancelConfirmOpen(false);
              setMotivoCancelamento("");
            }}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || !motivoCancelamento.trim()}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir Registro?
            </DialogTitle>
            <DialogDescription>
              Esta ação irá remover permanentemente o registro da NFS-e do sistema.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel and Delete Confirmation */}
      <Dialog open={cancelAndDeleteConfirmOpen} onOpenChange={setCancelAndDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Cancelar e Excluir NFS-e?
            </DialogTitle>
            <DialogDescription>
              Esta ação irá:
              <br />1) Solicitar o cancelamento da NFS-e {nfse.numero_nfse ? `#${nfse.numero_nfse}` : ""} no Asaas
              <br />2) Excluir permanentemente o registro do sistema
              <br /><br />
              <strong>Esta ação não pode ser desfeita.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelAndDeleteConfirmOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelAndDeleteMutation.mutate()}
              disabled={cancelAndDeleteMutation.isPending}
            >
              {cancelAndDeleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancelar e Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}