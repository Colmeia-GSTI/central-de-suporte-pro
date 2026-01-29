import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Mail, MessageCircle, Send, Save, Loader2, Bell, BellOff, 
  Volume2, VolumeX, AlertTriangle, AlertCircle, Info, Hexagon, BellRing
} from "lucide-react";
import { motion } from "framer-motion";

interface NotificationPreferences {
  notify_email: boolean;
  notify_whatsapp: boolean;
  notify_telegram: boolean;
  notify_push: boolean;
  notify_sound: boolean;
  whatsapp_number: string;
  telegram_chat_id: string;
  // Alert types
  alert_critical: boolean;
  alert_warning: boolean;
  alert_info: boolean;
  alert_ticket_new: boolean;
  alert_ticket_update: boolean;
  alert_ticket_resolved: boolean;
}

const defaultPreferences: NotificationPreferences = {
  notify_email: true,
  notify_whatsapp: false,
  notify_telegram: false,
  notify_push: true,
  notify_sound: true,
  whatsapp_number: "",
  telegram_chat_id: "",
  alert_critical: true,
  alert_warning: true,
  alert_info: false,
  alert_ticket_new: true,
  alert_ticket_update: false,
  alert_ticket_resolved: true,
};

export function NotificationPreferencesForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
const { isSupported: isPushSupported, isSubscribed: isPushSubscribed, subscribe: requestPushPermission, unsubscribe: disablePush, isLoading: pushLoading } = usePushNotifications();
  const [testingPush, setTestingPush] = useState(false);
  
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-preferences", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("notify_email, notify_whatsapp, notify_telegram, whatsapp_number, telegram_chat_id")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      // Load saved preferences from profile and localStorage for browser-specific settings
      const savedPrefs = localStorage.getItem(`notification_prefs_${user?.id}`);
      const localPrefs = savedPrefs ? JSON.parse(savedPrefs) : {};
      
      setPreferences({
        notify_email: profile.notify_email ?? true,
        notify_whatsapp: profile.notify_whatsapp ?? false,
        notify_telegram: profile.notify_telegram ?? false,
        notify_push: localPrefs.notify_push ?? true,
        notify_sound: localPrefs.notify_sound ?? true,
        whatsapp_number: profile.whatsapp_number ?? "",
        telegram_chat_id: profile.telegram_chat_id ?? "",
        alert_critical: localPrefs.alert_critical ?? true,
        alert_warning: localPrefs.alert_warning ?? true,
        alert_info: localPrefs.alert_info ?? false,
        alert_ticket_new: localPrefs.alert_ticket_new ?? true,
        alert_ticket_update: localPrefs.alert_ticket_update ?? false,
        alert_ticket_resolved: localPrefs.alert_ticket_resolved ?? true,
      });
    }
  }, [profile, user?.id]);

  const updateMutation = useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      if (!user) throw new Error("Usuário não autenticado");
      
      // Save to database (channels)
      const { error } = await supabase
        .from("profiles")
        .update({
          notify_email: prefs.notify_email,
          notify_whatsapp: prefs.notify_whatsapp,
          notify_telegram: prefs.notify_telegram,
          whatsapp_number: prefs.whatsapp_number || null,
          telegram_chat_id: prefs.telegram_chat_id || null,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      
      // Save browser-specific settings to localStorage
      localStorage.setItem(`notification_prefs_${user.id}`, JSON.stringify({
        notify_push: prefs.notify_push,
        notify_sound: prefs.notify_sound,
        alert_critical: prefs.alert_critical,
        alert_warning: prefs.alert_warning,
        alert_info: prefs.alert_info,
        alert_ticket_new: prefs.alert_ticket_new,
        alert_ticket_update: prefs.alert_ticket_update,
        alert_ticket_resolved: prefs.alert_ticket_resolved,
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-preferences"] });
      toast({
        title: "Preferências salvas",
        description: "Suas preferências de notificação foram atualizadas.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(preferences);
  };

  const testSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
      
      toast({ title: "Som de teste", description: "Notificação sonora funcionando!" });
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível reproduzir o som", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const ChannelCard = ({ 
    icon: Icon, 
    title, 
    description, 
    checked, 
    onChange, 
    iconColor,
    children 
  }: {
    icon: any;
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    iconColor: string;
    children?: React.ReactNode;
  }) => (
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

  return (
    <div className="space-y-6">
      {/* Channels */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hexagon className="h-5 w-5 text-primary" />
            Canais de Notificação
          </CardTitle>
          <CardDescription>
            Escolha como você deseja receber notificações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Native Push Notifications */}
          {isPushSupported && (
            <ChannelCard
              icon={BellRing}
              title="Push Nativo (Navegador)"
              description="Receba notificações mesmo com a aba fechada"
              checked={isPushSubscribed}
              onChange={async (checked) => {
                if (checked) {
                  await requestPushPermission();
                } else {
                  await disablePush();
                }
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
                    onClick={async () => {
                      setTestingPush(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("send-push-notification", {
                          body: {
                            type: "test",
                            user_ids: [user?.id],
                            data: {
                              title: "🐝 Teste Push - Colmeia",
                              body: "Notificações push funcionando corretamente!",
                              url: "/settings",
                            },
                          },
                        });
                        if (error) throw error;
                        toast({
                          title: "Push enviado",
                          description: data?.sent > 0 
                            ? "Você deve receber a notificação em segundos." 
                            : "Nenhum dispositivo inscrito encontrado.",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Erro ao testar push",
                          description: error.message,
                          variant: "destructive",
                        });
                      } finally {
                        setTestingPush(false);
                      }
                    }}
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

          {/* Browser Push */}
          <ChannelCard
            icon={preferences.notify_push ? Bell : BellOff}
            title="Push no Navegador"
            description="Notificações toast em tempo real"
            checked={preferences.notify_push}
            onChange={(checked) => setPreferences(prev => ({ ...prev, notify_push: checked }))}
            iconColor="bg-primary/10 text-primary"
          />

          {/* Sound */}
          <ChannelCard
            icon={preferences.notify_sound ? Volume2 : VolumeX}
            title="Som de Notificação"
            description="Alerta sonoro para eventos críticos"
            checked={preferences.notify_sound}
            onChange={(checked) => setPreferences(prev => ({ ...prev, notify_sound: checked }))}
            iconColor="bg-amber-500/10 text-amber-500"
          >
            {preferences.notify_sound && (
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
            checked={preferences.notify_email}
            onChange={(checked) => setPreferences(prev => ({ ...prev, notify_email: checked }))}
            iconColor="bg-blue-500/10 text-blue-500"
          />

          {/* WhatsApp */}
          <ChannelCard
            icon={MessageCircle}
            title="WhatsApp"
            description="Receber notificações via WhatsApp"
            checked={preferences.notify_whatsapp}
            onChange={(checked) => setPreferences(prev => ({ ...prev, notify_whatsapp: checked }))}
            iconColor="bg-green-500/10 text-green-500"
          >
            {preferences.notify_whatsapp && (
              <div className="pt-2">
                <Label htmlFor="whatsapp">Número do WhatsApp</Label>
                <Input
                  id="whatsapp"
                  placeholder="5511999999999"
                  value={preferences.whatsapp_number}
                  onChange={(e) => setPreferences(prev => ({ ...prev, whatsapp_number: e.target.value }))}
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
            checked={preferences.notify_telegram}
            onChange={(checked) => setPreferences(prev => ({ ...prev, notify_telegram: checked }))}
            iconColor="bg-sky-500/10 text-sky-500"
          >
            {preferences.notify_telegram && (
              <div className="pt-2">
                <Label htmlFor="telegram">Chat ID do Telegram</Label>
                <Input
                  id="telegram"
                  placeholder="123456789"
                  value={preferences.telegram_chat_id}
                  onChange={(e) => setPreferences(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
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

      {/* Alert Types */}
      <Card className="border-border/50">
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
                  checked={preferences.alert_critical}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_critical: checked }))}
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
                  checked={preferences.alert_warning}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_warning: checked }))}
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
                  checked={preferences.alert_info}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_info: checked }))}
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
                  checked={preferences.alert_ticket_new}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_ticket_new: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Atualizações em chamados</span>
                <Switch
                  checked={preferences.alert_ticket_update}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_ticket_update: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">Chamados resolvidos</span>
                <Switch
                  checked={preferences.alert_ticket_resolved}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, alert_ticket_resolved: checked }))}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground shadow-honey"
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Salvar Preferências
          </>
        )}
      </Button>
    </div>
  );
}
