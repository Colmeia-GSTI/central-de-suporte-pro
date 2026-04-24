import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket, Loader2, Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Por favor, verifique se as senhas são iguais.");
      return;
    }

    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, fullName);

    if (error) {
      toast.error(error.message);
      setIsLoading(false);
      return;
    }

    setSignedUpEmail(email);
    setIsLoading(false);
  };

  const handleResend = async () => {
    if (!signedUpEmail) return;
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-confirmation", {
        body: { email: signedUpEmail },
      });

      if (error || data?.error === "rate_limited") {
        const isRate = data?.error === "rate_limited" || /429/.test(error?.message ?? "");
        if (isRate) {
          toast.warning("Aguarde alguns minutos antes de solicitar novamente.");
        } else {
          toast.error(data?.error || error?.message || "Não foi possível reenviar.");
        }
        return;
      }

      if (data?.already_confirmed) {
        toast.success("Conta já ativada. Faça login normalmente.");
        navigate("/login");
        return;
      }

      toast.success("Email reenviado. Verifique sua caixa de entrada e spam.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            {signedUpEmail ? (
              <MailCheck className="h-6 w-6 text-primary-foreground" />
            ) : (
              <Ticket className="h-6 w-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {signedUpEmail ? "Cadastro realizado!" : "Criar Conta"}
          </CardTitle>
          <CardDescription>
            {signedUpEmail
              ? <>Enviamos um email de confirmação para <strong>{signedUpEmail}</strong>.<br />Clique no link para ativar sua conta.</>
              : "Preencha os dados para se cadastrar"}
          </CardDescription>
        </CardHeader>

        {signedUpEmail ? (
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full"
              disabled={resending}
              onClick={handleResend}
            >
              {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reenviar email
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Não recebeu? Verifique sua pasta de spam ou clique em Reenviar após alguns minutos.
            </p>
            <Link to="/login" className="text-sm text-primary hover:underline">
              Ir para o login
            </Link>
          </CardFooter>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  "Cadastrar"
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Já tem uma conta?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Fazer login
                </Link>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
