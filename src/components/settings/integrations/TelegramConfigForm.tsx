import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Loader2, Save, TestTube, Check, X, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TelegramSettings {
  bot_token: string;
  default_chat_id: string;
  bot_username: string;
}

const defaultSettings: TelegramSettings = {
  bot_token: "",
  default_chat_id: "",
  bot_username: "",
};

export function TelegramConfigForm() {
  const [settings, setSettings] = useState<TelegramSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testChatId, setTestChatId] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "telegram")
      .maybeSingle();

    if (data) {
      setSettings({ ...defaultSettings, ...(data.settings as unknown as TelegramSettings) });
      setIsActive(data.is_active);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "telegram")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "telegram");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "telegram",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações Telegram salvas com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const chatId = testChatId || settings.default_chat_id;
    if (!chatId) {
      toast.error("Informe um Chat ID para teste");
      return;
    }

    setTesting(true);
    try {
      await handleSave();

      const { data, error } = await supabase.functions.invoke("send-telegram", {
        body: {
          chat_id: chatId,
          message: `🔔 *Teste de Integração Telegram*\n\nEste é um teste de configuração do Bot Telegram.\n\nData: ${new Date().toLocaleString("pt-BR")}`,
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
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Send className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Telegram Bot
                {isActive && settings.bot_token ? (
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
                Configure o Bot Telegram para envio de notificações
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="telegram-active" className="text-sm">Ativo</Label>
            <Switch
              id="telegram-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Para criar um bot, fale com @BotFather no Telegram. Para obter o Chat ID, 
            adicione o bot a um grupo e use @userinfobot ou @getidsbot.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="telegram-token">Bot Token</Label>
          <Input
            id="telegram-token"
            type="password"
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            value={settings.bot_token}
            onChange={(e) => setSettings({ ...settings, bot_token: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="telegram-username">Username do Bot (opcional)</Label>
            <Input
              id="telegram-username"
              placeholder="@meu_bot"
              value={settings.bot_username}
              onChange={(e) => setSettings({ ...settings, bot_username: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegram-chat">Chat ID Padrão</Label>
            <Input
              id="telegram-chat"
              placeholder="-1001234567890"
              value={settings.default_chat_id}
              onChange={(e) => setSettings({ ...settings, default_chat_id: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Chat ID para teste (deixe em branco para usar padrão)"
              value={testChatId}
              onChange={(e) => setTestChatId(e.target.value)}
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
