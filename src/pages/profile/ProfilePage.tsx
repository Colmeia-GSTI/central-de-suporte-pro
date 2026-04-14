import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationSettings, NotificationPreferences, defaultLocalPrefs } from "@/components/profile/NotificationSettings";
import { User, Bell, Shield, Loader2, Save, Camera } from "lucide-react";
import { ROLE_METADATA, MODULE_METADATA, AppRole, Module, PERMISSIONS_CONFIG } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";

export default function ProfilePage() {
  const { user, profile, roles } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);

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
    setLocalPrefs((prev) => ({ ...prev, [field]: value }));
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
        description: "Dados pessoais, canais e preferências de alerta salvos com sucesso.",
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Permissions summary
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
          <TabsContent value="notifications">
            <NotificationSettings
              formData={formData}
              onFormChange={handleChange}
              localPrefs={localPrefs}
              onLocalPrefChange={handleLocalPrefChange}
            />
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
