import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LinkClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  onSuccess?: () => void;
}

const STAFF_ROLES = ["admin", "manager", "technician", "financial"];

export function LinkClientDialog({ open, onOpenChange, userId, userName, onSuccess }: LinkClientDialogProps) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients-for-linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, document, nickname")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_contacts").insert({
        client_id: clientId,
        user_id: userId,
        name: userName,
        is_primary: false,
        is_active: true,
      });
      if (error) throw error;

      // Atribui papel "client" apenas se o usuário ainda não tem papel algum.
      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const hasClientRole = existingRoles?.some((r) => r.role === "client" || r.role === "client_master");
      const hasStaffRole = existingRoles?.some((r) => STAFF_ROLES.includes(r.role));
      if (!hasClientRole && !hasStaffRole) {
        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role: "client" });
        if (roleError) console.error("[LinkClient] Falha ao atribuir role client:", roleError.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-client-links"] });
      toast.success("Usuário vinculado à empresa com sucesso");
      setClientId("");
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao vincular empresa"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setClientId(""); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular à empresa</DialogTitle>
          <DialogDescription>
            Vincule <strong>{userName}</strong> a uma empresa cliente.
          </DialogDescription>
        </DialogHeader>
        <ClientSearchCombobox
          clients={clients}
          value={clientId}
          onChange={setClientId}
          loading={isLoading}
          placeholder="Selecione a empresa..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!clientId || mutation.isPending}>
            {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vinculando...</> : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
