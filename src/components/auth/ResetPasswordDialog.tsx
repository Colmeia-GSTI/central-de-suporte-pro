import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, KeyRound, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  onSuccess?: () => void;
}

type Mode = "generate" | "manual";

export function ResetPasswordDialog({
  open, onOpenChange, userId, userName, userEmail, onSuccess,
}: ResetPasswordDialogProps) {
  const [mode, setMode] = useState<Mode>("generate");
  const [manualPassword, setManualPassword] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [mustChange, setMustChange] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setMode("generate");
    setManualPassword("");
    setNotifyEmail(true);
    setMustChange(true);
    setGeneratedPassword(null);
    setCopied(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Usuário inválido");
      const body: Record<string, unknown> = {
        user_id: userId,
        notify_email: notifyEmail,
        must_change: mustChange,
      };
      if (mode === "generate") {
        body.generate = true;
      } else {
        if (manualPassword.length < 8) throw new Error("Senha mínima de 8 caracteres");
        body.new_password = manualPassword;
      }
      const { data, error } = await supabase.functions.invoke("reset-password", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { generated_password?: string; email_sent: boolean };
    },
    onSuccess: (data) => {
      if (data.generated_password) {
        setGeneratedPassword(data.generated_password);
        toast("Senha temporária gerada", {
          description: data.email_sent ? "Email de aviso enviado ao usuário." : "Copie e entregue a senha ao usuário.",
        });
      } else {
        toast.success("Senha redefinida", {
          description: data.email_sent ? "Email de aviso enviado." : "Senha alterada com sucesso.",
        });
        onSuccess?.();
        handleClose(false);
      }
    },
    onError: (err: Error) => {
      toast.error("Erro ao redefinir senha", { description: err.message });
    },
  });

  const handleCopy = async () => {
    if (!generatedPassword) return;
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Redefinir senha
          </DialogTitle>
          <DialogDescription>
            {userName ? <>Usuário: <strong>{userName}</strong>{userEmail ? ` (${userEmail})` : ""}</> : "Selecione o método abaixo."}
          </DialogDescription>
        </DialogHeader>

        {generatedPassword ? (
          <div className="space-y-3">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Senha temporária pronta</AlertTitle>
              <AlertDescription>Copie agora — não será mostrada novamente.</AlertDescription>
            </Alert>
            <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
              <code className="flex-1 font-mono text-sm break-all select-all">{generatedPassword}</code>
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            {mustChange && (
              <p className="text-xs text-muted-foreground">
                O usuário será obrigado a definir uma nova senha no próximo login.
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => { onSuccess?.(); handleClose(false); }}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <div className="flex items-start space-x-2 p-3 border rounded-md">
                <RadioGroupItem value="generate" id="m-gen" className="mt-1" />
                <Label htmlFor="m-gen" className="flex-1 cursor-pointer">
                  <div className="font-medium">Gerar senha temporária (recomendado)</div>
                  <div className="text-xs text-muted-foreground">Senha forte aleatória de 14 caracteres. Mostrada uma única vez.</div>
                </Label>
              </div>
              <div className="flex items-start space-x-2 p-3 border rounded-md">
                <RadioGroupItem value="manual" id="m-man" className="mt-1" />
                <Label htmlFor="m-man" className="flex-1 cursor-pointer">
                  <div className="font-medium">Definir senha manualmente</div>
                  <div className="text-xs text-muted-foreground">Use apenas se necessário. Mínimo 8 caracteres.</div>
                </Label>
              </div>
            </RadioGroup>

            {mode === "manual" && (
              <div className="space-y-2">
                <Label htmlFor="manual-pw">Nova senha</Label>
                <Input
                  id="manual-pw"
                  type="text"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox id="notify" checked={notifyEmail} onCheckedChange={(c) => setNotifyEmail(!!c)} />
                <Label htmlFor="notify" className="text-sm cursor-pointer">
                  Notificar usuário por email (sem incluir a senha)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="must" checked={mustChange} onCheckedChange={(c) => setMustChange(!!c)} />
                <Label htmlFor="must" className="text-sm cursor-pointer">
                  Forçar troca no próximo login
                </Label>
              </div>
            </div>

            {!mustChange && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Atenção: o usuário continuará com a senha definida por você.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</> : "Redefinir senha"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
