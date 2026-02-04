import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageTransition } from "./PageTransition";
import { HoneycombLoader } from "@/components/ui/HoneycombLoader";

// Eager load - frequently accessed
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import TicketsPage from "@/pages/tickets/TicketsPage";

// Lazy load - less frequently accessed (saves ~40% initial bundle)
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const Register = lazy(() => import("@/pages/Register"));
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Setup = lazy(() => import("@/pages/Setup"));
const ClientsPage = lazy(() => import("@/pages/clients/ClientsPage"));
const NewTicketPage = lazy(() => import("@/pages/tickets/NewTicketPage"));
const ClientDetailPage = lazy(() => import("@/pages/clients/ClientDetailPage"));
const ContractsPage = lazy(() => import("@/pages/contracts/ContractsPage"));
const NewContractPage = lazy(() => import("@/pages/contracts/NewContractPage"));
const EditContractPage = lazy(() => import("@/pages/contracts/EditContractPage"));
const InventoryPage = lazy(() => import("@/pages/inventory/InventoryPage"));
const MonitoringPage = lazy(() => import("@/pages/monitoring/MonitoringPage"));
const CalendarPage = lazy(() => import("@/pages/calendar/CalendarPage"));
const GamificationPage = lazy(() => import("@/pages/gamification/GamificationPage"));
const KnowledgePage = lazy(() => import("@/pages/knowledge/KnowledgePage"));
const TVDashboardPage = lazy(() => import("@/pages/tv-dashboard/TVDashboardPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const CertificateDashboardPage = lazy(() => import("@/pages/settings/CertificateDashboardPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const ClientPortalPage = lazy(() => import("@/pages/client-portal/ClientPortalPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const DelinquencyReportPage = lazy(() => import("@/pages/financial/DelinquencyReportPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));

// Suspense fallback component
function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <HoneycombLoader size="md" />
    </div>
  );
}

// Wrapper for lazy loaded components
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LazyFallback />}>
      <PageTransition>{children}</PageTransition>
    </Suspense>
  );
}

export function AnimatedRoutes() {
  return (
    <Routes>
      {/* Auth routes - lazy */}
      <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
      <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
      <Route path="/register" element={<LazyPage><Register /></LazyPage>} />
      <Route path="/unauthorized" element={<LazyPage><Unauthorized /></LazyPage>} />
      <Route path="/setup" element={<LazyPage><Setup /></LazyPage>} />
      
      {/* Public routes */}
      <Route path="/tv-dashboard" element={<LazyPage><TVDashboardPage /></LazyPage>} />
      
      {/* Client portal */}
      <Route path="/portal" element={<ProtectedRoute allowedRoles={["client", "client_master"]}><LazyPage><ClientPortalPage /></LazyPage></ProtectedRoute>} />

      {/* Main routes - Dashboard and Tickets eager loaded */}
      <Route path="/" element={<ProtectedRoute><PageTransition><Dashboard /></PageTransition></ProtectedRoute>} />
      <Route path="/tickets" element={<ProtectedRoute requireStaff><PageTransition><TicketsPage /></PageTransition></ProtectedRoute>} />
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
      
      {/* Financial routes - lazy (admin, manager, financial can view) */}
      <Route path="/billing" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><BillingPage /></LazyPage></ProtectedRoute>} />
      <Route path="/billing/delinquency" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><DelinquencyReportPage /></LazyPage></ProtectedRoute>} />
      
      {/* Redirects para compatibilidade */}
      <Route path="/financial" element={<Navigate to="/billing" replace />} />
      <Route path="/financial/*" element={<Navigate to="/billing" replace />} />
      <Route path="/services" element={<Navigate to="/billing?tab=services" replace />} />
      <Route path="/services/*" element={<Navigate to="/billing?tab=services" replace />} />
      
      {/* Admin routes - lazy */}
      <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "manager", "financial"]}><LazyPage><ReportsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><LazyPage><SettingsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/settings/certificates" element={<ProtectedRoute allowedRoles={["admin", "financial"]}><LazyPage><CertificateDashboardPage /></LazyPage></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><LazyPage><ProfilePage /></LazyPage></ProtectedRoute>} />
      
      {/* 404 */}
      <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
    </Routes>
  );
}