import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Server, Loader2, Save, TestTube, Check, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface CheckMkSettings {
  url: string;
  username: string;
  secret: string;
  sync_interval_hours: number;
  import_services: boolean;
  alert_levels: {
    crit: boolean;
    warn: boolean;
    unknown: boolean;
  };
}

const defaultSettings: CheckMkSettings = {
  url: "",
  username: "",
  secret: "",
  sync_interval_hours: 6,
  import_services: true,
  alert_levels: {
    crit: true,
    warn: true,
    unknown: false,
  },
};

export function CheckMkConfigForm() {
  const [settings, setSettings] = useState<CheckMkSettings>(defaultSettings);
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
      .eq("integration_type", "checkmk")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as CheckMkSettings) });
      setIsActive(data.is_active);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "checkmk")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "checkmk");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "checkmk",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações do CheckMK salvas!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!settings.url || !settings.username || !settings.secret) {
      toast.error("Preencha URL, usuário e secret");
      return;
    }

    setTesting(true);
    try {
      await handleSave();

      const { data, error } = await supabase.functions.invoke("checkmk-sync", {
        body: { action: "test" },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao testar conexão");
      } else {
        toast.success("Conexão com CheckMK válida!");
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
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Server className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                CheckMK
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
                Monitoramento de servidores e dispositivos de rede
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="checkmk-active" className="text-sm">Ativo</Label>
            <Switch
              id="checkmk-active"
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
              href="https://docs.checkmk.com/latest/en/rest_api.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              CheckMK <ExternalLink className="h-3 w-3" />
            </a>
            {" "}e crie um usuário de automação em Setup → Users.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="checkmk-url">URL do CheckMK (com site)</Label>
          <Input
            id="checkmk-url"
            placeholder="https://checkmk.empresa.com/meusite"
            value={settings.url}
            onChange={(e) => setSettings({ ...settings, url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Inclua o nome do site (ex: /meusite ou /monitoring)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="checkmk-username">Usuário de Automação</Label>
            <Input
              id="checkmk-username"
              placeholder="automation"
              value={settings.username}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkmk-secret">Automation Secret</Label>
            <Input
              id="checkmk-secret"
              type="password"
              placeholder="••••••••"
              value={settings.secret}
              onChange={(e) => setSettings({ ...settings, secret: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Intervalo de Sincronização</Label>
          <RadioGroup
            value={settings.sync_interval_hours.toString()}
            onValueChange={(v) => setSettings({ ...settings, sync_interval_hours: parseInt(v) })}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="3" id="interval-3" />
              <Label htmlFor="interval-3" className="font-normal">3 horas</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="6" id="interval-6" />
              <Label htmlFor="interval-6" className="font-normal">6 horas</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="12" id="interval-12" />
              <Label htmlFor="interval-12" className="font-normal">12 horas</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Níveis de Alerta a Importar</Label>
          <div className="flex gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="alert-crit"
                checked={settings.alert_levels?.crit !== false}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    alert_levels: { ...settings.alert_levels, crit: !!checked },
                  })
                }
              />
              <Label htmlFor="alert-crit" className="font-normal">CRIT (crítico)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="alert-warn"
                checked={settings.alert_levels?.warn !== false}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    alert_levels: { ...settings.alert_levels, warn: !!checked },
                  })
                }
              />
              <Label htmlFor="alert-warn" className="font-normal">WARN (aviso)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="alert-unknown"
                checked={settings.alert_levels?.unknown === true}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    alert_levels: { ...settings.alert_levels, unknown: !!checked },
                  })
                }
              />
              <Label htmlFor="alert-unknown" className="font-normal">UNKNOWN</Label>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="import-services"
            checked={settings.import_services !== false}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, import_services: !!checked })
            }
          />
          <Label htmlFor="import-services" className="font-normal">
            Importar contadores de serviços para servidores
          </Label>
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
