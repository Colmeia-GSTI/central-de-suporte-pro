import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Loader2, Save, TestTube, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

// Validation functions
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePort = (port: number): boolean => {
  return port >= 1 && port <= 65535;
};

const validateHost = (host: string): boolean => {
  // Basic hostname validation - allow alphanumeric, dots, hyphens
  const hostRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return hostRegex.test(host) && host.length <= 255;
};

const defaultSettings: SmtpSettings = {
  host: "",
  port: 587,
  username: "",
  password: "",
  from_email: "",
  from_name: "Sistema",
  use_tls: true,
};

export function SmtpConfigForm() {
  const [settings, setSettings] = useState<SmtpSettings>(defaultSettings);
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
      .eq("integration_type", "smtp")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as SmtpSettings) });
      setIsActive(data.is_active);
    }
  };

  const validateSettings = (): string | null => {
    if (!settings.host?.trim()) {
      return "Servidor SMTP é obrigatório";
    }
    if (!validateHost(settings.host)) {
      return "Nome do servidor inválido";
    }
    if (!validatePort(settings.port)) {
      return "Porta deve estar entre 1 e 65535";
    }
    if (!settings.username?.trim()) {
      return "Usuário é obrigatório";
    }
    if (!settings.password?.trim()) {
      return "Senha é obrigatória";
    }
    if (!settings.from_email?.trim()) {
      return "Email de remetente é obrigatório";
    }
    if (!validateEmail(settings.from_email)) {
      return "Email de remetente inválido";
    }
    if (!settings.from_name?.trim()) {
      return "Nome do remetente é obrigatório";
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateSettings();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setLoading(true);
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "smtp")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "smtp");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "smtp",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações SMTP salvas com sucesso!");
    } catch (error: unknown) {
      toast.error("Erro ao salvar: " + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail || !validateEmail(testEmail)) {
      toast.error("Email de teste inválido");
      return;
    }

    const validationError = validateSettings();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setTesting(true);
    try {
      // Auto-enable when testing
      const wasActive = isActive;
      if (!wasActive) {
        setIsActive(true);
      }

      // Save with active = true
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "smtp")
        .maybeSingle();

      const savePayload = {
        integration_type: "smtp",
        settings: settings as unknown as Json,
        is_active: true, // Always enable when testing
      };

      if (existing) {
        await supabase
          .from("integration_settings")
          .update({ settings: settings as unknown as Json, is_active: true })
          .eq("integration_type", "smtp");
      } else {
        await supabase.from("integration_settings").insert(savePayload);
      }

      const { data, error } = await supabase.functions.invoke("send-email-smtp", {
        body: {
          to: testEmail,
          subject: "Teste de Configuração SMTP",
          html: `
            <h1>Teste de Email SMTP</h1>
            <p>Este é um email de teste para verificar a configuração SMTP.</p>
            <p>Se você recebeu este email, a configuração está funcionando corretamente!</p>
            <p><strong>Data:</strong> ${new Date().toLocaleString("pt-BR")}</p>
          `,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao enviar email de teste");
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
                Email SMTP
                {isActive && settings.host ? (
                  <Badge variant="default" className="bg-green-500">
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
                Configure o servidor SMTP para envio de emails
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="smtp-active" className="text-sm">Ativo</Label>
            <Switch
              id="smtp-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-host">Servidor SMTP</Label>
            <Input
              id="smtp-host"
              placeholder="smtp.exemplo.com"
              value={settings.host}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-port">Porta</Label>
            <Input
              id="smtp-port"
              type="number"
              placeholder="587"
              value={settings.port}
              onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) || 587 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-user">Usuário</Label>
            <Input
              id="smtp-user"
              placeholder="usuario@exemplo.com"
              value={settings.username}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-pass">Senha</Label>
            <Input
              id="smtp-pass"
              type="password"
              placeholder="••••••••"
              value={settings.password}
              onChange={(e) => setSettings({ ...settings, password: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-from-email">Email Remetente</Label>
            <Input
              id="smtp-from-email"
              placeholder="noreply@exemplo.com"
              value={settings.from_email}
              onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-from-name">Nome Remetente</Label>
            <Input
              id="smtp-from-name"
              placeholder="Sistema Helpdesk"
              value={settings.from_name}
              onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="smtp-tls"
            checked={settings.use_tls}
            onCheckedChange={(checked) => setSettings({ ...settings, use_tls: checked })}
          />
          <Label htmlFor="smtp-tls">Usar TLS/SSL</Label>
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
