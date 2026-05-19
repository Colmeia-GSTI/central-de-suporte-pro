import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export default function Register() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Cadastro por convite</CardTitle>
          </div>
          <CardDescription>
            O acesso à Colmeia HD é feito apenas mediante convite enviado pelo administrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Se você já recebeu um email de convite, clique no botão "Ativar minha conta"
            dentro do email para criar sua senha.
          </p>
          <p className="text-sm text-muted-foreground">
            Caso não tenha recebido, entre em contato com o administrador do sistema.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Já tenho conta — fazer login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
