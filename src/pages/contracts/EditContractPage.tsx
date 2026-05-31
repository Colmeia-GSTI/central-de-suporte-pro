import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ContractForm } from "@/components/contracts/ContractForm";
import { ContractEditHeader } from "@/components/contracts/ContractEditHeader";
import { ContractQuickActions } from "@/components/contracts/ContractQuickActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditContractPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: contract, isLoading, error } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      if (!id) throw new Error("Contract ID not provided");
      const { data, error } = await supabase
        .from("contracts")
        .select("*, clients(id, name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleSuccess = () => navigate("/contracts");
  const handleCancel = () => navigate("/contracts");

  if (error) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">Editar Contrato</h1>
          </div>
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">
                Erro ao carregar contrato. Não encontrado ou sem permissão.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (isLoading || !contract) {
    return (
      <AppLayout>
        <div className="space-y-4 max-w-5xl mx-auto">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ContractEditHeader
        contract={contract}
        onBack={handleCancel}
        onSave={() => {
          const form = document.querySelector<HTMLFormElement>("form");
          form?.requestSubmit();
        }}
        isSaving={false}
      />

      <div className="space-y-4 max-w-5xl mx-auto pt-4">
        <div className="flex justify-end">
          <ContractQuickActions contract={contract} onAfterCancel={handleCancel} />
        </div>

        <Card>
          <CardContent className="pt-6">
            <ContractForm
              initialData={contract}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
              isEditing={true}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
