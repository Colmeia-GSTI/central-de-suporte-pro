import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
}

interface PreviewResult {
  can_delete: boolean;
  blockers: Array<{ type: string; count: number }>;
}

const BLOCKER_LABELS: Record<string, string> = {
  active_contracts: "contratos ativos",
  open_tickets: "chamados abertos",
  pending_invoices: "faturas pendentes/vencidas",
};

export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  const { roles } = usePermissions();
  const isAdmin = roles.includes("admin");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPreview(null);
      setConfirmText("");
      return;
    }
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.rpc("delete_client_safely" as never, {
        p_client_id: clientId,
        p_preview: true,
      } as never);
      if (error) throw error;
      setPreview(data as unknown as PreviewResult);
    } catch (err) {
      toast.error("Erro ao verificar bloqueios", { description: getErrorMessage(err) });
      setOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_client_safely" as never, {
        p_client_id: clientId,
        p_preview: false,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cliente excluído");
      navigate("/clients");
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      logger.error("delete_client_safely failed", "Clients", { error: msg });
      toast.error("Erro ao excluir", { description: msg });
    },
  });

  if (!isAdmin) return null;

  const canSubmit = preview?.can_delete && confirmText.trim() === clientName.trim();

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => handleOpen(true)}>
        <Trash2 className="mr-2 h-4 w-4" /> Excluir cliente
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir {clientName}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {loadingPreview && (
                  <p className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verificando vínculos…
                  </p>
                )}

                {preview && !preview.can_delete && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                    <p className="font-medium mb-1">Não é possível excluir. Bloqueios:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {preview.blockers.map((b) => (
                        <li key={b.type}>
                          {b.count} {BLOCKER_LABELS[b.type] ?? b.type}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview?.can_delete && (
                  <>
                    <p className="text-sm">
                      Esta ação é irreversível. Para confirmar, digite o nome exato do cliente:
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor="confirm-client-name">{clientName}</Label>
                      <Input
                        id="confirm-client-name"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => handleOpen(false)} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!canSubmit || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir definitivamente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
