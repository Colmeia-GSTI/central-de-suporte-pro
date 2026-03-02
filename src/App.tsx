import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { useUnifiedRealtime } from "@/hooks/useUnifiedRealtime";
import { toast } from "sonner";

// Optimized QueryClient with aggressive caching to prevent flickering
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

// Component to initialize unified realtime
function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useUnifiedRealtime();
  return <>{children}</>;
}

// Global error handler to prevent silent white-screen crashes
function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[GlobalErrorHandler] Unhandled rejection:", event.reason);
      event.preventDefault();

      const message =
        event.reason instanceof Error
          ? event.reason.message
          : "Erro inesperado";

      // Chunk load failures get a specific message
      if (message.includes("Failed to fetch dynamically imported module") || message.includes("Loading chunk")) {
        toast.error("Falha ao carregar módulo. Recarregando...", { duration: 3000 });
        setTimeout(() => window.location.reload(), 2000);
        return;
      }

      toast.error("Ocorreu um erro inesperado. Tente novamente.", { duration: 5000 });
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <GlobalErrorHandler>
            <AuthProvider>
              <RealtimeProvider>
                <AnimatedRoutes />
              </RealtimeProvider>
            </AuthProvider>
          </GlobalErrorHandler>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;