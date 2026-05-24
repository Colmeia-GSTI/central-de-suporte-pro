import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";

export function ChangePasswordCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const handleSubmit = async () => {
    if (!user?.email) return;

    if (next.length < 8) {
      toast({ title: "Senha muito curta", description: "Mínimo de 8 caracteres.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Senhas não coincidem", description: "Confirme a nova senha corretamente.", variant: "destructive" });
      return;
    }
    if (next === current) {
      toast({ title: "Senha igual à atual", description: "Escolha uma senha diferente da atual.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Reautenticação: valida a senha atual
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInError) {
        toast({ title: "Senha atual incorreta", description: "Verifique e tente novamente.", variant: "destructive" });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;

      // Garante limpeza da flag must_change_password (se existir)
      await supabase
        .from("profiles")
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      toast({
        title: "Senha alterada",
        description: "Sua senha foi atualizada com sucesso.",
      });
      reset();
    } catch (error) {
      logger.error("Error changing password", "Profile", { error: String(error) });
      toast({
        title: "Erro ao alterar senha",
        description: "Não foi possível atualizar sua senha. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Alterar Senha
        </CardTitle>
        <CardDescription>
          Para alterar sua senha, informe a senha atual e a nova senha (mínimo 8 caracteres).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="current_password">Senha atual</Label>
          <div className="relative">
            <Input
              id="current_password"
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1 h-8 w-8"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Ocultar senhas" : "Mostrar senhas"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new_password">Nova senha</Label>
          <Input
            id="new_password"
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirmar nova senha</Label>
          <Input
            id="confirm_password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSubmit}
            disabled={loading || !current || !next || !confirm}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Alterar Senha
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
