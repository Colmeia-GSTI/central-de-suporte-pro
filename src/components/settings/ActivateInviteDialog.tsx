import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, Copy, Wand2, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: { id: string; email: string; full_name: string } | null;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
  return out;
}

export function ActivateInviteDialog({ open, onOpenChange, invite }: Props) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [activated, setActivated] = useState(false);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error("Convite inválido");
      const { data, error } = await supabase.functions.invoke("activate-invite-manually", {
        body: { invite_id: invite.id, password },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Conta ativada com sucesso");
      setActivated(true);
      qc.invalidateQueries({ queryKey: ["pending-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
    },
    onError: (err: any) => toast.error("Falha ao ativar", { description: err?.message ?? "Erro desconhecido" }),
  });

  const handleClose = (o: boolean) => {
    if (!o) {
      setPassword("");
      setActivated(false);
      setCopied(false);
    }
    onOpenChange(o);
  };

  const credentials = invite ? `Email: ${invite.email}\nSenha: ${password}` : "";
  const handleCopy = async () => {
    await navigator.clipboard.writeText(credentials);
    setCopied(true);
    toast.success("Credenciais copiadas");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Ativar manualmente
          </DialogTitle>
          <DialogDescription>
            Defina uma senha e ative a conta sem precisar do link de email. Você poderá copiar as credenciais para enviar ao usuário.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={invite?.email ?? ""} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Senha (mínimo 8 caracteres)</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite ou gere uma senha"
                disabled={activated}
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} disabled={activated} title="Gerar senha aleatória">
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {activated && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium">Credenciais geradas — envie ao usuário:</p>
              <pre className="text-xs whitespace-pre-wrap break-all">{credentials}</pre>
              <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="w-full">
                {copied ? <Check className="mr-2 h-3 w-3" /> : <Copy className="mr-2 h-3 w-3" />}
                {copied ? "Copiado!" : "Copiar credenciais"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {activated ? (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={() => mutation.mutate()} disabled={password.length < 8 || mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Ativar e mostrar credenciais
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
