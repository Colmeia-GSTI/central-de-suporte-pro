import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { useUnifiedRealtime } from "@/hooks/useUnifiedRealtime";

// Optimized QueryClient with aggressive caching to prevent flickering
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes - increased to reduce refetches
      gcTime: 1000 * 60 * 15, // 15 minutes garbage collection
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false, // Prevent refetch on component mount
    },
  },
});

// Component to initialize unified realtime
function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useUnifiedRealtime();
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RealtimeProvider>
              <AnimatedRoutes />
            </RealtimeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;