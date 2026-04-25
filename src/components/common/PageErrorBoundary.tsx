import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  pageName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * PageErrorBoundary — Boundary local por página.
 *
 * Captura qualquer crash de render/effect dentro da página e:
 * 1) Loga em `application_logs` com nível "error" e contexto da página.
 * 2) Mostra UI custom com ações "Tentar novamente" e "Voltar".
 * 3) NÃO substitui o LazyErrorBoundary global — coexiste como primeira linha.
 */
export class PageErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { pageName } = this.props;
    console.error(`[PageErrorBoundary:${pageName}]`, error, errorInfo.componentStack);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: logError } = await supabase.from("application_logs").insert({
        level: "error",
        module: "ui",
        action: "page_crash",
        message: `Page crash: ${pageName} — ${error.message}`,
        user_id: user?.id ?? null,
        context: {
          page: pageName,
          error_message: error.message,
          error_stack: error.stack ?? null,
          component_stack: errorInfo.componentStack ?? null,
          url: typeof window !== "undefined" ? window.location.href : null,
        },
      });

      if (logError) {
        console.error(`[PageErrorBoundary:${pageName}] failed to log:`, logError);
      }
    } catch (logException) {
      console.error(`[PageErrorBoundary:${pageName}] exception while logging:`, logException);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleBack = () => {
    if (typeof window !== "undefined") {
      window.history.length > 1 ? window.history.back() : (window.location.href = "/");
    }
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Algo deu errado nesta página</CardTitle>
            <CardDescription>
              Já registramos o problema. Tente novamente ou volte para a tela anterior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {this.state.error?.message && (
              <div className="p-3 bg-muted rounded-lg text-xs font-mono text-muted-foreground overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <Button onClick={this.handleRetry} variant="default" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <Button onClick={this.handleBack} variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
