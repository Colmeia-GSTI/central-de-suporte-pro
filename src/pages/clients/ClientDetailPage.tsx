import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Building2,
  Users,
  FileText,
  Monitor,
  UserCheck,
  Mail,
  Phone,
  MapPin,
  MessageCircle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { ClientUsersList } from "@/components/clients/ClientUsersList";
import { ClientDocumentation } from "@/components/clients/ClientDocumentation";
import { ClientAssetsList } from "@/components/clients/ClientAssetsList";
import { ClientTechniciansList } from "@/components/clients/ClientTechniciansList";
import { ClientManagementReport } from "@/components/reports/ClientManagementReport";
import { formatPhone } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "info";
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const { isTechnicianOnly } = usePermissions();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      if (!id) throw new Error("Client ID not provided");
      
      // Technicians get limited fields via RLS, but we select all and let backend filter
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, trade_name, nickname, document, email, financial_email, phone, whatsapp, whatsapp_validated, address, city, state, zip_code, documentation, notes, is_active, created_at, updated_at")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Client;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-16 w-16 text-muted-foreground/50" />
          <h2 className="mt-4 text-xl font-semibold">Cliente não encontrado</h2>
          <Button className="mt-4" onClick={() => navigate("/clients")}>
            Voltar para Clientes
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/clients")}
            className="shrink-0"
            aria-label="Voltar para lista de clientes"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
              <Badge variant={client.is_active ? "default" : "secondary"}>
                {client.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {client.trade_name && (
              <p className="text-lg text-muted-foreground mt-0.5">{client.trade_name}</p>
            )}
            {client.nickname && (
              <Badge variant="outline" className="mt-1 text-sm font-normal">
                {client.nickname}
              </Badge>
            )}
            {client.document && (
              <p className="text-muted-foreground text-sm mt-1">{client.document}</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
            <TabsTrigger value="info" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Informações</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="documentation" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documentação</span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-2">
              <Monitor className="h-4 w-4" />
              <span className="hidden sm:inline">Ativos</span>
            </TabsTrigger>
            <TabsTrigger value="technicians" className="gap-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Técnicos</span>
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Relatório</span>
            </TabsTrigger>
          </TabsList>

          {/* Company Info Tab */}
          <TabsContent value="info" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dados da Empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Razão Social</p>
                      <p className="font-medium">{client.name}</p>
                    </div>
                    {client.trade_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Nome Fantasia</p>
                        <p className="font-medium">{client.trade_name}</p>
                      </div>
                    )}
                    {/* Hide document (CPF/CNPJ) from technicians */}
                    {!isTechnicianOnly && client.document && (
                      <div>
                        <p className="text-sm text-muted-foreground">CNPJ/CPF</p>
                        <p className="font-medium">{client.document}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{formatPhone(client.phone)}</span>
                    </div>
                  )}
                  {client.whatsapp && (
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-success" />
                      <span>{formatPhone(client.whatsapp)}</span>
                      {client.whatsapp_validated && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                    </div>
                  )}
                  {!client.email && !client.phone && !client.whatsapp && (
                    <p className="text-muted-foreground">Nenhum contato informado</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Endereço</CardTitle>
                </CardHeader>
                <CardContent>
                  {client.address || client.city || client.state ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        {client.address && <p>{client.address}</p>}
                        {(client.city || client.state) && (
                          <p className="text-muted-foreground">
                            {[client.city, client.state].filter(Boolean).join(" - ")}
                            {client.zip_code && ` - CEP: ${client.zip_code}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Endereço não informado</p>
                  )}
                </CardContent>
              </Card>

              {client.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Observações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{client.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <ClientUsersList clientId={id!} />
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="documentation">
            <ClientDocumentation
              clientId={id!}
              initialContent={client.documentation || ""}
            />
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets">
            <ClientAssetsList clientId={id!} />
          </TabsContent>

          {/* Technicians Tab */}
          <TabsContent value="technicians">
            <ClientTechniciansList clientId={id!} />
          </TabsContent>

          {/* Management Report Tab */}
          <TabsContent value="report">
            <ClientManagementReport clientId={id!} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
