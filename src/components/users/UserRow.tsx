import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { UserActionsMenu } from "./UserActionsMenu";
import type { UserListRow } from "@/hooks/useUsers";

const roleLabels: Record<string, string> = {
  admin: "Admin", manager: "Gerente", technician: "Técnico",
  financial: "Financeiro", client: "Cliente", client_master: "Cliente Master",
};

export function UserRow({ user }: { user: UserListRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{user.full_name ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{user.email ?? "—"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <Badge variant="outline" className="border-status-warning text-status-warning">Sem papel</Badge>
          ) : user.roles.map((r) => <Badge key={r} variant="secondary">{roleLabels[r] ?? r}</Badge>)}
        </div>
      </TableCell>
      <TableCell className="text-sm">{user.client_name ?? "—"}</TableCell>
      <TableCell className="text-right">
        <UserActionsMenu user={user} />
      </TableCell>
    </TableRow>
  );
}
