import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils";
import {
  MERGEABLE_FIELDS,
  type MergeableClient,
  type MergeableField,
  previewMerge,
} from "@/lib/client-merge";

interface DuplicateGroupClient extends MergeableClient {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  contracts_count?: number;
  tickets_count?: number;
  invoices_count?: number;
  contacts_count?: number;
}

interface MergeClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: DuplicateGroupClient[];
}

const FIELD_LABELS: Record<MergeableField, string> = {
  name: "Nome",
  trade_name: "Nome fantasia",
  nickname: "Apelido",
  email: "Email",
  financial_email: "Email financeiro",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  address: "Endereço",
  city: "Cidade",
  state: "UF",
  zip_code: "CEP",
  state_registration: "Inscrição estadual",
  notes: "Observações",
};

export function MergeClientsDialog({ open, onOpenChange, group }: MergeClientsDialogProps) {
  const [step, setStep] = useState(1);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<MergeableField, string>>>({});
  const [confirmText, setConfirmText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryClient = useQueryClient();

  const target = group.find((c) => c.id === targetId);
  const source = group.find((c) => c.id !== targetId);

  const reset = () => {
    setStep(1);
    setTargetId(null);
    setOverrides({});
    setConfirmText("");
    setShowAdvanced(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!source || !target) throw new Error("Seleção inválida");
      const { data, error } = await supabase.rpc("merge_clients" as never, {
        source_id: source.id,
        target_id: target.id,
        field_overrides: overrides as never,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Clientes mesclados com sucesso");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["duplicate-clients"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      handleClose(false);
    },
    onError: (err) => {
      const msg = getErrorMessage(err);
      logger.error("merge_clients failed", "Clients", { error: msg });
      toast.error("Erro ao mesclar", { description: msg });
    },
  });

  const preview = source && target ? previewMerge(source, target, overrides) : [];
  const sourceNameMatch = source && confirmText.trim() === source.name.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mesclar clientes duplicados — Passo {step} de 3</DialogTitle>
          <DialogDescription>
            {step === 1 && "Selecione o cliente que será mantido (destino)."}
            {step === 2 && "Confirme os campos a serem preservados."}
            {step === 3 && "Confirme a operação. Ela é irreversível."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && group.length > 2 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Grupos com 3+ duplicatas não suportados nesta versão — mescle em pares.
            </AlertDescription>
          </Alert>
        )}

        {step === 1 && group.length <= 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.map((c) => (
              <Card
                key={c.id}
                className={`cursor-pointer transition ${
                  targetId === c.id ? "border-primary ring-2 ring-primary" : ""
                }`}
                onClick={() => setTargetId(c.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {c.name}
                    {targetId === c.id && <Badge>Destino</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <div>CNPJ: {c.document || "—"}</div>
                  <div>Email: {c.email || "—"}</div>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <Badge variant="outline">{c.contracts_count ?? 0} contratos</Badge>
                    <Badge variant="outline">{c.tickets_count ?? 0} chamados</Badge>
                    <Badge variant="outline">{c.invoices_count ?? 0} faturas</Badge>
                    <Badge variant="outline">{c.contacts_count ?? 0} contatos</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {step === 2 && source && target && (
          <div className="space-y-3">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Por padrão o destino prevalece. Campos vazios no destino são preenchidos pelo source.
                Use "Customizar" para sobrescrever manualmente.
              </AlertDescription>
            </Alert>

            <div className="border rounded-md divide-y">
              {preview.map((row) => {
                const sv = source[row.field];
                const tv = target[row.field];
                const isOverridden = overrides[row.field] !== undefined;
                return (
                  <div key={row.field} className="grid grid-cols-12 gap-2 p-2 text-sm items-center">
                    <div className="col-span-3 font-medium">{FIELD_LABELS[row.field]}</div>
                    <div className="col-span-3 text-xs text-muted-foreground truncate">
                      Source: {String(sv ?? "—")}
                    </div>
                    <div className="col-span-3 text-xs text-muted-foreground truncate">
                      Destino: {String(tv ?? "—")}
                    </div>
                    <div className="col-span-3 flex items-center gap-1">
                      {showAdvanced ? (
                        <Input
                          value={overrides[row.field] ?? String(row.finalValue ?? "")}
                          onChange={(e) =>
                            setOverrides({ ...overrides, [row.field]: e.target.value })
                          }
                          className="h-7 text-xs"
                        />
                      ) : (
                        <Badge variant={row.conflict ? "destructive" : "outline"} className="text-xs">
                          {isOverridden ? "Custom" : row.origin === "source" ? "← Source" : row.origin === "target" ? "Destino" : "—"}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Ocultar customização" : "Customizar campos manualmente"}
            </Button>
          </div>
        )}

        {step === 3 && source && target && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Esta ação é irreversível. O cliente <strong>{source.name}</strong> será deletado e
                todos os vínculos migrados para <strong>{target.name}</strong>.
              </AlertDescription>
            </Alert>

            <div className="text-sm space-y-1">
              <div>• Contratos a migrar: {source.contracts_count ?? 0}</div>
              <div>• Chamados a migrar: {source.tickets_count ?? 0}</div>
              <div>• Faturas a migrar: {source.invoices_count ?? 0}</div>
              <div>• Contatos a migrar: {source.contacts_count ?? 0}</div>
              <div>• Campos sobrescritos manualmente: {Object.keys(overrides).length}</div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-name">
                Digite o nome do cliente <strong>source</strong> ({source.name}) para confirmar:
              </Label>
              <Input
                id="confirm-name"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={source.name}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={mergeMutation.isPending}>
              Voltar
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !targetId) || group.length < 2 || group.length > 2}
            >
              Próximo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="destructive"
              onClick={() => mergeMutation.mutate()}
              disabled={!sourceNameMatch || mergeMutation.isPending}
            >
              {mergeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mesclar definitivamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
