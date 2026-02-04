import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Loader2, Receipt, ShieldAlert, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import { NfseServiceCodeCombobox, type NfseServiceCode } from "./NfseServiceCodeCombobox";
import { NfseTributacaoSection, type TributacaoData } from "./NfseTributacaoSection";
import { calcularRetencoes } from "@/lib/nfse-retencoes";

type ClientOption = { id: string; name: string; document: string | null };

type AsaasSettings = {
  api_key?: string;
  environment?: "sandbox" | "production";
};

type CompanyCfg = {
  id: string;
  cnpj: string;
  inscricao_municipal: string | null;
  nfse_ambiente: string | null;
};

type Certificate = {
  id: string;
  nome: string;
  validade: string | null;
  titular: string | null;
};

const createInitialTributacao = (aliquota: number = 0): TributacaoData => ({
  issRetido: false,
  aliquotaIss: aliquota,
  valorPis: 0,
  valorCofins: 0,
  valorCsll: 0,
  valorIrrf: 0,
  valorInss: 0,
});

export function NfseAvulsaDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState<string>("");
  const [serviceCode, setServiceCode] = useState<NfseServiceCode | null>(null);
  const [competenciaDate, setCompetenciaDate] = useState<Date>(new Date());
  const [valor, setValor] = useState<number>(0);
  const [descricao, setDescricao] = useState<string>("");

  const [tributacao, setTributacao] = useState<TributacaoData>(createInitialTributacao());

  const [gerarFatura, setGerarFatura] = useState(false);
  const [vencimentoDias, setVencimentoDias] = useState<number>(30);

  const { data: asaasConfig } = useQuery({
    queryKey: ["asaas-active-for-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("settings")
        .eq("integration_type", "asaas")
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) return null;
      return (data.settings ?? null) as unknown as AsaasSettings;
    },
  });

  const asaasAvailable = !!asaasConfig?.api_key;

  const { data: company } = useQuery({
    queryKey: ["company-config-for-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, cnpj, inscricao_municipal, nfse_ambiente")
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as CompanyCfg;
    },
  });

  const { data: primaryCertificate } = useQuery({
    queryKey: ["nfse-primary-certificate", company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from("certificates")
        .select("id, nome, validade, titular")
        .eq("company_id", company.id)
        .eq("is_primary", true)
        .maybeSingle();
      if (error) return null;
      return data as Certificate;
    },
    enabled: !!company?.id,
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients-for-nfse-avulsa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, document")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientOption[];
    },
  });

  // Competência formatada para API (yyyy-MM)
  const competencia = format(competenciaDate, "yyyy-MM");

  const isCompanyConfigured = !!company?.cnpj && !!company?.inscricao_municipal;

  const certificateDaysRemaining = primaryCertificate?.validade
    ? differenceInDays(new Date(primaryCertificate.validade), new Date())
    : null;

  // Alíquota: usa a editada se maior que 0, senão a sugerida do código de serviço
  const aliquotaIss = tributacao.aliquotaIss > 0 ? tributacao.aliquotaIss : (serviceCode?.aliquota_sugerida ?? 0);

  const canEmit = asaasAvailable && isCompanyConfigured && !!clientId && !!serviceCode && valor > 0 && descricao.trim().length > 0;

  const reset = () => {
    setClientId("");
    setServiceCode(null);
    setCompetenciaDate(new Date());
    setValor(0);
    setDescricao("");
    setTributacao(createInitialTributacao());
    setGerarFatura(false);
    setVencimentoDias(30);
  };

  // Atualiza a alíquota quando o código de serviço muda
  const handleServiceCodeChange = (code: NfseServiceCode | null) => {
    setServiceCode(code);
    if (code?.aliquota_sugerida) {
      setTributacao(prev => ({ ...prev, aliquotaIss: code.aliquota_sugerida ?? 0 }));
    }
  };

  const emitMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Selecione um cliente");
      if (!serviceCode) throw new Error("Selecione um código de serviço");
      if (valor <= 0) throw new Error("Informe um valor válido");
      if (!descricao.trim()) throw new Error("Informe a descrição do serviço");

      // Calcular retenções
      const retencoes = calcularRetencoes({
        valorServico: valor,
        aliquotaIss,
        issRetido: tributacao.issRetido,
        valorPis: tributacao.valorPis,
        valorCofins: tributacao.valorCofins,
        valorCsll: tributacao.valorCsll,
        valorIrrf: tributacao.valorIrrf,
        valorInss: tributacao.valorInss,
      });

      let invoiceId: string | null = null;
      if (gerarFatura) {
        const due = addDays(new Date(), vencimentoDias);
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            client_id: clientId,
            contract_id: null,
            amount: valor,
            due_date: format(due, "yyyy-MM-dd"),
            status: "pending",
            description: descricao,
          })
          .select("id")
          .single();
        if (error) throw new Error("Erro ao criar fatura: " + error.message);
        invoiceId = data.id;
      }

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit_standalone",
          client_id: clientId,
          value: valor,
          service_description: descricao,
          service_code: serviceCode.codigo_tributacao,
          cnae: serviceCode.cnae_principal,
          aliquota: aliquotaIss,
          competencia,
          invoice_id: invoiceId,
          // Tributos Nacional 2026
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
      if (!data?.success) throw new Error(data?.error || "Falha ao emitir NFS-e");
      return { invoiceCreated: gerarFatura };
    },
    onSuccess: (result) => {
      toast.success(result.invoiceCreated ? "NFS-e e fatura geradas com sucesso" : "NFS-e avulsa gerada com sucesso", {
        description: "Provedor: Asaas",
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      reset();
      props.onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Erro ao emitir NFS-e", { description: err.message });
    },
  });

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Emitir NFS-e Avulsa
          </DialogTitle>
          <DialogDescription>Gere uma NFS-e sem vínculo com contrato.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alertas de pré-requisitos */}
          {!asaasAvailable && (
            <Alert variant="destructive" className="py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Integração Asaas não configurada. Configure em Configurações → Integrações.
              </AlertDescription>
            </Alert>
          )}

          {!isCompanyConfigured && (
            <Alert variant="destructive" className="py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Dados da empresa incompletos. Configure CNPJ e Inscrição Municipal em Configurações → Empresa.
              </AlertDescription>
            </Alert>
          )}

          {/* Provedor e Competência em linha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Provedor</Label>
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50 text-sm">
                <Badge variant="default" className="gap-1">
                  Asaas
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Competência</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
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
          </div>

          {/* Cliente */}
          <div className="space-y-1.5">
            <Label className="text-sm">Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={clientsLoading ? "Carregando..." : "Selecione o cliente"} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.document && <span className="text-muted-foreground ml-1 text-xs">({c.document})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Código de serviço */}
          <div className="space-y-1.5">
            <Label className="text-sm">Código de serviço (LC 116/2003) *</Label>
            <NfseServiceCodeCombobox
              value={serviceCode?.codigo_tributacao}
              onChange={handleServiceCodeChange}
            />
            {serviceCode && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span><strong>CNAE:</strong> {serviceCode.cnae_principal || "-"}</span>
                <span><strong>Alíquota:</strong> {serviceCode.aliquota_sugerida != null ? `${serviceCode.aliquota_sugerida}%` : "-"}</span>
              </div>
            )}
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <Label className="text-sm">Valor do serviço *</Label>
            <CurrencyInput value={valor} onChange={setValor} placeholder="R$ 0,00" className="h-9" />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label className="text-sm">Descrição do serviço *</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Descreva o serviço prestado..."
              className="resize-none"
            />
          </div>

          {/* Seção de Tributação - sempre visível */}
          <NfseTributacaoSection
            valorServico={valor}
            aliquotaIss={aliquotaIss}
            data={tributacao}
            onChange={setTributacao}
          />

          {/* Fatura - compacto */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Gerar fatura junto
              </Label>
              <Switch checked={gerarFatura} onCheckedChange={setGerarFatura} />
            </div>

            {gerarFatura && (
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Vencimento:</Label>
                <Select value={String(vencimentoDias)} onValueChange={(v) => setVencimentoDias(Number(v))}>
                  <SelectTrigger className="h-8 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="15">15 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="45">45 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  ({format(addDays(new Date(), vencimentoDias), "dd/MM/yyyy")})
                </span>
              </div>
            )}
          </div>

          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              Ambiente: <strong>{asaasConfig?.environment === "production" ? "Produção" : "Sandbox"}</strong>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => emitMutation.mutate()} disabled={!canEmit || emitMutation.isPending}>
            {emitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Emitir NFS-e
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
