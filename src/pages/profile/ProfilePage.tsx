import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PushPermissionBlockedCard } from "@/components/profile/PushPermissionBlockedCard";
import { 
  User, Bell, Shield, Loader2, Save, Camera, 
  Mail, MessageCircle, Send, Volume2, VolumeX,
  AlertTriangle, AlertCircle, Info, BellRing, BellOff
} from "lucide-react";
import { ROLE_METADATA, MODULE_METADATA, AppRole, Module, PERMISSIONS_CONFIG } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { motion } from "framer-motion";

interface NotificationPreferences {
  notify_push: boolean;
  notify_sound: boolean;
  alert_critical: boolean;
  alert_warning: boolean;
  alert_info: boolean;
  alert_ticket_new: boolean;
  alert_ticket_update: boolean;
  alert_ticket_resolved: boolean;
}

const defaultLocalPrefs: NotificationPreferences = {
  notify_push: true,
  notify_sound: true,
  alert_critical: true,
  alert_warning: true,
  alert_info: false,
  alert_ticket_new: true,
  alert_ticket_update: false,
  alert_ticket_resolved: true,
};

export default function ProfilePage() {
  const { user, profile, roles } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { 
    isSupported: isPushSupported, 
    isSubscribed: isPushSubscribed,
    isBlocked: isPushBlocked, 
    subscribe: requestPushPermission, 
    unsubscribe: disablePush, 
    checkSubscription,
    isLoading: pushLoading 
  } = usePushNotifications();
  
  const [isLoading, setIsLoading] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    whatsapp_number: profile?.whatsapp_number || "",
    telegram_chat_id: profile?.telegram_chat_id || "",
    notify_email: profile?.notify_email ?? true,
    notify_whatsapp: profile?.notify_whatsapp ?? false,
    notify_telegram: profile?.notify_telegram ?? false,
  });

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>(defaultLocalPrefs);

  // Load local preferences from localStorage
  useEffect(() => {
    if (user?.id) {
      const savedPrefs = localStorage.getItem(`notification_prefs_${user.id}`);
      if (savedPrefs) {
        setLocalPrefs({ ...defaultLocalPrefs, ...JSON.parse(savedPrefs) });
      }
    }
  }, [user?.id]);

  // Update form when profile changes
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        whatsapp_number: profile.whatsapp_number || "",
        telegram_chat_id: profile.telegram_chat_id || "",
        notify_email: profile.notify_email ?? true,
        notify_whatsapp: profile.notify_whatsapp ?? false,
        notify_telegram: profile.notify_telegram ?? false,
      });
    }
  }, [profile]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLocalPrefChange = (field: keyof NotificationPreferences, value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          whatsapp_number: formData.whatsapp_number || null,
          telegram_chat_id: formData.telegram_chat_id || null,
          notify_email: formData.notify_email,
          notify_whatsapp: formData.notify_whatsapp,
          notify_telegram: formData.notify_telegram,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;

      // Save local preferences to localStorage
      localStorage.setItem(`notification_prefs_${user.id}`, JSON.stringify(localPrefs));

      toast({
        title: "Perfil atualizado",
        description: "Suas alterações foram salvas com sucesso.",
      });
    } catch (error) {
      logger.error("Error updating profile", "Profile", { error: String(error) });
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar o perfil.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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

  const handleTestPush = async () => {
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
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get permissions summary for the user
  const permissionsSummary = Object.entries(MODULE_METADATA).map(([module, meta]) => {
    const modulePermissions = PERMISSIONS_CONFIG[module as Module];
    const allowedActions = Object.entries(modulePermissions || {})
      .filter(([_, allowedRoles]) => 
        (roles as AppRole[]).some((role) => allowedRoles.includes(role))
      )
      .map(([action]) => action);
    
    return {
      module: module as Module,
      label: meta.label,
      actions: allowedActions,
      hasAccess: allowedActions.length > 0,
    };
  });

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
    <AppLayout title="Meu Perfil">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {getInitials(profile?.full_name || "U")}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full"
                  disabled
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{profile?.full_name}</h2>
                <p className="text-muted-foreground">{profile?.email}</p>
                <div className="flex gap-2 mt-3">
                  {(roles as AppRole[]).map((role) => (
                    <Badge
                      key={role}
                      variant="secondary"
                      className={`${ROLE_METADATA[role]?.color} text-white`}
                    >
                      {ROLE_METADATA[role]?.label || role}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="personal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personal" className="gap-2">
              <User className="h-4 w-4" />
              Dados Pessoais
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="permissions" className="gap-2">
              <Shield className="h-4 w-4" />
              Permissões
            </TabsTrigger>
          </TabsList>

          {/* Personal Data Tab */}
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
                <CardDescription>
                  Atualize suas informações pessoais de contato
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nome Completo</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => handleChange("full_name", e.target.value)}
                      placeholder="Seu nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={profile?.email || ""}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      O email não pode ser alterado
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp_number}
                      onChange={(e) => handleChange("whatsapp_number", e.target.value)}
                      placeholder="+55 00 00000-0000"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
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
                {/* Native Push Notifications */}
                {isPushSupported && !isPushBlocked && (
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
                  onChange={(checked) => handleLocalPrefChange("notify_push", checked)}
                  iconColor="bg-primary/10 text-primary"
                />

                {/* Sound */}
                <ChannelCard
                  icon={localPrefs.notify_sound ? Volume2 : VolumeX}
                  title="Som de Notificação"
                  description="Alerta sonoro para eventos críticos"
                  checked={localPrefs.notify_sound}
                  onChange={(checked) => handleLocalPrefChange("notify_sound", checked)}
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
                  onChange={(checked) => handleChange("notify_email", checked)}
                  iconColor="bg-blue-500/10 text-blue-500"
                />

                {/* WhatsApp */}
                <ChannelCard
                  icon={MessageCircle}
                  title="WhatsApp"
                  description="Receber notificações via WhatsApp"
                  checked={formData.notify_whatsapp}
                  onChange={(checked) => handleChange("notify_whatsapp", checked)}
                  iconColor="bg-green-500/10 text-green-500"
                >
                  {formData.notify_whatsapp && (
                    <div className="pt-2">
                      <Label htmlFor="whatsapp_channel">Número do WhatsApp</Label>
                      <Input
                        id="whatsapp_channel"
                        placeholder="5511999999999"
                        value={formData.whatsapp_number}
                        onChange={(e) => handleChange("whatsapp_number", e.target.value)}
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
                  onChange={(checked) => handleChange("notify_telegram", checked)}
                  iconColor="bg-sky-500/10 text-sky-500"
                >
                  {formData.notify_telegram && (
                    <div className="pt-2">
                      <Label htmlFor="telegram_channel">Chat ID do Telegram</Label>
                      <Input
                        id="telegram_channel"
                        placeholder="123456789"
                        value={formData.telegram_chat_id}
                        onChange={(e) => handleChange("telegram_chat_id", e.target.value)}
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
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_critical", checked)}
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
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_warning", checked)}
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
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_info", checked)}
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
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_ticket_new", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm">Atualizações em chamados</span>
                      <Switch
                        checked={localPrefs.alert_ticket_update}
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_ticket_update", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm">Chamados resolvidos</span>
                      <Switch
                        checked={localPrefs.alert_ticket_resolved}
                        onCheckedChange={(checked) => handleLocalPrefChange("alert_ticket_resolved", checked)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle>Suas Permissões</CardTitle>
                <CardDescription>
                  Veja o que você pode acessar em cada módulo do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {permissionsSummary.map(({ module, label, actions, hasAccess }) => (
                    <div
                      key={module}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        hasAccess ? "bg-card" : "bg-muted/50 opacity-60"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{label}</p>
                        {hasAccess && actions.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {actions.map((action) => (
                              <Badge key={action} variant="outline" className="text-xs">
                                {action === "view" && "Visualizar"}
                                {action === "create" && "Criar"}
                                {action === "edit" && "Editar"}
                                {action === "delete" && "Excluir"}
                                {action === "export" && "Exportar"}
                                {action === "manage" && "Gerenciar"}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Badge variant={hasAccess ? "default" : "secondary"}>
                        {hasAccess ? "Permitido" : "Sem Acesso"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={isLoading} 
            className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
