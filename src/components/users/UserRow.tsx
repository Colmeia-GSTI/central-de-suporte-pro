import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { UserActionsMenu } from "./UserActionsMenu";
import type { UserListRow, UserStatus } from "@/hooks/useUsers";

const roleLabels: Record<string, string> = {
  admin: "Admin", manager: "Gerente", technician: "Técnico",
  financial: "Financeiro", client: "Cliente", client_master: "Cliente Master",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  inactive: "Inativo",
};

function StatusBadge({ status }: { status: UserStatus }) {
  if (status === "inactive") return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  if (status === "pending")
    return (
      <Badge variant="outline" className="border-status-warning text-status-warning">
        {STATUS_LABEL[status]}
      </Badge>
    );
  return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
}

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
      <TableCell><StatusBadge status={user.status} /></TableCell>
      <TableCell className="text-right">
        <UserActionsMenu user={user} />
      </TableCell>
    </TableRow>
  );
}
