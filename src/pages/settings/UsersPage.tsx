import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { UsersList } from "@/components/users/UsersList";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { AnomaliesBanner } from "@/components/users/AnomaliesBanner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot } from "lucide-react";

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [isSettingUpHermes, setIsSettingUpHermes] = useState(false);

  useEffect(() => { document.title = "Gestão de Usuários · Colmeia"; }, []);

  // BOTÃO TEMPORÁRIO — REMOVER APÓS SETUP DO HERMES BOT
  const handleSetupHermes = async () => {
    setIsSettingUpHermes(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-hermes-bot");
      if (error) {
        toast.error(`Erro ao configurar Hermes Bot: ${error.message}`);
        return;
      }
      if (data?.success) {
        toast.success("Hermes Bot configurado: role technician, senha no Vault");
      } else {
        toast.error(`Erro: ${data?.error || "Resposta inesperada"}`);
      }
    } catch (e) {
      toast.error(`Erro inesperado: ${(e as Error).message}`);
    } finally {
      setIsSettingUpHermes(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-4 max-w-6xl">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">Equipe, clientes e governança de acesso</p>
          </div>
          {isAdmin && <CreateUserDialog />}
        </header>

        {/* BOTÃO TEMPORÁRIO — REMOVER APÓS SETUP DO HERMES BOT */}
        {isAdmin && (
          <Card className="border-dashed border-warning/50 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-warning" />
                Configurar Hermes Bot (temporário)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetupHermes}
                disabled={isSettingUpHermes}
              >
                {isSettingUpHermes ? "Configurando..." : "Executar setup"}
              </Button>
            </CardContent>
          </Card>
        )}

        <AnomaliesBanner />
        <UsersList />
      </div>
    </AppLayout>
  );
}
