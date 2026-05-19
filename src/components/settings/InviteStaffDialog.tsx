import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STAFF_ROLES = [
  { value: "admin", label: "Administrador", desc: "Acesso total ao sistema" },
  { value: "manager", label: "Gerente", desc: "Gestão de equipe e operação" },
  { value: "technician", label: "Técnico", desc: "Atende chamados" },
  { value: "financial", label: "Financeiro", desc: "Faturamento, NFS-e, cobranças" },
] as const;

function extractError(err: any): string {
  if (!err) return "Erro desconhecido";
  return err.message || err.details || err.hint || (err.code ? `Código ${err.code}` : null) || "Erro desconhecido";
}

export function InviteStaffDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<typeof STAFF_ROLES[number]["value"]>("technician");

  const reset = () => { setEmail(""); setFullName(""); setRole("technician"); };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, full_name: fullName, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(extractError(data));
      return data;
    },
    onSuccess: () => {
      toast.success("Convite enviado", { description: `Email enviado para ${email}` });
      qc.invalidateQueries({ queryKey: ["pending-invites"] });
      qc.invalidateQueries({ queryKey: ["pending-invites-count"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Falha ao enviar convite", { description: extractError(err) }),
  });

  const canSubmit = email.includes("@") && fullName.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro da equipe</DialogTitle>
          <DialogDescription>O usuário recebe um email para criar sua própria senha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="is-email">Email *</Label>
            <Input id="is-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@colmeiagsti.com.br" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="is-name">Nome completo *</Label>
            <Input id="is-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Maria Souza" />
          </div>
          <div className="space-y-1.5">
            <Label>Papel *</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="gap-2">
              {STAFF_ROLES.map((r) => (
                <label key={r.value} className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/30">
                  <RadioGroupItem value={r.value} className="mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.desc}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
