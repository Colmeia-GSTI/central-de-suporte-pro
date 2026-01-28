import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft, Search, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-2xl rotate-12 opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Hexagon className="h-12 w-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-gradient">404</h1>
          <h2 className="text-xl font-semibold text-foreground">
            Página não encontrada
          </h2>
          <p className="text-muted-foreground">
            A página que você está procurando não existe ou foi movida.
          </p>
          <p className="text-sm text-muted-foreground/70 font-mono">
            {location.pathname}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild variant="default" className="w-full sm:w-auto">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Ir para Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto" onClick={() => window.history.back()}>
            <Link to="#" onClick={(e) => { e.preventDefault(); window.history.back(); }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
