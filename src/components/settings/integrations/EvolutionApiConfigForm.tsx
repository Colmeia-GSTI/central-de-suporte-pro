import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { MessageCircle, Loader2, Save, TestTube, Check, X, Copy, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface EvolutionSettings {
  api_url: string;
  api_key: string;
  instance_name: string;
  default_number: string;
}

const defaultSettings: EvolutionSettings = {
  api_url: "",
  api_key: "",
  instance_name: "",
  default_number: "",
};

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-whatsapp-status`;

export function EvolutionApiConfigForm() {
  const [settings, setSettings] = useState<EvolutionSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "evolution_api")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as EvolutionSettings) });
      setIsActive(data.is_active);
    }
  };

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success("URL do webhook copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "evolution_api")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "evolution_api");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "evolution_api",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações Evolution API salvas com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testNumber) {
      toast.error("Informe um número para teste (com código do país)");
      return;
    }

    setTesting(true);
    try {
      await handleSave();

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: testNumber,
          message: `🔔 *Teste de Integração WhatsApp*\n\nEste é um teste de configuração da Evolution API.\n\nData: ${new Date().toLocaleString("pt-BR")}`,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao enviar mensagem de teste");
      } else {
        toast.success("Mensagem de teste enviada com sucesso!");
      }
    } catch (error: any) {
      toast.error("Erro ao testar: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                WhatsApp (Evolution API)
                {isActive && settings.api_url ? (
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
                Configure a Evolution API para envio de mensagens WhatsApp
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="evolution-active" className="text-sm">Ativo</Label>
            <Switch
              id="evolution-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="evolution-url">URL da API</Label>
            <Input
              id="evolution-url"
              placeholder="https://api.evolution.com"
              value={settings.api_url}
              onChange={(e) => setSettings({ ...settings, api_url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evolution-key">API Key</Label>
            <Input
              id="evolution-key"
              type="password"
              placeholder="••••••••"
              value={settings.api_key}
              onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="evolution-instance">Nome da Instância</Label>
            <Input
              id="evolution-instance"
              placeholder="minha-instancia"
              value={settings.instance_name}
              onChange={(e) => setSettings({ ...settings, instance_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evolution-default">Número Padrão (opcional)</Label>
            <Input
              id="evolution-default"
              placeholder="5511999999999"
              value={settings.default_number}
              onChange={(e) => setSettings({ ...settings, default_number: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Número para teste (ex: 5511999999999)"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
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

        {/* Webhook Configuration Section */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Configuração do Webhook (Status de Entrega)</Label>
          </div>
          <Alert>
            <AlertDescription className="text-sm">
              Para receber atualizações de status de mensagens (entregue/lido), configure o webhook abaixo no painel da Evolution API:
              <br /><br />
              <strong>Eventos:</strong> MESSAGE_UPDATE, MESSAGES_UPSERT
              <br />
              <strong>URL do Webhook:</strong>
            </AlertDescription>
          </Alert>
          <div className="flex items-center gap-2">
            <Input
              value={WEBHOOK_URL}
              readOnly
              className="font-mono text-xs bg-muted"
            />
            <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
