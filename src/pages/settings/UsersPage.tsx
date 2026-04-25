import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { UsersList } from "@/components/users/UsersList";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { AnomaliesBanner } from "@/components/users/AnomaliesBanner";
import { useAuth } from "@/hooks/useAuth";

export default function UsersPage() {
  const { isAdmin } = useAuth();
  useEffect(() => { document.title = "Gestão de Usuários · Colmeia"; }, []);

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
        <AnomaliesBanner />
        <UsersList />
      </div>
    </AppLayout>
  );
}
