import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TicketForm } from "@/components/tickets/TicketForm";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Ticket, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialData = {
    title: searchParams.get("title") || undefined,
    description: searchParams.get("description") || undefined,
    client_id: searchParams.get("client_id") || undefined,
    priority: (searchParams.get("priority") as "low" | "medium" | "high" | "critical") || undefined,
  };

  const handleSuccess = () => navigate("/tickets");
  const handleCancel = () => navigate("/tickets");

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 max-w-3xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel} className="flex-shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Ticket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Novo Chamado</h1>
              <p className="text-muted-foreground text-sm hidden sm:block">
                Preencha as informações para abrir um novo chamado de suporte
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-card border rounded-2xl p-5 sm:p-8">
          <TicketForm
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            initialData={initialData}
          />
        </div>
      </motion.div>
    </AppLayout>
  );
}
