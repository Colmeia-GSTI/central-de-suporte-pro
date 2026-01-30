import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ContractForm } from "@/components/contracts/ContractForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function NewContractPage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate("/contracts");
  };

  const handleCancel = () => {
    navigate("/contracts");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Novo Contrato</h1>
            <p className="text-muted-foreground text-sm">
              Preencha as informações para criar um novo contrato de suporte
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Informações do Contrato</CardTitle>
          </CardHeader>
          <CardContent>
            <ContractForm 
              onSuccess={handleSuccess} 
              onCancel={handleCancel} 
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
