import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { UsersList } from "@/components/users/UsersList";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { AnomaliesBanner } from "@/components/users/AnomaliesBanner";
import { PendingInvitesTab } from "@/components/settings/PendingInvitesTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePendingInvitesCount } from "@/hooks/usePendingInvitesCount";
import { useAuth } from "@/hooks/useAuth";

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const { data: pendingCount = 0 } = usePendingInvitesCount();

  useEffect(() => { document.title = "Gestão de Usuários · Colmeia"; }, []);

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-4 max-w-6xl">
        <header>
          <h1 className="text-2xl font-semibold">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground">Equipe, clientes e governança de acesso</p>
        </header>

        <Tabs defaultValue="users" className="w-full">
          <TabsList>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="invites" className="gap-2">
              Convites pendentes
              {pendingCount > 0 && (
                <Badge className="h-5 min-w-[20px] px-1.5 bg-primary text-primary-foreground text-[10px]">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4 space-y-4">
            {isAdmin && (
              <div className="flex justify-end">
                <CreateUserDialog />
              </div>
            )}
            <AnomaliesBanner />
            <UsersList />
          </TabsContent>

          <TabsContent value="invites" className="mt-4">
            <PendingInvitesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
