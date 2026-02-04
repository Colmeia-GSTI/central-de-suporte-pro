import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Receipt, Loader2, Copy, Check, ExternalLink, AlertCircle, CheckCircle2, UserPlus, CreditCard, BadgeCheck, FileText } from "lucide-react";

interface AsaasSettings {
  api_key: string;
  wallet_id: string;
  environment: "sandbox" | "production";
  webhook_token: string;
}

interface TestResult {
  success: boolean;
  account_name?: string;
  nfse_enabled?: boolean;
  city?: string;
  error?: string;
}

const defaultSettings: AsaasSettings = {
  api_key: "",
  wallet_id: "",
  environment: "sandbox",
  webhook_token: "",
};

export function AsaasConfigForm() {
  const [settings, setSettings] = useState<AsaasSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerResult, setCustomerResult] = useState<{ id: string; name: string } | null>(null);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    payment_id: string;
    customer_id: string;
    value: number;
    status: string;
    boleto_url?: string;
    invoice_url?: string;
  } | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [emittingNfse, setEmittingNfse] = useState(false);
  const [nfseResult, setNfseResult] = useState<{
    invoice_id: string;
    status: string;
    number?: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("id, settings, is_active")
        .eq("integration_type", "asaas")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const loadedSettings = data.settings as unknown as AsaasSettings;
        setSettings({
          api_key: loadedSettings?.api_key || "",
          wallet_id: loadedSettings?.wallet_id || "",
          environment: loadedSettings?.environment || "sandbox",
          webhook_token: loadedSettings?.webhook_token || generateWebhookToken(),
        });
        setIsActive(data.is_active);
      } else {
        setSettings({
          ...defaultSettings,
          webhook_token: generateWebhookToken(),
        });
      }
    } catch (error) {
      logger.error("Erro ao carregar configurações Asaas", "Integrations", { error: String(error) });
    }
  }

  function generateWebhookToken(): string {
    return crypto.randomUUID().replace(/-/g, "");
  }

  async function handleSave() {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "asaas")
        .maybeSingle();

      const settingsToSave = {
        ...settings,
        webhook_token: settings.webhook_token || generateWebhookToken(),
      };

      if (existing) {
        const { error } = await supabase
          .from("integration_settings")
          .update({
            settings: settingsToSave,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integration_settings")
          .insert([{
            integration_type: "asaas",
            settings: settingsToSave,
            is_active: isActive,
          }]);

        if (error) throw error;
      }

      toast.success("Configurações do Asaas salvas com sucesso!");
    } catch (error) {
      logger.error("Erro ao salvar configurações", "Integrations", { error: String(error) });
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);

    try {
      await handleSave();

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: { action: "test" },
      });

      if (error) throw error;

      if (data?.success) {
        // Handle city as object or string from Asaas API
        const cityValue = data.account?.city;
        const cityName = typeof cityValue === 'object' && cityValue !== null 
          ? cityValue.name || cityValue.district || String(cityValue.id || '')
          : cityValue;
        
        setTestResult({
          success: true,
          account_name: data.account?.name || data.account?.tradingName,
          nfse_enabled: data.account?.municipalInscription ? true : false,
          city: cityName,
        });
        toast.success("Conexão com Asaas testada com sucesso!");
      } else {
        setTestResult({
          success: false,
          error: data?.error || "Falha ao conectar",
        });
        toast.error(data?.error || "Falha ao testar conexão");
      }
    } catch (error: unknown) {
      logger.error("Erro ao testar conexão", "Integrations", { error: String(error) });
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      setTestResult({
        success: false,
        error: errorMessage,
      });
      toast.error("Erro ao testar conexão com Asaas");
    } finally {
      setTesting(false);
    }
  }

  function copyWebhookUrl() {
    const webhookUrl = `https://yaxkiombyntpzcrnultp.supabase.co/functions/v1/webhook-asaas-nfse?token=${settings.webhook_token}`;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL do webhook copiada!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCreateTestCustomer() {
    setCreatingCustomer(true);
    setCustomerResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: { action: "create_test_customer" },
      });

      if (error) throw error;

      if (data?.success) {
        setCustomerResult({
          id: data.customer_id,
          name: data.customer_name,
        });
        toast.success("Cliente de teste criado com sucesso!");
      } else {
        toast.error(data?.error || "Falha ao criar cliente de teste");
      }
    } catch (error: unknown) {
      logger.error("Erro ao criar cliente de teste", "Integrations", { error: String(error) });
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(errorMessage);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleCreateTestPayment() {
    setCreatingPayment(true);
    setPaymentResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: { 
          action: "create_test_payment",
          cpf: "01179973070",
          value: 5,
          billing_type: "BOLETO"
        },
      });

      if (error) throw error;

      if (data?.success) {
        setPaymentResult({
          payment_id: data.payment_id,
          customer_id: data.customer_id,
          value: data.value,
          status: data.status,
          boleto_url: data.boleto_url,
          invoice_url: data.invoice_url,
        });
        toast.success("Cobrança de teste criada com sucesso!");
      } else {
        toast.error(data?.error || "Falha ao criar cobrança de teste");
      }
    } catch (error: unknown) {
      logger.error("Erro ao criar cobrança de teste", "Integrations", { error: String(error) });
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(errorMessage);
    } finally {
      setCreatingPayment(false);
    }
  }

  async function handleConfirmPayment() {
    if (!paymentResult?.payment_id) {
      toast.error("Crie uma cobrança primeiro");
      return;
    }

    setConfirmingPayment(true);

    try {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: { 
          action: "confirm_test_payment",
          payment_id: paymentResult.payment_id
        },
      });

      if (error) throw error;

      if (data?.success) {
        setPaymentConfirmed(true);
        setPaymentResult(prev => prev ? { ...prev, status: data.status } : null);
        toast.success("Pagamento confirmado! Webhook deve ser acionado.");
      } else {
        toast.error(data?.error || "Falha ao confirmar pagamento");
      }
    } catch (error: unknown) {
      logger.error("Erro ao confirmar pagamento", "Integrations", { error: String(error) });
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(errorMessage);
    } finally {
      setConfirmingPayment(false);
    }
  }

  async function handleEmitTestNfse() {
    if (!paymentResult?.payment_id) {
      toast.error("Confirme o pagamento primeiro");
      return;
    }

    setEmittingNfse(true);
    setNfseResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: { 
          action: "emit_test",
          payment_id: paymentResult.payment_id,
          customer_id: paymentResult.customer_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setNfseResult({
          invoice_id: data.invoice_id,
          status: data.status,
          number: data.number,
        });
        toast.success("NFS-e de teste emitida com sucesso!");
      } else {
        toast.error(data?.error || "Falha ao emitir NFS-e de teste");
      }
    } catch (error: unknown) {
      logger.error("Erro ao emitir NFS-e de teste", "Integrations", { error: String(error) });
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(errorMessage);
    } finally {
      setEmittingNfse(false);
    }
  }

  const webhookUrl = `https://yaxkiombyntpzcrnultp.supabase.co/functions/v1/webhook-asaas-nfse?token=${settings.webhook_token}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Asaas - NFS-e</CardTitle>
              <CardDescription>
                Emissão automatizada de Notas Fiscais de Serviço
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isActive && settings.api_key ? "default" : "secondary"}>
              {isActive && settings.api_key ? "Configurado" : "Pendente"}
            </Badge>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Para obter suas credenciais, acesse{" "}
            <a
              href="https://www.asaas.com/config/api"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline inline-flex items-center gap-1"
            >
              Asaas Config API
              <ExternalLink className="h-3 w-3" />
            </a>
            . Custo: R$ 0,49 por nota emitida.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="asaas-api-key">Chave de API</Label>
            <Input
              id="asaas-api-key"
              type="password"
              placeholder="$aact_..."
              value={settings.api_key}
              onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asaas-wallet-id">ID da Carteira (Opcional)</Label>
            <Input
              id="asaas-wallet-id"
              placeholder="ID da carteira para subconta"
              value={settings.wallet_id}
              onChange={(e) => setSettings({ ...settings, wallet_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Use apenas se estiver emitindo notas para uma subconta específica
            </p>
          </div>

          <div className="space-y-3">
            <Label>Ambiente</Label>
            <RadioGroup
              value={settings.environment}
              onValueChange={(value: "sandbox" | "production") =>
                setSettings({ ...settings, environment: value })
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sandbox" id="asaas-sandbox" />
                <Label htmlFor="asaas-sandbox" className="font-normal cursor-pointer">
                  Sandbox (Testes)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="production" id="asaas-production" />
                <Label htmlFor="asaas-production" className="font-normal cursor-pointer">
                  Produção
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {testResult.success ? (
                <div className="space-y-1">
                  <p className="font-medium">Conexão estabelecida!</p>
                  {testResult.account_name && <p>Conta: {testResult.account_name}</p>}
                  {testResult.city && <p>Cidade: {testResult.city}</p>}
                  <p>
                    NFS-e:{" "}
                    {testResult.nfse_enabled ? (
                      <span className="text-green-600">Habilitado</span>
                    ) : (
                      <span className="text-amber-600">Verificar configuração</span>
                    )}
                  </p>
                </div>
              ) : (
                <p>{testResult.error}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {testResult?.success && (
          <div className="space-y-4">
            {/* Etapa 1: Criar Cliente */}
            <div className="space-y-3 p-4 rounded-lg border border-dashed">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">1. Criar Cliente via API</p>
                  <p className="text-xs text-muted-foreground">
                    Crie um cliente de teste para validar a integração no Asaas
                  </p>
                </div>
                {customerResult ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Concluído
                  </Badge>
                ) : (
                  <Badge variant="secondary">Pendente</Badge>
                )}
              </div>
              
              {customerResult ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <p className="font-medium">Cliente criado com sucesso!</p>
                    <p className="text-xs font-mono mt-1">ID: {customerResult.id}</p>
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateTestCustomer}
                  disabled={creatingCustomer}
                  className="w-full"
                >
                  {creatingCustomer ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Criar Cliente de Teste
                </Button>
              )}
            </div>

            {/* Etapa 2: Criar Cobrança */}
            <div className="space-y-3 p-4 rounded-lg border border-dashed">
              <div className="flex items-center justify-between">
              <div>
                  <p className="font-medium text-sm">2. Criar Cobrança via API</p>
                  <p className="text-xs text-muted-foreground">
                    Crie um boleto de R$ 5,00 para testar cobranças (mínimo Asaas)
                  </p>
                </div>
                {paymentResult ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Concluído
                  </Badge>
                ) : (
                  <Badge variant="secondary">Pendente</Badge>
                )}
              </div>
              
              {paymentResult ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Cobrança criada com sucesso!</p>
                      <p className="text-xs font-mono">ID: {paymentResult.payment_id}</p>
                      <p className="text-xs">Valor: R$ {paymentResult.value?.toFixed(2)}</p>
                      <p className="text-xs">Status: {paymentResult.status}</p>
                      {paymentResult.invoice_url && (
                        <a
                          href={paymentResult.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline inline-flex items-center gap-1"
                        >
                          Ver Fatura <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateTestPayment}
                  disabled={creatingPayment}
                  className="w-full"
                >
                  {creatingPayment ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Criar Boleto de Teste (R$ 5,00)
                </Button>
              )}
            </div>

            {/* Etapa 3: Confirmar Pagamento */}
            {paymentResult && (
              <div className="space-y-3 p-4 rounded-lg border border-dashed">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">3. Confirmar Pagamento (Sandbox)</p>
                    <p className="text-xs text-muted-foreground">
                      Simule a confirmação para acionar o Webhook
                    </p>
                  </div>
                  {paymentConfirmed ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Concluído
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendente</Badge>
                  )}
                </div>
                
                {paymentConfirmed ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">Pagamento confirmado!</p>
                        <p className="text-xs">Status: {paymentResult.status}</p>
                        <p className="text-xs text-muted-foreground">
                          O evento de webhook foi enviado para sua URL configurada.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConfirmPayment}
                    disabled={confirmingPayment}
                    className="w-full"
                  >
                    {confirmingPayment ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="mr-2 h-4 w-4" />
                    )}
                    Confirmar Pagamento no Sandbox
                  </Button>
                )}
              </div>
            )}

            {/* Etapa 4: Emitir NFS-e de Teste */}
            {paymentConfirmed && (
              <div className="space-y-3 p-4 rounded-lg border border-dashed">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">4. Emitir NFS-e de Teste</p>
                    <p className="text-xs text-muted-foreground">
                      Teste a emissão de nota fiscal vinculada ao pagamento
                    </p>
                  </div>
                  {nfseResult ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Concluído
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendente</Badge>
                  )}
                </div>
                
                {nfseResult ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">NFS-e emitida com sucesso!</p>
                        <p className="text-xs font-mono">ID: {nfseResult.invoice_id}</p>
                        <p className="text-xs">Status: {nfseResult.status}</p>
                        {nfseResult.number && <p className="text-xs">Número: {nfseResult.number}</p>}
                        <p className="text-xs text-muted-foreground mt-2">
                          A NFS-e será processada e você receberá o webhook quando autorizada.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEmitTestNfse}
                    disabled={emittingNfse}
                    className="w-full"
                  >
                    {emittingNfse ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    Emitir NFS-e de Teste
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {isActive && settings.api_key && (
          <div className="space-y-2 p-4 rounded-lg bg-muted/50">
            <Label>URL do Webhook (Configure no Asaas)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-xs bg-background"
              />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure esta URL em{" "}
              <a
                href="https://www.asaas.com/config/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Asaas → Configurações → Webhooks
              </a>{" "}
              para receber atualizações de status automaticamente.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !settings.api_key}
          >
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar Conexão
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
