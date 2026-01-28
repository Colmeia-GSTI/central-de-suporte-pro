import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Loader2, AlertTriangle, Settings, Plus, Receipt, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ServiceCodeSelect } from "@/components/nfse/ServiceCodeSelect";
import { ClientForm } from "@/components/clients/ClientForm";

interface EmitNfseAvulsaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SelectedServiceCode {
  id: string;
  codigo_tributacao: string;
  descricao: string;
  cnae_principal: string | null;
  aliquota_sugerida: number | null;
  categoria: string | null;
}

interface AsaasSettings {
  api_key: string;
  environment: "sandbox" | "production";
}

export function EmitNfseAvulsaDialog({ open, onOpenChange }: EmitNfseAvulsaDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [clientId, setClientId] = useState<string>("");
  const [selectedServiceCode, setSelectedServiceCode] = useState<SelectedServiceCode | null>(null);
  const [valor, setValor] = useState<number>(0);
  const [competencia, setCompetencia] = useState(() => format(new Date(), "yyyy-MM"));
  const [descricao, setDescricao] = useState("");
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [gerarFatura, setGerarFatura] = useState(false);
  const [vencimentoDias, setVencimentoDias] = useState<number>(30);

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

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["clients-for-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, document")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
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
      if (!clientId) throw new Error("Selecione um cliente");
      if (!selectedServiceCode) throw new Error("Selecione um código de serviço");
      if (valor <= 0) throw new Error("Informe um valor válido");
      if (!descricao.trim()) throw new Error("Informe a descrição do serviço");

      if (!isAsaasConfigured) {
        throw new Error("Integração Asaas não está configurada. Configure em Configurações → Integrações.");
      }

      // If generating invoice, create it first
      let invoiceId: string | null = null;
      if (gerarFatura) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + vencimentoDias);
        
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            client_id: clientId,
            contract_id: null,
            amount: valor,
            due_date: dueDate.toISOString().split("T")[0],
            status: "pending",
            description: descricao,
          })
          .select("id")
          .single();
        
        if (invoiceError) throw new Error("Erro ao criar fatura: " + invoiceError.message);
        invoiceId = invoice.id;
      }

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit_standalone",
          client_id: clientId,
          value: valor,
          service_description: descricao,
          service_code: selectedServiceCode.codigo_tributacao,
          cnae: selectedServiceCode.cnae_principal,
          aliquota: selectedServiceCode.aliquota_sugerida,
          competencia,
          invoice_id: invoiceId,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao emitir NFS-e");
      return { ...data, invoiceCreated: gerarFatura };
    },
    onSuccess: (data) => {
      const message = data.invoiceCreated 
        ? "NFS-e e fatura geradas com sucesso!"
        : "NFS-e avulsa gerada com sucesso!";
      toast.success(message, {
        description: `ID: ${data.invoice_id} | Correlation: ${data.correlation_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao emitir NFS-e", { description: error.message });
    },
  });

  const resetForm = () => {
    setClientId("");
    setSelectedServiceCode(null);
    setValor(0);
    setDescricao("");
    setCompetencia(format(new Date(), "yyyy-MM"));
    setGerarFatura(false);
    setVencimentoDias(30);
  };

  const isConfigured = companyConfig?.cnpj && companyConfig?.inscricao_municipal;
  const canEmit = isConfigured && isAsaasConfigured && clientId && selectedServiceCode && valor > 0 && descricao.trim();

  // Generate competencia options
  const competenciaOptions = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const value = format(date, "yyyy-MM");
    const label = format(date, "MMMM yyyy", { locale: ptBR });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate("/settings?tab=integrations");
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Emitir NFS-e Avulsa
          </DialogTitle>
          <DialogDescription>
            Gerar nota fiscal de serviço sem vínculo com contrato
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

          {isAsaasConfigured && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Ambiente: <strong>{asaasConfig?.environment === "production" ? "Produção" : "Sandbox"}</strong>
              </AlertDescription>
            </Alert>
          )}

          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <div className="flex gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                      {client.document && (
                        <span className="text-muted-foreground ml-2">
                          ({client.document})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsClientFormOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Novo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Não encontrou o cliente? Clique em "Novo" para cadastrar.
            </p>
          </div>

          {/* Service Code Selection */}
          <div className="space-y-2">
            <Label>Código de Serviço NFS-e *</Label>
            <ServiceCodeSelect
              value={selectedServiceCode?.codigo_tributacao}
              onSelect={setSelectedServiceCode}
            />
            {selectedServiceCode && (
              <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                <p><strong>CNAE:</strong> {selectedServiceCode.cnae_principal || "-"}</p>
                <p><strong>Alíquota sugerida:</strong> {selectedServiceCode.aliquota_sugerida ? `${selectedServiceCode.aliquota_sugerida}%` : "-"}</p>
              </div>
            )}
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label>Valor do Serviço *</Label>
            <CurrencyInput
              value={valor}
              onChange={setValor}
              placeholder="R$ 0,00"
            />
          </div>

          {/* Competência */}
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

          {/* Descrição */}
          <div className="space-y-2">
            <Label>Descrição do Serviço *</Label>
            <Textarea
              placeholder="Descreva o serviço prestado..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>

          {/* Gerar Fatura */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="gerar-fatura" className="text-sm font-medium">
                  Gerar fatura junto com a NFS-e
                </Label>
              </div>
              <Switch
                id="gerar-fatura"
                checked={gerarFatura}
                onCheckedChange={setGerarFatura}
              />
            </div>

            {gerarFatura && (
              <div className="space-y-2">
                <Label>Vencimento (dias a partir de hoje)</Label>
                <Select value={String(vencimentoDias)} onValueChange={(v) => setVencimentoDias(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="10">10 dias</SelectItem>
                    <SelectItem value="15">15 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="45">45 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
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
            Emitir NFS-e Avulsa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Client Form Dialog */}
    <Dialog open={isClientFormOpen} onOpenChange={setIsClientFormOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>
            Cadastre um novo cliente para emissão da NFS-e
          </DialogDescription>
        </DialogHeader>
        <ClientForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["clients-for-nfse"] });
            setIsClientFormOpen(false);
          }}
          onCancel={() => setIsClientFormOpen(false)}
        />
      </DialogContent>
    </Dialog>
  </>
  );
}
