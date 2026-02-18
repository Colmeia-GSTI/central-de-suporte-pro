import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import { FileText, Loader2, AlertTriangle, CheckCircle2, Settings, Zap, CalendarIcon, Building2, User, DollarSign, Hash, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRL } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

import { NfseTributacaoSection, type TributacaoData } from "@/components/billing/nfse/NfseTributacaoSection";
import { calcularRetencoes, formatarReais } from "@/lib/nfse-retencoes";

interface EmitNfseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices"> & { clients: { name: string } | null };
}

interface AsaasSettings {
  api_key: string;
  environment: "sandbox" | "production";
}

type DialogStep = "form" | "preview";

const initialTributacao: TributacaoData = {
  issRetido: false,
  aliquotaIss: 0,
  valorPis: 0,
  valorCofins: 0,
  valorCsll: 0,
  valorIrrf: 0,
  valorInss: 0,
};

export function EmitNfseDialog({ open, onOpenChange, invoice }: EmitNfseDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<DialogStep>("form");
  const [competenciaDate, setCompetenciaDate] = useState<Date>(() => {
    return new Date(invoice.due_date);
  });
  const [descricao, setDescricao] = useState("");
  const [tributacao, setTributacao] = useState<TributacaoData>(() => {
    const meta = invoice.processing_metadata as any;
    if (meta?.nfse_origin === "avulsa" && meta?.tributacao) {
      return {
        issRetido: meta.tributacao.iss_retido ?? false,
        aliquotaIss: meta.tributacao.aliquota_iss ?? 0,
        valorPis: meta.tributacao.valor_pis ?? 0,
        valorCofins: meta.tributacao.valor_cofins ?? 0,
        valorCsll: meta.tributacao.valor_csll ?? 0,
        valorIrrf: meta.tributacao.valor_irrf ?? 0,
        valorInss: meta.tributacao.valor_inss ?? 0,
      };
    }
    return initialTributacao;
  });

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
        .select("id, cnpj, razao_social, inscricao_municipal, nfse_ambiente")
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  // Fetch client details for preview
  const { data: clientDetails } = useQuery({
    queryKey: ["client-details-nfse", invoice.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("name, document, email, address, city, state")
        .eq("id", invoice.client_id)
        .single();
      if (error) return null;
      return data;
    },
  });

  const isAsaasConfigured = !!asaasConfig?.api_key;

  // Detect standalone NFS-e invoice (created from NfseAvulsaDialog)
  const metadata = invoice.processing_metadata as any;
  const isStandaloneNfse = metadata?.nfse_origin === "avulsa";

  // Alíquota: do contrato ou dos metadados da fatura avulsa
  const aliquotaIss = isStandaloneNfse
    ? (metadata?.aliquota ?? 0)
    : ((contract as any)?.nfse_service_codes?.aliquota_sugerida ?? 0);

  // Service code and CNAE: from contract or standalone metadata
  const effectiveServiceCode = isStandaloneNfse
    ? metadata?.service_code
    : contract?.nfse_service_code;
  const effectiveCnae = isStandaloneNfse
    ? metadata?.cnae
    : ((contract as any)?.nfse_service_codes?.cnae_principal || contract?.nfse_cnae);

  // Computed final description for preview
  const finalDescription = useMemo(() => {
    if (descricao) return descricao;
    if (isStandaloneNfse) return metadata?.service_description || invoice.description || "Prestação de serviços";
    return contract?.nfse_descricao_customizada || contract?.description || `Prestação de serviços - ${contract?.name}`;
  }, [descricao, contract, isStandaloneNfse, metadata, invoice.description]);

  // Calcular retenções
  const retencoes = useMemo(() => {
    return calcularRetencoes({
      valorServico: invoice.amount,
      aliquotaIss,
      issRetido: tributacao.issRetido,
      valorPis: tributacao.valorPis,
      valorCofins: tributacao.valorCofins,
      valorCsll: tributacao.valorCsll,
      valorIrrf: tributacao.valorIrrf,
      valorInss: tributacao.valorInss,
    });
  }, [invoice.amount, aliquotaIss, tributacao]);


  const emitMutation = useMutation({
    mutationFn: async () => {
      if (!invoice.contract_id && !isStandaloneNfse) {
        throw new Error("Fatura não possui contrato vinculado");
      }

      if (!isAsaasConfigured) {
        throw new Error("Integração Asaas não está configurada. Configure em Configurações → Integrações.");
      }

      const isStandalone = isStandaloneNfse || !invoice.contract_id;

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: isStandalone ? "emit_standalone" : "emit",
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          contract_id: invoice.contract_id || undefined,
          value: invoice.amount,
          service_description: finalDescription,
          service_code: isStandalone ? effectiveServiceCode : undefined,
          municipal_service_code: !isStandalone ? contract?.nfse_service_code : undefined,
          cnae: isStandalone ? effectiveCnae : undefined,
          aliquota: isStandalone ? aliquotaIss : undefined,
          effective_date: competencia + "-01",
          competencia,
          // Tributos
          retain_iss: tributacao.issRetido,
          iss_rate: aliquotaIss,
          pis_value: tributacao.valorPis,
          cofins_value: tributacao.valorCofins,
          csll_value: tributacao.valorCsll,
          irrf_value: tributacao.valorIrrf,
          inss_value: tributacao.valorInss,
          valor_liquido: retencoes.valorLiquido,
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
  const canEmit = isConfigured && isAsaasConfigured && (hasContract || isStandaloneNfse);

  // Competência formatada para API (yyyy-MM)
  const competencia = format(competenciaDate, "yyyy-MM");

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate("/settings?tab=integrations");
  };

  // Reset step when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setStep("form");
      setDescricao("");
      setTributacao(initialTributacao);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {step === "form" ? "Emitir NFS-e" : "Confirmar Emissão"}
          </DialogTitle>
          <DialogDescription>
            {step === "form" 
              ? `Gerar nota fiscal de serviço para a fatura #${invoice.invoice_number}`
              : "Revise os dados antes de confirmar a emissão"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
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

            {!hasContract && !isStandaloneNfse && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Esta fatura não possui contrato vinculado. Vincule um contrato ou emita uma NFS-e avulsa.
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
                    {isStandaloneNfse ? "Se vazio, será usada a descrição salva na emissão avulsa" : "Se vazio, será usada a descrição padrão do contrato"}
                  </p>
                </div>

                {/* Seção de Tributação */}
                <NfseTributacaoSection
                  valorServico={invoice.amount}
                  aliquotaIss={aliquotaIss}
                  data={tributacao}
                  onChange={setTributacao}
                />

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
        ) : (
          /* Preview Step */
          <div className="space-y-4">
            <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900 dark:text-blue-200">
                Revise todos os dados abaixo antes de confirmar a emissão da NFS-e.
              </AlertDescription>
            </Alert>

            {/* Prestador */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Prestador
              </div>
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1 text-sm">
                <div className="font-medium">{companyConfig?.razao_social || "Empresa"}</div>
                <div className="text-muted-foreground">
                  CNPJ: {companyConfig?.cnpj || "-"} | IM: {companyConfig?.inscricao_municipal || "-"}
                </div>
              </div>
            </div>

            {/* Tomador */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Tomador
              </div>
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1 text-sm">
                <div className="font-medium">{clientDetails?.name || invoice.clients?.name}</div>
                <div className="text-muted-foreground">
                  {clientDetails?.document ? `CPF/CNPJ: ${clientDetails.document}` : "Documento não informado"}
                </div>
                {clientDetails?.email && (
                  <div className="text-muted-foreground text-xs">{clientDetails.email}</div>
                )}
              </div>
            </div>

            <Separator />

            {/* Dados da Nota */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  Valor do Serviço
                </div>
                <div className="text-lg font-bold text-primary">
                  {formatCurrencyBRL(invoice.amount)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarIcon className="h-3 w-3" />
                  Competência
                </div>
                <div className="font-medium">
                  {format(competenciaDate, "MMMM/yyyy", { locale: ptBR })}
                </div>
              </div>
            </div>

            {(contract || isStandaloneNfse) && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  Código Tributação / CNAE
                </div>
                <div className="text-sm">
                  {effectiveServiceCode || "-"} / {effectiveCnae || "-"}
                </div>
              </div>
            )}

            {/* Resumo de Retenções */}
            {retencoes.totalRetencoes > 0 && (
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2 text-sm">
                <div className="font-medium text-amber-800 dark:text-amber-200">Retenções</div>
                {tributacao.issRetido && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ISS Retido ({aliquotaIss}%)</span>
                    <span>{formatarReais(retencoes.valorIssRetido)}</span>
                  </div>
                )}
                {tributacao.valorPis > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PIS</span>
                    <span>{formatarReais(tributacao.valorPis)}</span>
                  </div>
                )}
                {tributacao.valorCofins > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">COFINS</span>
                    <span>{formatarReais(tributacao.valorCofins)}</span>
                  </div>
                )}
                {tributacao.valorCsll > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CSLL</span>
                    <span>{formatarReais(tributacao.valorCsll)}</span>
                  </div>
                )}
                {tributacao.valorIrrf > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IRRF</span>
                    <span>{formatarReais(tributacao.valorIrrf)}</span>
                  </div>
                )}
                {tributacao.valorInss > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">INSS/CP</span>
                    <span>{formatarReais(tributacao.valorInss)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Valor Líquido</span>
                  <span className="text-primary">{formatarReais(retencoes.valorLiquido)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Descrição do Serviço</div>
              <div className="p-3 rounded-lg border bg-muted/30 text-sm">
                {finalDescription}
              </div>
            </div>

            <Alert className={asaasConfig?.environment === "production" ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30"}>
              <Zap className={`h-4 w-4 ${asaasConfig?.environment === "production" ? "text-green-600" : "text-yellow-600"}`} />
              <AlertDescription className={asaasConfig?.environment === "production" ? "text-green-900 dark:text-green-200" : "text-yellow-900 dark:text-yellow-200"}>
                Ambiente: <strong>{asaasConfig?.environment === "production" ? "Produção" : "Sandbox (Homologação)"}</strong>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={!canEmit}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Revisar e Emitir
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("form")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                onClick={() => emitMutation.mutate()}
                disabled={emitMutation.isPending}
                className="bg-status-success hover:bg-status-success/90"
              >
                {emitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirmar Emissão
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
