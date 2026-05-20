import { useState } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Send, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrationSettings } from "@/hooks/useIntegrationSettings";
import { IntegrationConfigCard } from "./IntegrationConfigCard";

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
  const { settings, patch, isActive, setIsActive, loading, save } =
    useIntegrationSettings<TelegramSettings>("telegram", defaultSettings);
  const [testing, setTesting] = useState(false);
  const [testChatId, setTestChatId] = useState("");

  const handleTest = async () => {
    const chatId = testChatId || settings.default_chat_id;
    if (!chatId) {
      toast.error("Informe um Chat ID para teste");
      return;
    }
    setTesting(true);
    try {
      await save({ silent: true });
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
    } catch (error: unknown) {
      toast.error("Erro ao testar: " + getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <IntegrationConfigCard
      icon={<Send className="h-5 w-5 text-blue-500" />}
      iconBgClass="bg-blue-500/10"
      title="Telegram Bot"
      description="Configure o Bot Telegram para envio de notificações"
      active={isActive}
      configured={!!settings.bot_token}
      onActiveChange={setIsActive}
      onSave={() => save()}
      saving={loading}
      onTest={handleTest}
      testing={testing}
      testSlot={
        <Input
          placeholder="Chat ID para teste (deixe em branco para usar padrão)"
          value={testChatId}
          onChange={(e) => setTestChatId(e.target.value)}
          className="flex-1"
        />
      }
    >
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
          onChange={(e) => patch({ bot_token: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="telegram-username">Username do Bot (opcional)</Label>
          <Input
            id="telegram-username"
            placeholder="@meu_bot"
            value={settings.bot_username}
            onChange={(e) => patch({ bot_username: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telegram-chat">Chat ID Padrão</Label>
          <Input
            id="telegram-chat"
            placeholder="-1001234567890"
            value={settings.default_chat_id}
            onChange={(e) => patch({ default_chat_id: e.target.value })}
          />
        </div>
      </div>
    </IntegrationConfigCard>
  );
}
