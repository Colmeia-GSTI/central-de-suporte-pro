import { lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageTransition } from "./PageTransition";
import { HoneycombLoader } from "@/components/ui/HoneycombLoader";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Only Login is eager (entry point) — Dashboard and TicketsPage are lazy for faster initial load
import Login from "@/pages/Login";

// Retry wrapper for lazy imports — retries up to 3 times with exponential delay
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() => {
    let attempts = 0;
    const load: () => Promise<{ default: React.ComponentType }> = () =>
      importFn().catch((error) => {
        attempts++;
        if (attempts >= 3) throw error;
        return new Promise<{ default: React.ComponentType }>((resolve) =>
          setTimeout(() => resolve(load()), 1000 * attempts)
        );
      });
    return load();
  });
}

// Lazy load with retry — ALL pages are lazy for optimal bundle splitting
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const TicketsPage = lazyWithRetry(() => import("@/pages/tickets/TicketsPage"));
const ForgotPassword = lazyWithRetry(() => import("@/pages/ForgotPassword"));
const Register = lazyWithRetry(() => import("@/pages/Register"));
const Unauthorized = lazyWithRetry(() => import("@/pages/Unauthorized"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const Setup = lazyWithRetry(() => import("@/pages/Setup"));
const ClientsPage = lazyWithRetry(() => import("@/pages/clients/ClientsPage"));
const NewTicketPage = lazyWithRetry(() => import("@/pages/tickets/NewTicketPage"));
const ClientDetailPage = lazyWithRetry(() => import("@/pages/clients/ClientDetailPage"));
const ContractsPage = lazyWithRetry(() => import("@/pages/contracts/ContractsPage"));
const NewContractPage = lazyWithRetry(() => import("@/pages/contracts/NewContractPage"));
const EditContractPage = lazyWithRetry(() => import("@/pages/contracts/EditContractPage"));
const InventoryPage = lazyWithRetry(() => import("@/pages/inventory/InventoryPage"));
const MonitoringPage = lazyWithRetry(() => import("@/pages/monitoring/MonitoringPage"));
const CalendarPage = lazyWithRetry(() => import("@/pages/calendar/CalendarPage"));
const GamificationPage = lazyWithRetry(() => import("@/pages/gamification/GamificationPage"));
const KnowledgePage = lazyWithRetry(() => import("@/pages/knowledge/KnowledgePage"));
const KnowledgeArticlePage = lazyWithRetry(() => import("@/pages/knowledge/KnowledgeArticlePage"));
const TVDashboardPage = lazyWithRetry(() => import("@/pages/tv-dashboard/TVDashboardPage"));
const SettingsPage = lazyWithRetry(() => import("@/pages/settings/SettingsPage"));
const CertificateDashboardPage = lazyWithRetry(() => import("@/pages/settings/CertificateDashboardPage"));
const FeatureFlagsPage = lazyWithRetry(() => import("@/pages/settings/FeatureFlagsPage"));
const ReportsPage = lazyWithRetry(() => import("@/pages/reports/ReportsPage"));
const ClientPortalPage = lazyWithRetry(() => import("@/pages/client-portal/ClientPortalPage"));
const ProfilePage = lazyWithRetry(() => import("@/pages/profile/ProfilePage"));
const DelinquencyReportPage = lazyWithRetry(() => import("@/pages/financial/DelinquencyReportPage"));
const BillingPage = lazyWithRetry(() => import("@/pages/billing/BillingPage"));

// Per-route Error Boundary — isolates crashes to a single page
interface LazyErrorBoundaryState {
  hasError: boolean;
}

class LazyErrorBoundary extends Component<{ children: ReactNode }, LazyErrorBoundaryState> {
  state: LazyErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LazyErrorBoundary] Erro na página:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Erro ao carregar esta página</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Ocorreu um problema inesperado. Tente recarregar a página.
          </p>
          <Button onClick={this.handleReload} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Suspense fallback
function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <HoneycombLoader size="md" />
    </div>
  );
}

