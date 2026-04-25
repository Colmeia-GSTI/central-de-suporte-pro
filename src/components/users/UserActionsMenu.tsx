import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Mail, KeyRound, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserListRow } from "@/hooks/useUsers";
import { ChangeRoleDialog } from "./ChangeRoleDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function UserActionsMenu({ user }: { user: UserListRow }) {
  const qc = useQueryClient();
  const [roleOpen, setRoleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const resendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("resend-confirmation", { body: { email: user.email } });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Email de confirmação reenviado"),
    onError: (e: Error) => toast.error(e.message || "Falha ao reenviar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("delete-user", { body: { user_id: user.user_id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRoleOpen(true)}>
            <Shield className="h-4 w-4 mr-2" /> Alterar papel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => resendMutation.mutate()} disabled={!user.email}>
            <Mail className="h-4 w-4 mr-2" /> Reenviar confirmação
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <KeyRound className="h-4 w-4 mr-2" /> Reset senha (em breve)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangeRoleDialog user={user} open={roleOpen} onOpenChange={setRoleOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O usuário {user.full_name ?? user.email} perderá acesso imediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
