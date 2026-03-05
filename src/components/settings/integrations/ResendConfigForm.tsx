import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Mail, Loader2, Save, TestTube, Check, X, Eye, EyeOff, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface ResendSettings {
  api_key: string;
  default_from_name: string;
  default_from_email: string;
}

const defaultSettings: ResendSettings = {
  api_key: "",
  default_from_name: "Colmeia TI",
  default_from_email: "noreply@suporte.colmeiagsti.com",
};

export function ResendConfigForm() {
  const [settings, setSettings] = useState<ResendSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "resend")
      .maybeSingle();

    if (data) {
      const loaded = data.settings as unknown as ResendSettings;
      setSettings({
        ...defaultSettings,
        ...loaded,
        // Mask the API key if it exists
        api_key: loaded?.api_key ? "re_****" + loaded.api_key.slice(-4) : "",
      });
      setIsActive(data.is_active);
      setHasExistingKey(!!loaded?.api_key);
    }
  };

  const handleSave = async () => {
    if (!settings.api_key || settings.api_key.startsWith("re_****")) {
      if (!hasExistingKey) {
        toast.error("Informe a API Key do Resend");
        return;
      }
    }

    setLoading(true);
    try {
      // If user entered a new API key (not the masked one), update the secret
      const isNewKey = settings.api_key && !settings.api_key.startsWith("re_****");

      if (isNewKey) {
        // Update the secret via edge function
        const { error: secretError } = await supabase.functions.invoke("update-resend-key", {
          body: { api_key: settings.api_key },
        });

        if (secretError) throw new Error(secretError.message || "Erro ao salvar a API Key");
      }

      // Save non-sensitive settings to integration_settings
      const settingsToSave: Record<string, string> = {
        default_from_name: settings.default_from_name,
        default_from_email: settings.default_from_email,
      };

      // Store masked key reference for UI display
      if (isNewKey) {
        settingsToSave.api_key = settings.api_key;
      }

      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "resend")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settingsToSave as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "resend");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "resend",
            settings: settingsToSave as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;

      toast.success("Configuração do Resend salva com sucesso!");
      setHasExistingKey(true);

      // Re-mask the key in the UI
      if (isNewKey) {
        setSettings((prev) => ({
          ...prev,
          api_key: "re_****" + prev.api_key.slice(-4),
        }));
        setShowKey(false);
      }
    } catch (err: unknown) {
      console.error("[ResendConfigForm] Save error:", err);
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error("Informe um email para teste");
      return;
    }

    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-email-resend", {
        body: {
          to: testEmail,
          subject: "✅ Teste de Email - Colmeia TI",
          html: `
            <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #F5B700;">🐝 Email de Teste</h2>
              <p>Este é um email de teste enviado pelo sistema Colmeia TI.</p>
              <p>Se você recebeu este email, a integração com o Resend está funcionando corretamente!</p>
              <hr style="border: none; border-top: 1px solid #DEE2E6; margin: 20px 0;" />
              <p style="color: #6c757d; font-size: 12px;">Enviado em: ${new Date().toLocaleString("pt-BR")}</p>
            </div>
          `,
          from_name: settings.default_from_name,
          from_email: settings.default_from_email,
        },
      });

      if (error) throw error;

      toast.success("Email de teste enviado com sucesso! Verifique a caixa de entrada.");
    } catch (err: unknown) {
      console.error("[ResendConfigForm] Test error:", err);
      toast.error(`Falha no teste: ${getErrorMessage(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Email (Resend)</CardTitle>
              <CardDescription>
                Serviço de envio de emails transacionais (faturas, chamados, NFS-e, alertas)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-status-success" : ""}>
              {isActive ? "Ativa" : "Inativa"}
            </Badge>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Ativar integração Resend" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            O Resend é utilizado para enviar todos os emails transacionais do sistema: notificações de chamados,
            cobranças, NFS-e e alertas. Obtenha sua API Key em{" "}
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline text-primary"
            >
              resend.com/api-keys
            </a>
          </AlertDescription>
        </Alert>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="resend-api-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="resend-api-key"
                type={showKey ? "text" : "password"}
                placeholder="re_xxxxxxxxxxxx"
                value={settings.api_key}
                onChange={(e) => setSettings((s) => ({ ...s, api_key: e.target.value }))}
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Ocultar API Key" : "Mostrar API Key"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {hasExistingKey && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="h-3 w-3 text-status-success" />
              API Key configurada. Insira uma nova para substituir.
            </p>
          )}
        </div>

        {/* Default From Name */}
        <div className="space-y-2">
          <Label htmlFor="resend-from-name">Nome do Remetente</Label>
          <Input
            id="resend-from-name"
            placeholder="Colmeia TI"
            value={settings.default_from_name}
            onChange={(e) => setSettings((s) => ({ ...s, default_from_name: e.target.value }))}
          />
        </div>

        {/* Default From Email */}
        <div className="space-y-2">
          <Label htmlFor="resend-from-email">Email do Remetente</Label>
          <Input
            id="resend-from-email"
            type="email"
            placeholder="noreply@seudominio.com"
            value={settings.default_from_email}
            onChange={(e) => setSettings((s) => ({ ...s, default_from_email: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Este domínio deve estar verificado no Resend
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Configuração
          </Button>

          {/* Test Section */}
          <div className="border rounded-lg p-3 space-y-3">
            <Label htmlFor="resend-test-email" className="text-sm font-medium">
              Testar Envio
            </Label>
            <div className="flex gap-2">
              <Input
                id="resend-test-email"
                type="email"
                placeholder="seu@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || !isActive}
                aria-label="Enviar email de teste"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
              </Button>
            </div>
            {!isActive && (
              <p className="text-xs text-muted-foreground">Ative a integração para testar</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