// Wrapper for lazy loaded components with error boundary
function LazyPage({ children }: { children: ReactNode }) {
  return (
    <LazyErrorBoundary>
      <Suspense fallback={<LazyFallback />}>
        <PageTransition>{children}</PageTransition>
      </Suspense>
    </LazyErrorBoundary>
  );
}

export function AnimatedRoutes() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
      <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
      <Route path="/register" element={<LazyPage><Register /></LazyPage>} />
      <Route path="/unauthorized" element={<LazyPage><Unauthorized /></LazyPage>} />
      <Route path="/setup" element={<LazyPage><Setup /></LazyPage>} />
      
      {/* TV Dashboard - protected */}
      <Route path="/tv-dashboard" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><LazyPage><TVDashboardPage /></LazyPage></ProtectedRoute>} />
      
      {/* Client portal */}
      <Route path="/portal" element={<ProtectedRoute allowedRoles={["client", "client_master"]}><LazyPage><ClientPortalPage /></LazyPage></ProtectedRoute>} />

      {/* Main routes - lazy loaded for optimal bundle splitting */}
      <Route path="/" element={<ProtectedRoute><LazyPage><Dashboard /></LazyPage></ProtectedRoute>} />
      <Route path="/tickets" element={<ProtectedRoute requireStaff><LazyPage><TicketsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/tickets/new" element={<ProtectedRoute requireStaff><LazyPage><NewTicketPage /></LazyPage></ProtectedRoute>} />
      
      {/* Other staff routes - lazy */}
      <Route path="/clients" element={<ProtectedRoute requireStaff><LazyPage><ClientsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute requireStaff><LazyPage><ClientDetailPage /></LazyPage></ProtectedRoute>} />
      <Route path="/contracts" element={<ProtectedRoute requireStaff><LazyPage><ContractsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/contracts/new" element={<ProtectedRoute requireStaff><LazyPage><NewContractPage /></LazyPage></ProtectedRoute>} />
      <Route path="/contracts/edit/:id" element={<ProtectedRoute requireStaff><LazyPage><EditContractPage /></LazyPage></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute requireStaff><LazyPage><InventoryPage /></LazyPage></ProtectedRoute>} />
      <Route path="/monitoring" element={<ProtectedRoute requireStaff><LazyPage><MonitoringPage /></LazyPage></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute requireStaff><LazyPage><CalendarPage /></LazyPage></ProtectedRoute>} />
      <Route path="/gamification" element={<ProtectedRoute requireStaff><LazyPage><GamificationPage /></LazyPage></ProtectedRoute>} />
      <Route path="/knowledge" element={<ProtectedRoute requireStaff><LazyPage><KnowledgePage /></LazyPage></ProtectedRoute>} />
      <Route path="/knowledge/:slug" element={<ProtectedRoute requireStaff><LazyPage><KnowledgeArticlePage /></LazyPage></ProtectedRoute>} />
      
      {/* Financial routes */}
      <Route path="/billing" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><BillingPage /></LazyPage></ProtectedRoute>} />
      <Route path="/billing/delinquency" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><DelinquencyReportPage /></LazyPage></ProtectedRoute>} />
      
      {/* Redirects */}
      <Route path="/financial" element={<Navigate to="/billing" replace />} />
      <Route path="/financial/*" element={<Navigate to="/billing" replace />} />
      <Route path="/services" element={<Navigate to="/billing?tab=services" replace />} />
      <Route path="/services/*" element={<Navigate to="/billing?tab=services" replace />} />
      
      {/* Admin routes */}
      <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><ReportsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><LazyPage><SettingsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/settings/certificates" element={<ProtectedRoute allowedRoles={["admin", "financial"]}><LazyPage><CertificateDashboardPage /></LazyPage></ProtectedRoute>} />
      <Route path="/settings/feature-flags" element={<ProtectedRoute allowedRoles={["admin"]}><LazyPage><FeatureFlagsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><LazyPage><ProfilePage /></LazyPage></ProtectedRoute>} />
      
      {/* 404 */}
      <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
    </Routes>
  );
}
