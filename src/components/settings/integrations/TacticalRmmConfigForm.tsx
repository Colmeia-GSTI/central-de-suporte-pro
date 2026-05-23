import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Monitor, Loader2, Save, TestTube, Check, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrationSettings } from "@/hooks/useIntegrationSettings";

interface TacticalRmmSettings {
  url: string;
  api_key: string;
  sync_interval_hours: number;
  import_hardware: boolean;
  import_metrics: boolean;
  import_reboot_status: boolean;
}

const defaultSettings: TacticalRmmSettings = {
  url: "",
  api_key: "",
  sync_interval_hours: 6,
  import_hardware: true,
  import_metrics: true,
  import_reboot_status: true,
};

export function TacticalRmmConfigForm() {
  const { settings, patch, isActive, setIsActive, loading, loaded, save } =
    useIntegrationSettings<TacticalRmmSettings>("tactical_rmm", defaultSettings);
  const [testing, setTesting] = useState(false);

  // Migração: converte sync_interval_minutes (legado) para horas, uma vez após o load
  useEffect(() => {
    if (!loaded) return;
    const legacy = (settings as unknown as { sync_interval_minutes?: number }).sync_interval_minutes;
    if (legacy && !settings.sync_interval_hours) {
      patch({ sync_interval_hours: Math.round(legacy / 60) || 6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const handleTest = async () => {
    if (!settings.url) {
      toast.error("Informe a URL do Tactical RMM");
      return;
    }
    setTesting(true);
    try {
      await save({ silent: true });
      const { data, error } = await supabase.functions.invoke("tactical-rmm-sync", {
        body: { action: "test" },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao testar conexão");
      } else {
        toast.success("Conexão com Tactical RMM válida!");
      }
    } catch (error: unknown) {
      toast.error("Erro: " + getErrorMessage(error));
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
                Gerencie computadores remotamente (sync: 3-12h)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="rmm-active" className="text-sm">Ativo</Label>
            <Switch id="rmm-active" checked={isActive} onCheckedChange={setIsActive} />
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
            onChange={(e) => patch({ url: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rmm-api-key">API Key</Label>
          <Input
            id="rmm-api-key"
            type="password"
            placeholder="••••••••"
            value={settings.api_key}
            onChange={(e) => patch({ api_key: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Intervalo de Sincronização</Label>
          <RadioGroup
            value={settings.sync_interval_hours.toString()}
            onValueChange={(v) => patch({ sync_interval_hours: parseInt(v) })}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="3" id="rmm-interval-3" />
              <Label htmlFor="rmm-interval-3" className="font-normal">3 horas</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="6" id="rmm-interval-6" />
              <Label htmlFor="rmm-interval-6" className="font-normal">6 horas</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="12" id="rmm-interval-12" />
              <Label htmlFor="rmm-interval-12" className="font-normal">12 horas</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Dados a Importar</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="import-hardware"
                checked={settings.import_hardware !== false}
                onCheckedChange={(checked) => patch({ import_hardware: !!checked })}
              />
              <Label htmlFor="import-hardware" className="font-normal">
                Detalhes de hardware (CPU, RAM, OS)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="import-metrics"
                checked={settings.import_metrics !== false}
                onCheckedChange={(checked) => patch({ import_metrics: !!checked })}
              />
              <Label htmlFor="import-metrics" className="font-normal">
                Métricas de performance (médias das últimas 10 leituras)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="import-reboot"
                checked={settings.import_reboot_status !== false}
                onCheckedChange={(checked) => patch({ import_reboot_status: !!checked })}
              />
              <Label htmlFor="import-reboot" className="font-normal">
                Status de reinicialização pendente
              </Label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={handleTest} disabled={testing || !settings.url}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube className="h-4 w-4 mr-2" />}
            Testar Conexão
          </Button>
          <Button onClick={() => save()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
