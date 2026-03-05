import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, User, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Enums } from "@/integrations/supabase/types";

const roleLabels: Record<Enums<"app_role">, string> = {
  admin: "Administrador",
  manager: "Gerente",
  technician: "Técnico",
  financial: "Financeiro",
  client: "Cliente",
  client_master: "Cliente Master",
};

const roleColors: Record<Enums<"app_role">, string> = {
  admin: "bg-priority-critical text-white",
  manager: "bg-priority-high text-white",
  technician: "bg-status-progress text-white",
  financial: "bg-status-warning text-white",
  client: "bg-muted text-muted-foreground",
  client_master: "bg-primary text-primary-foreground",
};

interface UserProfileSheetProps {
  userId: string | null;
  userRoles?: Enums<"app_role">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProfileSheet({ userId, userRoles = [], open, onOpenChange }: UserProfileSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegramId, setTelegramId] = useState("");

  // Track the original email to detect changes
  const originalEmailRef = useRef("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile-edit", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, phone, whatsapp_number, telegram_chat_id, avatar_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && open,
    staleTime: 0,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setEmail(profile.email || "");
      setPhone(profile.phone || "");
      setWhatsapp(profile.whatsapp_number || "");
      setTelegramId(profile.telegram_chat_id || "");
      originalEmailRef.current = profile.email || "";
    }
  }, [profile]);

  const emailChanged = email.trim().toLowerCase() !== originalEmailRef.current.trim().toLowerCase();

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("ID do usuário ausente");

      // If email changed, call edge function to sync auth + profile
      if (emailChanged) {
        const { data, error } = await supabase.functions.invoke("update-user-email", {
          body: { user_id: userId, new_email: email.trim() },
        });
        if (error) throw new Error(error.message || "Erro ao atualizar email de login");
        if (data?.error) throw new Error(data.error);
      }

      // Update remaining profile fields
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          ...(emailChanged ? {} : { email: email.trim() }),
          phone: phone.trim() || null,
          whatsapp_number: whatsapp.trim() || null,
          telegram_chat_id: telegramId.trim() || null,
        })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile-edit", userId] });
      toast({ title: "Perfil atualizado com sucesso" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      console.error("[UserProfileSheet] Update failed:", error);
      toast({ title: "Erro ao atualizar perfil", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!fullName.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Editar Perfil
          </SheetTitle>
          <SheetDescription>
            Altere os dados do usuário abaixo.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 py-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 py-6">
            {/* Roles (read-only) */}
            <div className="space-y-2">
              <Label>Papéis</Label>
              <div className="flex flex-wrap gap-1">
                {userRoles.length > 0 ? (
                  userRoles.map((role) => (
                    <Badge key={role} className={roleColors[role]}>
                      {roleLabels[role]}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Sem papéis</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-full-name">Nome Completo</Label>
              <Input
                id="edit-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              {emailChanged && (
                <Alert variant="default" className="border-status-warning/50 bg-status-warning/10">
                  <AlertTriangle className="h-4 w-4 text-status-warning" />
                  <AlertDescription className="text-xs">
                    O email de <strong>login</strong> também será atualizado para o novo endereço.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(XX) XXXXX-XXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp</Label>
              <Input
                id="edit-whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="5548999999999"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-telegram">Telegram Chat ID</Label>
              <Input
                id="edit-telegram"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="ID numérico do chat"
              />
            </div>
          </div>
        )}

        <SheetFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || isLoading}>
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
