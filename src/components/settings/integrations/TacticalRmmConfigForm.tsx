import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Monitor, Loader2, Save, TestTube, Check, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface TacticalRmmSettings {
  url: string;
  api_key: string;
  sync_interval_minutes: number;
}

const defaultSettings: TacticalRmmSettings = {
  url: "",
  api_key: "",
  sync_interval_minutes: 60, // Changed from 15 to 60 (hourly)
};

export function TacticalRmmConfigForm() {
  const [settings, setSettings] = useState<TacticalRmmSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "tactical_rmm")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as TacticalRmmSettings) });
      setIsActive(data.is_active);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "tactical_rmm")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "tactical_rmm");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "tactical_rmm",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações do Tactical RMM salvas!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!settings.url) {
      toast.error("Informe a URL do Tactical RMM");
      return;
    }

    setTesting(true);
    try {
      await handleSave();

      const { data, error } = await supabase.functions.invoke("tactical-rmm-sync", {
        body: { action: "test" },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao testar conexão");
      } else {
        toast.success("Conexão com Tactical RMM válida!");
      }
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Monitor className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Tactical RMM
                {isActive && settings.url ? (
                  <Badge variant="default" className="bg-green-500">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Gerencie dispositivos remotamente (sync: 15 min)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="rmm-active" className="text-sm">Ativo</Label>
            <Switch
              id="rmm-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-lg text-sm">
          <p className="text-muted-foreground">
            Configure sua instância do{" "}
            <a
              href="https://docs.tacticalrmm.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Tactical RMM <ExternalLink className="h-3 w-3" />
            </a>
            {" "}e gere uma API Key em Settings → Global Settings → API Keys.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rmm-url">URL do Tactical RMM</Label>
          <Input
            id="rmm-url"
            placeholder="https://api.seudominio.com"
            value={settings.url}
            onChange={(e) => setSettings({ ...settings, url: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rmm-api-key">API Key</Label>
          <Input
            id="rmm-api-key"
            type="password"
            placeholder="••••••••"
            value={settings.api_key}
            onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rmm-interval">Intervalo de Sincronização (minutos)</Label>
          <Input
            id="rmm-interval"
            type="number"
            min={5}
            max={60}
            value={settings.sync_interval_minutes}
            onChange={(e) => setSettings({ ...settings, sync_interval_minutes: parseInt(e.target.value) || 15 })}
          />
          <p className="text-xs text-muted-foreground">
            Recomendado: 60 minutos (horário) para otimizar custos
          </p>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={handleTest} disabled={testing || !settings.url}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Testar Conexão
          </Button>
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
