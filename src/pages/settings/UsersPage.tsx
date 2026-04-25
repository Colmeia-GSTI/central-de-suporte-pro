import { Helmet } from "react-helmet-async";
import { AppLayout } from "@/components/layout/AppLayout";
import { UsersList } from "@/components/users/UsersList";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { AnomaliesBanner } from "@/components/users/AnomaliesBanner";
import { usePermissions } from "@/hooks/usePermissions";

export default function UsersPage() {
  const { can } = usePermissions();
  const canCreate = can("admin");

  return (
    <AppLayout>
      <Helmet><title>Gestão de Usuários · Colmeia</title></Helmet>
      <div className="container mx-auto p-4 space-y-4 max-w-6xl">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">Equipe, clientes e governança de acesso</p>
          </div>
          {canCreate && <CreateUserDialog />}
        </header>
        <AnomaliesBanner />
        <UsersList />
      </div>
    </AppLayout>
  );
}
