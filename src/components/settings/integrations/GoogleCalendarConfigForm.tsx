import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, Loader2, Save, Check, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";

interface GoogleSettings {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

const defaultSettings: GoogleSettings = {
  client_id: "",
  client_secret: "",
  redirect_uri: "",
};

export function GoogleCalendarConfigForm() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GoogleSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userConnected, setUserConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadSettings();
    checkUserConnection();
  }, [user]);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "google_calendar")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as GoogleSettings) });
      setIsActive(data.is_active);
    }
  };

  const checkUserConnection = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("google_calendar_integrations")
      .select("id")
      .eq("user_id", user.id)
      .single();
    
    setUserConnected(!!data);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "google_calendar")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "google_calendar");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "google_calendar",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações do Google Calendar salvas!");
    } catch (error: unknown) {
      toast.error("Erro ao salvar: " + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!user) return;
    setConnecting(true);

    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "auth_url",
          redirect_uri: window.location.origin + "/settings",
          user_id: user.id,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao iniciar conexão");
        return;
      }

      window.location.href = data.auth_url;
    } catch (error: unknown) {
      toast.error("Erro: " + getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    setConnecting(true);

    try {
      await supabase
        .from("google_calendar_integrations")
        .delete()
        .eq("user_id", user.id);

      setUserConnected(false);
      toast.success("Google Calendar desconectado");
    } catch (error: unknown) {
      toast.error("Erro: " + getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Google Calendar
                {isActive && settings.client_id ? (
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
                Sincronize eventos com o Google Calendar
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="google-active" className="text-sm">Ativo</Label>
            <Switch
              id="google-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-lg text-sm">
          <p className="text-muted-foreground">
            Para configurar, acesse o{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Google Cloud Console <ExternalLink className="h-3 w-3" />
            </a>
            , crie um projeto, ative a API do Calendar e configure as credenciais OAuth 2.0.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="google-client-id">Client ID</Label>
          <Input
            id="google-client-id"
            placeholder="xxxxx.apps.googleusercontent.com"
            value={settings.client_id}
            onChange={(e) => setSettings({ ...settings, client_id: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="google-client-secret">Client Secret</Label>
          <Input
            id="google-client-secret"
            type="password"
            placeholder="••••••••"
            value={settings.client_secret}
            onChange={(e) => setSettings({ ...settings, client_secret: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="google-redirect">Redirect URI (configure no Google Console)</Label>
          <Input
            id="google-redirect"
            value={`${window.location.origin}/settings`}
            readOnly
            className="bg-muted"
          />
        </div>

        {isActive && settings.client_id && (
          <div className="border-t pt-4">
            <Label className="text-sm font-medium">Sua Conexão</Label>
            <div className="flex items-center justify-between mt-2">
              {userConnected ? (
                <>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" />
                    Conectado
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={connecting}
                  >
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desconectar"}
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">
                    Conecte sua conta Google
                  </span>
                  <Button size="sm" onClick={handleConnect} disabled={connecting}>
                    {connecting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Calendar className="h-4 w-4 mr-2" />
                    )}
                    Conectar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end border-t pt-4">
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
