import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags, type FeatureFlag } from "@/hooks/useFeatureFlag";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Flag, Plus, Pencil, Trash2 } from "lucide-react";

interface FlagFormState {
  id?: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  enabled_for_roles: string;
  enabled_for_user_ids: string;
}

const EMPTY_FORM: FlagFormState = {
  key: "",
  description: "",
  enabled: false,
  rollout_percentage: 0,
  enabled_for_roles: "",
  enabled_for_user_ids: "",
};

function parseList(s: string): string[] | null {
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

export default function FeatureFlagsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: flags, isLoading } = useFeatureFlags();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FlagFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<FeatureFlag | null>(null);

  const upsert = useMutation({
    mutationFn: async (state: FlagFormState) => {
      const payload = {
        key: state.key.trim(),
        description: state.description.trim() || null,
        enabled: state.enabled,
        rollout_percentage: Math.max(0, Math.min(100, Number(state.rollout_percentage) || 0)),
        enabled_for_roles: parseList(state.enabled_for_roles),
        enabled_for_user_ids: parseList(state.enabled_for_user_ids),
        updated_by: user?.id ?? null,
      };
      if (state.id) {
        const { error } = await supabase
          .from("feature_flags")
          .update(payload)
          .eq("id", state.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("feature_flags").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      toast.success("Flag salva");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => {
      console.error("[FeatureFlagsPage] upsert", e);
      toast.error("Erro ao salvar flag", { description: e.message });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feature_flags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature_flags"] });
      toast.success("Flag removida");
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      console.error("[FeatureFlagsPage] delete", e);
      toast.error("Erro ao remover", { description: e.message });
    },
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(f: FeatureFlag) {
    setForm({
      id: f.id,
      key: f.key,
      description: f.description ?? "",
      enabled: f.enabled,
      rollout_percentage: f.rollout_percentage ?? 0,
      enabled_for_roles: (f.enabled_for_roles ?? []).join(", "),
      enabled_for_user_ids: (f.enabled_for_user_ids ?? []).join(", "),
    });
    setDialogOpen(true);
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flag className="h-6 w-6 text-primary" />
              Feature Flags
            </h1>
            <p className="text-sm text-muted-foreground">
              Ative ou desative funcionalidades em runtime sem precisar de novo deploy.
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova flag
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : !flags || flags.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Flag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma flag cadastrada ainda.</p>
              <Button onClick={openNew} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Criar primeira flag
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {flags.map((f) => (
              <Card key={f.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-mono break-all">{f.key}</CardTitle>
                      {f.description && (
                        <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          f.enabled
                            ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {f.enabled ? "Ativa" : "Inativa"}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(f)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(f)}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>Rollout: {f.rollout_percentage ?? 0}%</span>
                  {f.enabled_for_roles?.length ? (
                    <span>Roles: {f.enabled_for_roles.join(", ")}</span>
                  ) : null}
                  {f.enabled_for_user_ids?.length ? (
                    <span>Users: {f.enabled_for_user_ids.length}</span>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar flag" : "Nova flag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="key">Chave (snake_case)</Label>
              <Input
                id="key"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="ex: new_billing_dashboard"
                disabled={!!form.id}
              />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Ativada</Label>
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>
            <div>
              <Label htmlFor="rollout">Rollout (%)</Label>
              <Input
                id="rollout"
                type="number"
                min={0}
                max={100}
                value={form.rollout_percentage}
                onChange={(e) =>
                  setForm({ ...form, rollout_percentage: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label htmlFor="roles">Roles permitidas (separadas por vírgula)</Label>
              <Input
                id="roles"
                value={form.enabled_for_roles}
                onChange={(e) => setForm({ ...form, enabled_for_roles: e.target.value })}
                placeholder="admin, manager"
              />
            </div>
            <div>
              <Label htmlFor="users">User IDs permitidos (separados por vírgula)</Label>
              <Input
                id="users"
                value={form.enabled_for_user_ids}
                onChange={(e) => setForm({ ...form, enabled_for_user_ids: e.target.value })}
                placeholder="uuid1, uuid2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => upsert.mutate(form)}
              disabled={upsert.isPending || !form.key.trim()}
            >
              {upsert.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover flag?</AlertDialogTitle>
            <AlertDialogDescription>
              A flag <span className="font-mono">{deleteTarget?.key}</span> será removida
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              disabled={remove.isPending}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
