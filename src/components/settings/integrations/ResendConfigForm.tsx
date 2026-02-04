import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Loader2, Save, TestTube, Check, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface ResendSettings {
  api_key: string;
  from_email: string;
  from_name: string;
}

const defaultSettings: ResendSettings = {
  api_key: "",
  from_email: "",
  from_name: "Sistema Colmeia",
};

export function ResendConfigForm() {
  const [settings, setSettings] = useState<ResendSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

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
      setSettings({ ...defaultSettings, ...(data.settings as unknown as ResendSettings) });
      setIsActive(data.is_active);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Check if record exists
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
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "resend");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "resend",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações Resend salvas com sucesso!");
    } catch (error: unknown) {
      toast.error("Erro ao salvar: " + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error("Informe um email para teste");
      return;
    }

    if (!settings.api_key || !settings.from_email) {
      toast.error("Preencha a API Key e Email Remetente antes de testar");
      return;
    }

    setTesting(true);
    try {
      // Auto-enable when testing
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "resend")
        .maybeSingle();

      const savePayload = {
        integration_type: "resend",
        settings: settings as unknown as Json,
        is_active: true,
      };

      if (existing) {
        await supabase
          .from("integration_settings")
          .update({ settings: settings as unknown as Json, is_active: true })
          .eq("integration_type", "resend");
      } else {
        await supabase.from("integration_settings").insert(savePayload);
      }

      setIsActive(true);

      const { data, error } = await supabase.functions.invoke("send-email-resend", {
        body: {
          to: testEmail,
          subject: "Teste de Configuração Resend",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0;">🐝 Colmeia TI</h1>
              </div>
              <div style="padding: 30px; background: #ffffff; border: 1px solid #e5e7eb;">
                <h2 style="color: #374151; margin-top: 0;">Teste de Email - Resend</h2>
                <p>Este é um email de teste para verificar a configuração do Resend.</p>
                <p>Se você recebeu este email, a configuração está funcionando corretamente!</p>
                <p><strong>Data:</strong> ${new Date().toLocaleString("pt-BR")}</p>
              </div>
            </div>
          `,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Erro ao enviar email de teste");
      } else {
        toast.success("Email de teste enviado com sucesso!");
      }
    } catch (error: unknown) {
      toast.error("Erro ao testar: " + getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Email (Resend)
                {isActive && settings.api_key ? (
                  <Badge variant="default" className="bg-status-success">
                    <Check className="h-3 w-3 mr-1" />
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="h-3 w-3 mr-1" />
                    Inativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Configure o envio de emails via Resend API
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="resend-active" className="text-sm">Ativo</Label>
            <Switch
              id="resend-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
          <p className="text-sm text-muted-foreground">
            Para configurar o Resend:
          </p>
          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
            <li>
              Crie uma conta em{" "}
              <a
                href="https://resend.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                resend.com <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              Valide seu domínio em{" "}
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Domains <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              Gere uma API Key em{" "}
              <a
                href="https://resend.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                API Keys <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resend-api-key">API Key</Label>
          <Input
            id="resend-api-key"
            type="password"
            placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={settings.api_key}
            onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="resend-from-email">Email Remetente</Label>
            <Input
              id="resend-from-email"
              placeholder="noreply@seudominio.com"
              value={settings.from_email}
              onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Use um email do domínio validado no Resend
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resend-from-name">Nome Remetente</Label>
            <Input
              id="resend-from-name"
              placeholder="Sistema Colmeia"
              value={settings.from_name}
              onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Email para teste"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Testar
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
