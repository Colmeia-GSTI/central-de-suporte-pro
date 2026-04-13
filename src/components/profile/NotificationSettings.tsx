import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PushPermissionBlockedCard } from "@/components/profile/PushPermissionBlockedCard";
import {
  Bell, Loader2, Mail, MessageCircle, Send, Volume2, VolumeX,
  AlertTriangle, AlertCircle, Info, BellRing, BellOff
} from "lucide-react";
import { motion } from "framer-motion";

export interface NotificationPreferences {
  notify_push: boolean;
  notify_sound: boolean;
  alert_critical: boolean;
  alert_warning: boolean;
  alert_info: boolean;
  alert_ticket_new: boolean;
  alert_ticket_update: boolean;
  alert_ticket_resolved: boolean;
}

export const defaultLocalPrefs: NotificationPreferences = {
  notify_push: true,
  notify_sound: true,
  alert_critical: true,
  alert_warning: true,
  alert_info: false,
  alert_ticket_new: true,
  alert_ticket_update: false,
  alert_ticket_resolved: true,
};

interface ChannelFormData {
  notify_email: boolean;
  notify_whatsapp: boolean;
  notify_telegram: boolean;
  whatsapp_number: string;
  telegram_chat_id: string;
}

interface NotificationSettingsProps {
  formData: ChannelFormData;
  onFormChange: (field: string, value: string | boolean) => void;
  localPrefs: NotificationPreferences;
  onLocalPrefChange: (field: keyof NotificationPreferences, value: boolean) => void;
}

function ChannelCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  iconColor,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  iconColor: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      className="space-y-3 p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      {children}
    </motion.div>
  );
}

