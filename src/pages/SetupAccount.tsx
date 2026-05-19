import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Building2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface InviteInfo {
  valid: boolean;
  reason?: "not_found" | "already_used" | "expired";
  email?: string;
  full_name?: string;
  role?: string;
  client_name?: string | null;
  expires_at?: string;
}

const reasonLabels: Record<string, string> = {
  not_found: "Convite não encontrado ou link inválido.",
  already_used: "Este convite já foi utilizado. Faça login normalmente.",
  expired: "Convite expirado. Solicite um novo ao administrador.",
};

export default function SetupAccountPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInfo({ valid: false, reason: "not_found" });
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_invite_info", { p_token: token });
      if (error) {
        setInfo({ valid: false, reason: "not_found" });
      } else {
        setInfo(data as InviteInfo);
      }
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info?.valid || !info.email || !token) return;
    if (password.length < 8) {
      toast({ title: "Senha muito curta", description: "Mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // 1. signUp do Supabase (trigger valida que existe convite pendente)
    const { error: signUpErr } = await supabase.auth.signUp({
      email: info.email,
      password,
      options: {
        data: { full_name: info.full_name ?? "" },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (signUpErr) {
      setSubmitting(false);
      toast({
        title: "Não foi possível criar a conta",
        description: signUpErr.message,
        variant: "destructive",
      });
      return;
    }

    // 2. Como Supabase pode exigir confirmação por email, tenta signIn imediato com a senha
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: info.email,
      password,
    });
    if (signInErr) {
      setSubmitting(false);
      toast({
        title: "Conta criada — confirme seu email",
        description: "Enviamos um link de confirmação para o seu email. Após confirmar, faça login.",
      });
      navigate("/login");
      return;
    }

    // 3. Chama RPC para criar vínculos (role + client_contacts + profile + marca aceito)
    const { data: result, error: acceptErr } = await supabase.rpc("accept_invite", { p_token: token });
    if (acceptErr) {
      setSubmitting(false);
      toast({
        title: "Erro ao ativar conta",
        description: acceptErr.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Conta ativada com sucesso!" });
    const redirect = (result as { redirect?: string })?.redirect || "/";
    navigate(redirect);
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Convite inválido</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {reasonLabels[info?.reason ?? "not_found"]}
              </AlertDescription>
            </Alert>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
              Ir para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Ativar minha conta</CardTitle>
          <CardDescription>Crie uma senha para acessar a Colmeia HD.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertTitle>Convite válido</AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <div><strong>Email:</strong> {info.email}</div>
              {info.full_name && <div><strong>Nome:</strong> {info.full_name}</div>}
              {info.client_name && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  <strong>Empresa:</strong> {info.client_name}
                </div>
              )}
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="password">Senha (mínimo 8 caracteres)</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ativando...
                </>
              ) : "Ativar conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
