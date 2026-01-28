import { forwardRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, RefreshCw } from "lucide-react";

type AppRole = "admin" | "manager" | "technician" | "financial" | "client" | "client_master";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  requireStaff?: boolean;
}

export const ProtectedRoute = forwardRef<HTMLDivElement, ProtectedRouteProps>(
  function ProtectedRoute({ children, allowedRoles, requireStaff = false }, ref) {
    const { user, roles, isLoading, isStaff, rolesLoaded, isRevalidating } = useAuth();
    const location = useLocation();

    // Only show full-screen loader on initial bootstrapping.
    // IMPORTANT: never block UI during tab revalidation (preserves in-progress form state).
    const isInitialLoading = isLoading && !user;
    const isLoadingRoles = !!user && !rolesLoaded && !isRevalidating;

    if (isInitialLoading || isLoadingRoles) {
      return (
        <div ref={ref} className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!user) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // If roles haven't loaded yet (but we're revalidating), keep children mounted and
    // avoid premature redirects. Once rolesLoaded=true, normal access checks apply.
    if (rolesLoaded) {
      if (requireStaff && !isStaff) {
        return <Navigate to="/unauthorized" replace />;
      }

      if (allowedRoles && !allowedRoles.some((role) => roles.includes(role))) {
        return <Navigate to="/unauthorized" replace />;
      }
    }

    return (
      <div ref={ref} className="relative">
        {/* Subtle revalidation indicator - doesn't block UI */}
        {isRevalidating && (
          <div className="fixed top-2 right-2 z-50 flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm border rounded-full shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Sincronizando...
          </div>
        )}
        {children}
      </div>
    );
  }
);
