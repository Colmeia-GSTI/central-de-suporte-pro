import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, RotateCw, Trash2, RefreshCw, ExternalLink, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InviteClientDialog } from "./InviteClientDialog";
import { InviteStaffDialog } from "./InviteStaffDialog";

interface InviteRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  client_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by: string | null;
  clients: { name: string } | null;
  invited_by_profile: { full_name: string } | null;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  technician: "Técnico",
  financial: "Financeiro",
  client: "Cliente",
  client_master: "Cliente Master",
};

const roleColors: Record<string, string> = {
  admin: "bg-priority-critical text-white",
  manager: "bg-priority-high text-white",
  technician: "bg-status-progress text-white",
  financial: "bg-status-warning text-white",
  client: "bg-muted text-muted-foreground",
  client_master: "bg-primary text-primary-foreground",
};

function deriveStatus(row: InviteRow): "accepted" | "expired" | "pending" {
  if (row.accepted_at) return "accepted";
  if (new Date(row.expires_at) < new Date()) return "expired";
  return "pending";
}

function extractError(err: any): string {
  if (!err) return "Erro desconhecido";
  return err.message || err.details || err.hint || (err.code ? `Código ${err.code}` : null) || "Erro desconhecido";
}

export function PendingInvitesTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openClient, setOpenClient] = useState(false);
  const [openStaff, setOpenStaff] = useState(false);
  const [revokeId, setRevokeId] = useState<InviteRow | null>(null);

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["pending-invites"],
    queryFn: async () => {
      // Query principal sem JOIN em profiles (FK não declarada via PostgREST)
      const { data: rows, error } = await (supabase as any)
        .from("pending_invites")
        .select(`
          id, email, full_name, role, client_id, expires_at, accepted_at, created_at, invited_by,
          clients(name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (rows || []) as InviteRow[];

      // Carrega nomes dos invited_by em uma única query
      const inviterIds = Array.from(new Set(list.map((r) => r.invited_by).filter(Boolean))) as string[];
      if (inviterIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", inviterIds);
        const nameMap = new Map<string, string>((profs ?? []).map((p) => [p.user_id, p.full_name]));
        list.forEach((row) => {
          row.invited_by_profile = row.invited_by ? { full_name: nameMap.get(row.invited_by) ?? "—" } : null;
        });
      }

      return list;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const resendMutation = useMutation({
    mutationFn: async (invite_id: string) => {
      const { data, error } = await supabase.functions.invoke("resend-invite", { body: { invite_id } });
      if (error) throw error;
      if (data?.error) throw new Error(extractError(data));
      return data;
    },
    onSuccess: () => {
      toast.success("Email reenviado", { description: "Validade renovada por +7 dias." });
      qc.invalidateQueries({ queryKey: ["pending-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
    },
    onError: (err: any) => toast.error("Falha ao reenviar", { description: extractError(err) }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (invite_id: string) => {
      const { data, error } = await supabase.functions.invoke("revoke-invite", { body: { invite_id } });
      if (error) throw error;
      if (data?.error) throw new Error(extractError(data));
      return data;
    },
    onSuccess: () => {
      toast.success("Convite revogado");
      qc.invalidateQueries({ queryKey: ["pending-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
      setRevokeId(null);
    },
    onError: (err: any) => toast.error("Falha ao revogar", { description: extractError(err) }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Convites pendentes</h3>
          <p className="text-xs text-muted-foreground">Convites enviados aguardando aceite</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpenClient(true)}>
            <Mail className="mr-2 h-4 w-4" /> Convidar Cliente
          </Button>
          <Button variant="outline" onClick={() => setOpenStaff(true)}>
            <Mail className="mr-2 h-4 w-4" /> Convidar Staff
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Convidado por</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
            ) : invites.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum convite</TableCell></TableRow>
            ) : invites.map((inv) => {
              const status = deriveStatus(inv);
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>{inv.full_name}</TableCell>
                  <TableCell>
                    <Badge className={roleColors[inv.role] || "bg-muted"}>{roleLabels[inv.role] || inv.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {inv.client_id && inv.clients ? (
                      <Link to={`/clients/${inv.client_id}`} className="inline-flex items-center gap-1 text-sm hover:underline">
                        <Building2 className="h-3 w-3" /> {inv.clients.name}
                      </Link>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {status === "pending" && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pendente</Badge>}
                    {status === "expired" && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Expirado</Badge>}
                    {status === "accepted" && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Aceito</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.invited_by_profile?.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {status === "accepted"
                      ? "—"
                      : formatDistanceToNow(new Date(inv.expires_at), { locale: ptBR, addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate(inv.id)}>
                            <RotateCw className="mr-1 h-3 w-3" /> Reenviar
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setRevokeId(inv)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {status === "expired" && (
                        <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate(inv.id)}>
                          <RefreshCw className="mr-1 h-3 w-3" /> Renovar
                        </Button>
                      )}
                      {status === "accepted" && (
                        <Button size="sm" variant="ghost" onClick={() => navigate("/settings?tab=users")}>
                          <ExternalLink className="mr-1 h-3 w-3" /> Ver usuário
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <InviteClientDialog open={openClient} onOpenChange={setOpenClient} />
      <InviteStaffDialog open={openStaff} onOpenChange={setOpenStaff} />

      <ConfirmDialog
        open={!!revokeId}
        onOpenChange={(o) => !o && setRevokeId(null)}
        title="Revogar convite"
        description={`Revogar o convite de ${revokeId?.email}? O link enviado deixará de funcionar.`}
        confirmLabel="Revogar"
        variant="destructive"
        isLoading={revokeMutation.isPending}
        onConfirm={() => revokeId && revokeMutation.mutate(revokeId.id)}
      />
    </div>
  );
}
