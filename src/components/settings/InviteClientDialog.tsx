import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function extractError(err: any): string {
  if (!err) return "Erro desconhecido";
  return (
    err.message ||
    err.details ||
    err.hint ||
    (err.code ? `Código ${err.code}` : null) ||
    "Erro desconhecido"
  );
}

export function InviteClientDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [clientId, setClientId] = useState("");
  const [role, setRole] = useState<"client" | "client_master">("client");
  const [search, setSearch] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-invite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const reset = () => {
    setEmail(""); setFullName(""); setClientId(""); setRole("client"); setSearch("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, full_name: fullName, role, client_id: clientId },
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

  const filtered = search.length >= 2
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients.slice(0, 10);

  const selectedClient = clients.find((c) => c.id === clientId);

  const canSubmit = email.includes("@") && fullName.trim().length >= 2 && clientId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar Cliente</DialogTitle>
          <DialogDescription>O usuário recebe um email para criar sua própria senha.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ic-email">Email *</Label>
            <Input id="ic-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ic-name">Nome completo *</Label>
            <Input id="ic-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João da Silva" />
          </div>
          <div className="space-y-1.5">
            <Label>Empresa *</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {selectedClient.name}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setClientId("")}>Trocar</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa..." className="pl-8" />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma empresa encontrada</p>
                  ) : filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClientId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                        "min-h-[40px]"
                      )}
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Papel *</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="gap-2">
              <label className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="client" className="mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Cliente comum</div>
                  <div className="text-xs text-muted-foreground">Abre e acompanha apenas seus próprios chamados</div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="client_master" className="mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Cliente master</div>
                  <div className="text-xs text-muted-foreground">Vê todos os chamados, contratos e faturas da empresa</div>
                </div>
              </label>
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
