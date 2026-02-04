import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ContractForm } from "@/components/contracts/ContractForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
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
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleSuccess = () => {
    navigate("/contracts");
  };

  const handleCancel = () => {
    navigate("/contracts");
  };

  if (error) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Editar Contrato</h1>
            </div>
          </div>

          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">
                Erro ao carregar contrato. O contrato não foi encontrado ou você não tem permissão para editá-lo.
              </p>
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
            <h1 className="text-2xl font-bold tracking-tight">Editar Contrato</h1>
            <p className="text-muted-foreground text-sm">
              Atualize as informações do contrato de suporte
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Informações do Contrato</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : contract ? (
              <ContractForm
                initialData={contract}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
                isEditing={true}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