export function NotificationSettings({
  formData,
  onFormChange,
  localPrefs,
  onLocalPrefChange,
}: NotificationSettingsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [testingPush, setTestingPush] = useState(false);

  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    isBlocked: isPushBlocked,
    subscribe: requestPushPermission,
    unsubscribe: disablePush,
    checkSubscription,
    isLoading: pushLoading,
  } = usePushNotifications();

  const testSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      toast({ title: "Som de teste", description: "Notificação sonora funcionando!" });
    } catch {
      toast({ title: "Erro", description: "Não foi possível reproduzir o som", variant: "destructive" });
    }
  }, [toast]);

  const handleTestPush = useCallback(async () => {
    setTestingPush(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          type: "test",
          user_ids: [user?.id],
          data: {
            title: "🐝 Teste Push - Colmeia",
            body: "Notificações push funcionando corretamente!",
            url: "/profile",
          },
        },
      });
      if (error) throw error;

      if (data?.sent > 0) {
        toast({
          title: "Push enviado",
          description: "Você deve receber a notificação em segundos.",
        });
      } else {
        // Improved feedback: subscription may have expired
        toast({
          title: "Nenhum dispositivo recebeu",
          description: "A assinatura pode ter expirado. Desative e reative o Push Nativo para corrigir.",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Erro ao testar push",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setTestingPush(false);
    }
  }, [user?.id, toast]);

  return (
    <div className="space-y-6">
      {/* Push Blocked Warning */}
      {isPushSupported && isPushBlocked && (
        <PushPermissionBlockedCard
          onRetry={checkSubscription}
          isLoading={pushLoading}
        />
      )}

      {/* Channels Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Canais de Notificação
          </CardTitle>
          <CardDescription>
            Escolha como você deseja receber notificações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Native Push */}
          {isPushSupported && !isPushBlocked && (
            <ChannelCard
              icon={BellRing}
              title="Push Nativo (Navegador)"
              description="Receba notificações mesmo com a aba fechada"
              checked={isPushSubscribed}
              onChange={async (checked) => {
                if (checked) await requestPushPermission();
                else await disablePush();
              }}
              iconColor="bg-violet-500/10 text-violet-500"
            >
              {!isPushSubscribed && (
                <Button
                  onClick={requestPushPermission}
                  disabled={pushLoading}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  {pushLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <BellRing className="h-4 w-4 mr-2" />
                  )}
                  Ativar Notificações Push
                </Button>
              )}
              {isPushSubscribed && (
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    <Bell className="h-3 w-3 mr-1" />
                    Ativo
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testingPush}
                    onClick={handleTestPush}
                  >
                    {testingPush ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <BellRing className="h-4 w-4 mr-2" />
                    )}
                    Testar Push
                  </Button>
                </div>
              )}
            </ChannelCard>
          )}

          {/* Browser Push Toast */}
          <ChannelCard
            icon={localPrefs.notify_push ? Bell : BellOff}
            title="Push no Navegador"
            description="Notificações toast em tempo real"
            checked={localPrefs.notify_push}
            onChange={(checked) => onLocalPrefChange("notify_push", checked)}
            iconColor="bg-primary/10 text-primary"
          />

          {/* Sound */}
          <ChannelCard
            icon={localPrefs.notify_sound ? Volume2 : VolumeX}
            title="Som de Notificação"
            description="Alerta sonoro para eventos críticos"
            checked={localPrefs.notify_sound}
            onChange={(checked) => onLocalPrefChange("notify_sound", checked)}
            iconColor="bg-amber-500/10 text-amber-500"
          >
            {localPrefs.notify_sound && (
              <Button variant="outline" size="sm" onClick={testSound} className="mt-2">
                <Volume2 className="h-4 w-4 mr-2" />
                Testar Som
              </Button>
            )}
          </ChannelCard>

          {/* Email */}
          <ChannelCard
            icon={Mail}
            title="Email"
            description="Receber notificações por email"
            checked={formData.notify_email}
            onChange={(checked) => onFormChange("notify_email", checked)}
            iconColor="bg-blue-500/10 text-blue-500"
          />

          {/* WhatsApp */}
          <ChannelCard
            icon={MessageCircle}
            title="WhatsApp"
            description="Receber notificações via WhatsApp"
            checked={formData.notify_whatsapp}
            onChange={(checked) => onFormChange("notify_whatsapp", checked)}
            iconColor="bg-green-500/10 text-green-500"
          >
            {formData.notify_whatsapp && (
              <div className="pt-2">
                <Label htmlFor="whatsapp_channel">Número do WhatsApp</Label>
                <Input
                  id="whatsapp_channel"
                  placeholder="5511999999999"
                  value={formData.whatsapp_number}
                  onChange={(e) => onFormChange("whatsapp_number", e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Digite o número com código do país (ex: 55 para Brasil)
                </p>
              </div>
            )}
          </ChannelCard>

          {/* Telegram */}
          <ChannelCard
            icon={Send}
            title="Telegram"
            description="Receber notificações via Telegram"
            checked={formData.notify_telegram}
            onChange={(checked) => onFormChange("notify_telegram", checked)}
            iconColor="bg-sky-500/10 text-sky-500"
          >
            {formData.notify_telegram && (
              <div className="pt-2">
                <Label htmlFor="telegram_channel">Chat ID do Telegram</Label>
                <Input
                  id="telegram_channel"
                  placeholder="123456789"
                  value={formData.telegram_chat_id}
                  onChange={(e) => onFormChange("telegram_chat_id", e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Envie /start para @userinfobot no Telegram para obter seu ID
                </p>
              </div>
            )}
          </ChannelCard>
        </CardContent>
      </Card>

      {/* Alert Types Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            Tipos de Alerta
          </CardTitle>
          <CardDescription>
            Escolha quais tipos de alertas você deseja receber
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Monitoring Alerts */}
          <div>
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Monitoramento</h4>
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Badge variant="destructive" className="px-2">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Crítico
                  </Badge>
                  <span className="text-sm">Alertas de nível crítico</span>
                </div>
                <Switch
                  checked={localPrefs.alert_critical}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_critical", checked)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Badge className="bg-warning text-warning-foreground px-2">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Aviso
                  </Badge>
                  <span className="text-sm">Alertas de aviso</span>
                </div>
                <Switch
                  checked={localPrefs.alert_warning}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_warning", checked)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="px-2">
                    <Info className="h-3 w-3 mr-1" />
                    Info
                  </Badge>
                  <span className="text-sm">Alertas informativos</span>
                </div>
                <Switch
                  checked={localPrefs.alert_info}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_info", checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Ticket Alerts */}
          <div>
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Chamados</h4>
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Novos chamados criados</span>
                <Switch
                  checked={localPrefs.alert_ticket_new}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_ticket_new", checked)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Atualizações em chamados</span>
                <Switch
                  checked={localPrefs.alert_ticket_update}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_ticket_update", checked)}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Chamados resolvidos</span>
                <Switch
                  checked={localPrefs.alert_ticket_resolved}
                  onCheckedChange={(checked) => onLocalPrefChange("alert_ticket_resolved", checked)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
