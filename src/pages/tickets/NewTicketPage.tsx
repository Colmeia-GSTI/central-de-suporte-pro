import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TicketForm } from "@/components/tickets/TicketForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Support initial data from query params (e.g., from monitoring alerts)
  const initialData = {
    title: searchParams.get("title") || undefined,
    description: searchParams.get("description") || undefined,
    client_id: searchParams.get("client_id") || undefined,
    priority: (searchParams.get("priority") as "low" | "medium" | "high" | "critical") || undefined,
  };

  const handleSuccess = () => {
    navigate("/tickets");
  };

  const handleCancel = () => {
    navigate("/tickets");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Novo Chamado</h1>
            <p className="text-muted-foreground text-sm">
              Preencha as informações para abrir um novo chamado de suporte
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Informações do Chamado</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketForm 
              onSuccess={handleSuccess} 
              onCancel={handleCancel} 
              initialData={initialData}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
