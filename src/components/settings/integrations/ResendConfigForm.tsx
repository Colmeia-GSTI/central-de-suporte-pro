import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Mail, Loader2, Save, TestTube, Info, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface ResendSettings {
  default_from_name: string;
  default_from_email: string;
}

const defaultSettings: ResendSettings = {
  default_from_name: "Colmeia TI",
  default_from_email: "noreply@suporte.colmeiagsti.com",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ResendConfigForm() {
  const [settings, setSettings] = useState<ResendSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const isFromEmailValid = useMemo(() => emailRegex.test(settings.default_from_email.trim()), [settings.default_from_email]);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("settings, is_active")
        .eq("integration_type", "resend")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const loaded = data.settings as Partial<ResendSettings> | null;
        setSettings({
          default_from_name: loaded?.default_from_name ?? defaultSettings.default_from_name,
          default_from_email: loaded?.default_from_email ?? defaultSettings.default_from_email,
        });
        setIsActive(data.is_active);
      }
    } catch (error: unknown) {
      console.error("[ResendConfigForm] loadSettings error:", error);
      toast.error("Não foi possível carregar a configuração de email.");
    }
  };

  const handleSave = async () => {
    const fromName = settings.default_from_name.trim();
    const fromEmail = settings.default_from_email.trim().toLowerCase();

    if (!fromName) {
      toast.error("Informe o nome do remetente.");
      return;
    }

    if (!emailRegex.test(fromEmail)) {
      toast.error("Informe um email de remetente válido.");
      return;
    }

    setLoading(true);
    try {
      const settingsToSave: ResendSettings = {
        default_from_name: fromName,
        default_from_email: fromEmail,
      };

      const { data: existing, error: existingError } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "resend")
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const { error } = await supabase
          .from("integration_settings")
          .update({
            settings: settingsToSave as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "resend");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "resend",
            settings: settingsToSave as unknown as Json,
            is_active: isActive,
          });

        if (error) throw error;
      }

      toast.success("Configuração de envio salva com sucesso.");
    } catch (error: unknown) {
      console.error("[ResendConfigForm] handleSave error:", error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const recipient = testEmail.trim().toLowerCase();

    if (!emailRegex.test(recipient)) {
      toast.error("Informe um email de teste válido.");
      return;
    }

    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-email-resend", {
        body: {
          to: recipient,
          subject: "✅ Teste de Email - Colmeia TI",
          html: `
            <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Email de teste</h2>
              <p>Se você recebeu este email, o fluxo transacional está funcionando.</p>
              <p>Enviado em: ${new Date().toLocaleString("pt-BR")}</p>
            </div>
          `,
          from_name: settings.default_from_name.trim(),
          from_email: settings.default_from_email.trim().toLowerCase(),
        },
      });

      if (error) throw error;

      toast.success("Email de teste enviado com sucesso.");
    } catch (error: unknown) {
      console.error("[ResendConfigForm] handleTest error:", error);
      toast.error(`Falha no teste: ${getErrorMessage(error)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Email transacional</CardTitle>
              <CardDescription>Configuração de remetente e teste de entrega</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-status-success" : ""}>
              {isActive ? "Ativa" : "Inativa"}
            </Badge>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Ativar integração de email" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            A API Key é gerenciada via segredo seguro do backend (RESEND_API_KEY) e nunca é salva na tabela de integrações.
          </AlertDescription>
        </Alert>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Se o teste retornar “API key is invalid”, atualize o segredo <strong>RESEND_API_KEY</strong> no Lovable Cloud.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="resend-from-name">Nome do remetente</Label>
          <Input
            id="resend-from-name"
            value={settings.default_from_name}
            onChange={(e) => setSettings((s) => ({ ...s, default_from_name: e.target.value }))}
            placeholder="Colmeia TI"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="resend-from-email">Email do remetente</Label>
          <Input
            id="resend-from-email"
            type="email"
            value={settings.default_from_email}
            onChange={(e) => setSettings((s) => ({ ...s, default_from_email: e.target.value }))}
            placeholder="noreply@seudominio.com"
          />
          {!isFromEmailValid && (
            <p className="text-xs text-destructive">Informe um email de remetente válido.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleSave} disabled={loading || !isFromEmailValid} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar configuração
          </Button>

          <div className="space-y-3 rounded-lg border p-3">
            <Label htmlFor="resend-test-email">Testar envio</Label>
            <div className="flex gap-2">
              <Input
                id="resend-test-email"
                type="email"
                placeholder="seu@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleTest} disabled={testing || !isActive} aria-label="Enviar email de teste">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
