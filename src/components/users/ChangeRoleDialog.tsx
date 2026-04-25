import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { UserListRow } from "@/hooks/useUsers";
import type { Enums } from "@/integrations/supabase/types";

const ROLES: Array<{ v: Enums<"app_role">; l: string }> = [
  { v: "admin", l: "Administrador" },
  { v: "manager", l: "Gerente" },
  { v: "technician", l: "Técnico" },
  { v: "financial", l: "Financeiro" },
  { v: "client", l: "Cliente" },
  { v: "client_master", l: "Cliente Master" },
];

export function ChangeRoleDialog({
  user, open, onOpenChange,
}: { user: UserListRow; open: boolean; onOpenChange: (b: boolean) => void }) {
  const qc = useQueryClient();
  const [newRole, setNewRole] = useState<Enums<"app_role">>(user.roles[0] ?? "client");

  const mutation = useMutation({
    mutationFn: async () => {
      // Replace all roles with the chosen one — audit trigger logs delete+insert
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", user.user_id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: user.user_id, role: newRole });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Papel alterado");
      qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao alterar papel"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar papel — {user.full_name ?? user.email}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Novo papel</Label>
          <Select value={newRole} onValueChange={(v) => setNewRole(v as Enums<"app_role">)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">A alteração é registrada em auditoria.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
