import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <ShieldX className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold mb-2">Acesso Não Autorizado</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        Você não tem permissão para acessar esta página. Entre em contato com o administrador se acredita que isso é um erro.
      </p>
      <div className="flex gap-4">
        <Button asChild variant="outline">
          <Link to="/">Voltar ao início</Link>
        </Button>
        <Button asChild>
          <Link to="/login">Fazer login</Link>
        </Button>
      </div>
    </div>
  );
}
