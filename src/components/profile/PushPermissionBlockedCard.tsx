import { AlertTriangle, RefreshCw, ExternalLink, Settings } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PushPermissionBlockedCardProps {
  onRetry: () => void;
  isLoading?: boolean;
}

export function PushPermissionBlockedCard({ onRetry, isLoading }: PushPermissionBlockedCardProps) {
  // Detect browser for specific instructions
  const getBrowserInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes("chrome") && !userAgent.includes("edg")) {
      return {
        browser: "Chrome",
        steps: [
          "Clique no ícone de cadeado (🔒) na barra de endereço",
          "Selecione 'Configurações do site'",
          "Em 'Notificações', altere para 'Permitir'",
          "Recarregue a página"
        ]
      };
    }
    
    if (userAgent.includes("firefox")) {
      return {
        browser: "Firefox",
        steps: [
          "Clique no ícone de cadeado (🔒) na barra de endereço",
          "Clique em 'Conexão segura' → 'Mais informações'",
          "Na aba 'Permissões', encontre 'Enviar notificações'",
          "Desmarque 'Usar padrão' e selecione 'Permitir'"
        ]
      };
    }
    
    if (userAgent.includes("edg")) {
      return {
        browser: "Edge",
        steps: [
          "Clique no ícone de cadeado (🔒) na barra de endereço",
          "Clique em 'Permissões deste site'",
          "Em 'Notificações', altere para 'Permitir'",
          "Recarregue a página"
        ]
      };
    }
    
    if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
      return {
        browser: "Safari",
        steps: [
          "Vá em Safari → Preferências → Sites",
          "Selecione 'Notificações' na lista à esquerda",
          "Encontre este site e altere para 'Permitir'",
          "Recarregue a página"
        ]
      };
    }
    
    return {
      browser: "seu navegador",
      steps: [
        "Acesse as configurações do navegador",
        "Procure por 'Permissões de site' ou 'Notificações'",
        "Encontre este site e permita notificações",
        "Recarregue a página"
      ]
    };
  };

  const instructions = getBrowserInstructions();

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardContent className="pt-6 space-y-4">
        <Alert variant="default" className="border-warning bg-warning/10">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <AlertTitle className="text-warning font-semibold">
            Notificações bloqueadas
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            Seu navegador bloqueou as notificações para este site. 
            Siga as instruções abaixo para reativar.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Settings className="h-4 w-4" />
            Como reativar no {instructions.browser}:
          </div>
          
          <ol className="space-y-2 text-sm">
            {instructions.steps.map((step, index) => (
              <li key={index} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRetry}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Verificar novamente
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="gap-2 text-muted-foreground"
          >
            <a 
              href="https://support.google.com/chrome/answer/3220216" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              Ajuda
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
