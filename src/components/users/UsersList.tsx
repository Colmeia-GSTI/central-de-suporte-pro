import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { useDebounce } from "@/hooks/useDebounce";
import { UserRow } from "./UserRow";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { Enums } from "@/integrations/supabase/types";

const ROLE_OPTIONS: Array<{ value: Enums<"app_role"> | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Gerente" },
  { value: "technician", label: "Técnico" },
  { value: "financial", label: "Financeiro" },
  { value: "client", label: "Cliente" },
  { value: "client_master", label: "Cliente Master" },
];

export function UsersList() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Enums<"app_role"> | "all">("all");
  const debounced = useDebounce(search, 400);
  const { data: users = [], isLoading } = useUsers({ search: debounced, role });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as Enums<"app_role"> | "all")}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papéis</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}><td colSpan={5} className="p-3"><Skeleton className="h-8 w-full" /></td></TableRow>
                ))
              : users.length === 0
                ? <TableRow><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum usuário encontrado</td></TableRow>
                : users.slice(0, 50).map((u) => <UserRow key={u.user_id} user={u} />)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
