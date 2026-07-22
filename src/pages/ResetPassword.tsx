import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Hexagon, ArrowLeft, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { logger } from "@/lib/logger";

type Status = "loading" | "ready" | "invalid" | "submitting" | "success";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isForced = params.get("forced") === "1";

  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    // Modo "forçado": usuário já tem sessão e foi redirecionado pelo flag must_change_password
    if (isForced) {
      (async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setStatus("ready");
        } else {
          setErrorMsg("Sessão não encontrada. Faça login novamente.");
          setStatus("invalid");
        }
      })();
      return () => { cancelled = true; };
    }

    // Modo recovery: aguarda o evento PASSWORD_RECOVERY ou sessão já estabelecida via token
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      logger.debug("[ResetPassword] auth event", "Auth", { event, hasSession: !!session });
      if (event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
      }
    });

    // Fallback: se já houver sessão dentro de poucos segundos (PKCE/hash já processado), libera o formulário
    const timeout = window.setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStatus("ready");
      } else {
        setErrorMsg("Link de recuperação inválido ou expirado. Solicite um novo.");
        setStatus("invalid");
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, [isForced]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Senha muito curta", { description: "Mínimo 8 caracteres." });
      return;
    }
    if (password !== confirm) {
      toast.error("Senhas não conferem");
      return;
    }
    setStatus("submitting");

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Limpa flag must_change_password (se existir) — não bloqueia o fluxo se falhar
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("user_id", user.id);
        }
      } catch (e) {
        logger.warn("[ResetPassword] Falha ao limpar must_change_password", "Auth", { error: String(e) });
      }

      setStatus("success");
      toast.success("Senha redefinida!", { description: "Faça login com a nova senha." });

      // Desloga e leva pro login pra evitar sessão de recovery ativa
      await supabase.auth.signOut();
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao redefinir senha";
      logger.error("[ResetPassword] update failed", "Auth", { error: msg });
      toast.error("Erro ao redefinir senha", { description: msg });
      setStatus("ready");
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            {status === "success" ? (
              <CheckCircle2 className="h-7 w-7 text-primary-foreground" />
            ) : status === "invalid" ? (
              <AlertCircle className="h-7 w-7 text-primary-foreground" />
            ) : (
              <KeyRound className="h-7 w-7 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {status === "success" ? "Senha redefinida" : status === "invalid" ? "Link inválido" : "Definir nova senha"}
          </CardTitle>
          <CardDescription>
            {isForced
              ? "Por segurança, você precisa definir uma nova senha antes de continuar."
              : "Escolha uma nova senha para acessar sua conta."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {status === "loading" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {status === "invalid" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível continuar</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {(status === "ready" || status === "submitting") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={status === "submitting"}
                />
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirme a nova senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={status === "submitting"}
                />
              </div>
              <Button type="submit" className="w-full" disabled={status === "submitting"}>
                {status === "submitting" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                ) : (
                  "Redefinir senha"
                )}
              </Button>
            </form>
          )}

          {status === "success" && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Tudo certo!</AlertTitle>
              <AlertDescription>Redirecionando para o login...</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {status === "invalid" && (
            <Link to="/forgot-password" className="w-full">
              <Button variant="default" className="w-full">Solicitar novo link</Button>
            </Link>
          )}
          {!isForced && (
            <Link to="/login" className="w-full">
              <Button variant="ghost" className="w-full gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar para o login
              </Button>
            </Link>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
