import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ContractForm } from "@/components/contracts/ContractForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ContractWithClient = Tables<"contracts"> & {
  clients: Tables<"clients"> | null;
};

export default function NewContractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", editId],
    queryFn: async () => {
      if (!editId) return null;
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          *,
          clients(id, name)
        `)
        .eq("id", editId)
        .single();
      if (error) throw error;
      return data as ContractWithClient;
    },
    enabled: isEditMode,
  });

  const handleSuccess = () => {
    navigate("/contracts");
  };

  const handleCancel = () => {
    navigate("/contracts");
  };

  if (isEditMode && isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Card>
            <CardHeader className="pb-4">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEditMode ? "Editar Contrato" : "Novo Contrato"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isEditMode
                ? "Atualize as informações do contrato de suporte"
                : "Preencha as informações para criar um novo contrato de suporte"}
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
              contract={isEditMode ? contract : undefined}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
