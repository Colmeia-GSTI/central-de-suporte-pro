import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Headset } from "lucide-react";
import { ClientPortalFinancialTab } from "@/components/client-portal/ClientPortalFinancialTab";
import { TicketRatingDialog } from "@/components/tickets/TicketRatingDialog";
import { useClientMonitoredDevices } from "@/hooks/useClientMonitoredDevices";
import { ClientPortalHeader } from "./components/ClientPortalHeader";
import { ClientPortalNav, type PortalSection } from "./components/ClientPortalNav";
import { ClientTicketsList } from "./components/ClientTicketsList";
import { ClientTicketDetailPanel } from "./components/ClientTicketDetailPanel";
import { NewTicketDialog } from "./components/NewTicketDialog";
import type { PortalTicket } from "./components/portal-types";
import type { Tables } from "@/integrations/supabase/types";

export default function ClientPortalPage() {
  const { user, profile, signOut, roles } = useAuth();
  const queryClient = useQueryClient();
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"my" | "all">("my");
  const [ratingTicket, setRatingTicket] = useState<{ id: string; number: number; title: string } | null>(null);
  const [activeSection, setActiveSection] = useState<PortalSection>("chamados");

  const isClient = roles.includes("client") || roles.includes("client_master");
  const isClientMaster = roles.includes("client_master");

  const { data: clientData } = useQuery({
    queryKey: ["client-user", user?.id],
    staleTime: 5 * 60 * 1000,
    enabled: !!user && isClient,
    queryFn: async () => {
      const { data: contact } = await supabase
        .from("client_contacts")
        .select("client_id, id, clients(*)")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (contact?.clients) {
        const c = contact.clients as unknown as Tables<"clients">;
        return { ...c, contactId: contact.id };
      }
      return null;
    },
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ["client-tickets", clientData?.id, clientData?.contactId, isClientMaster, viewMode],
    enabled: !!clientData?.id,
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select(`*, ticket_categories(name), requester:client_contacts!requester_contact_id(name)`)
        .eq("client_id", clientData!.id)
        .order("created_at", { ascending: false });
      if (!isClientMaster || viewMode === "my") q = q.eq("requester_contact_id", clientData!.contactId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PortalTicket[];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["client-contracts", clientData?.id],
    enabled: !!clientData?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id")
        .eq("client_id", clientData!.id)
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientAssets = [] } = useQuery({
    queryKey: ["client-assets", clientData?.id],
    staleTime: 5 * 60 * 1000,
    enabled: !!clientData?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, name, asset_type, status")
        .eq("client_id", clientData!.id)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_categories").select("id, name").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { items: monitoredDevices } = useClientMonitoredDevices(clientData?.id);

  const openCount = tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length;
  const closedCount = tickets.filter((t) => t.status === "closed" || (t.status === "resolved" && t.satisfaction_rating)).length;
  const selectedTicketData = tickets.find((t) => t.id === selectedTicket);

  if (!isClient) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Esta área é restrita para clientes.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <ClientPortalHeader fullName={profile?.full_name} onSignOut={signOut} />

      <main className="container mx-auto px-4 py-8">
        {isClientMaster && <ClientPortalNav active={activeSection} onChange={setActiveSection} />}

        {isClientMaster && activeSection === "financeiro" && clientData?.id && (
          <ClientPortalFinancialTab clientId={clientData.id} />
        )}

        {activeSection === "chamados" && (
          <>
            <Card className="mb-6 border-primary/30 bg-primary/5">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Headset className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Precisa de ajuda?</p>
                  <p className="text-sm text-muted-foreground">Abra um novo chamado e nossa equipe responderá o mais rápido possível.</p>
                </div>
                <Button size="lg" onClick={() => setIsNewTicketOpen(true)} className="shrink-0 gap-2">
                  <Plus className="h-5 w-5" />
                  Abrir Chamado
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-4 mb-8">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Chamados Abertos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{openCount}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Chamados Resolvidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-status-success">{closedCount}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Contratos Ativos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{contracts.length}</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Cliente</CardTitle></CardHeader><CardContent><p className="text-lg font-medium truncate">{clientData?.name || "-"}</p></CardContent></Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ClientTicketsList
                  tickets={tickets}
                  isClientMaster={isClientMaster}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  onSelectTicket={setSelectedTicket}
                  onOpenNew={() => setIsNewTicketOpen(true)}
                  onRate={setRatingTicket}
                />
              </div>
              <div>
                <ClientTicketDetailPanel ticket={selectedTicketData} currentUserId={user?.id} />
              </div>
            </div>
          </>
        )}
      </main>

      <NewTicketDialog
        open={isNewTicketOpen}
        onOpenChange={setIsNewTicketOpen}
        monitoredDevices={monitoredDevices}
        clientAssets={clientAssets}
        categories={categories}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["client-tickets"] })}
      />

      {ratingTicket && (
        <TicketRatingDialog
          open={!!ratingTicket}
          onOpenChange={(open) => !open && setRatingTicket(null)}
          ticketId={ratingTicket.id}
          ticketNumber={ratingTicket.number}
          ticketTitle={ratingTicket.title}
        />
      )}
    </div>
  );
}
