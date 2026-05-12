import { Link } from "react-router-dom";
import { Ticket, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  fullName?: string | null;
  onSignOut: () => void;
}

export function ClientPortalHeader({ fullName, onSignOut }: Props) {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Portal do Cliente</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{fullName}</span>
          <Button variant="ghost" size="sm" asChild className="active:scale-[0.98] transition-transform">
            <Link to="/profile">
              <User className="h-4 w-4 mr-2" />
              Meu Perfil
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="active:scale-[0.98] transition-transform">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
