import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Ticket,
  FileText,
  LogOut,
  MessageSquare,
  Clock,
  CheckCircle,
  Star,
  DollarSign,
  Monitor,
  Laptop,
  Server,
  Printer,
  Network,
  Wifi,
  Box,
  Headset,
  User,
} from "lucide-react";
import { ClientPortalFinancialTab } from "@/components/client-portal/ClientPortalFinancialTab";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TicketRatingDialog } from "@/components/tickets/TicketRatingDialog";
import type { Enums, Tables } from "@/integrations/supabase/types";

interface PortalTicket {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
  satisfaction_rating: number | null;
  client_id: string | null;
  requester_contact_id: string | null;
  ticket_categories: { name: string } | null;
  requester: { name: string } | null;
}

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  paused: "Pausado",
  waiting_third_party: "Aguardando Terceiro",
  no_contact: "Sem Contato",
  resolved: "Resolvido",
  closed: "Fechado",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500",
  in_progress: "bg-yellow-500",
  waiting: "bg-orange-500",
  paused: "bg-purple-500",
  waiting_third_party: "bg-indigo-500",
  no_contact: "bg-red-500",
  resolved: "bg-green-500",
  closed: "bg-gray-500",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export default function ClientPortalPage() {
  const { user, profile, signOut, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"my" | "all">("my");
  const [ratingTicket, setRatingTicket] = useState<{id: string; number: number; title: string} | null>(null);
  const [activeSection, setActiveSection] = useState<"chamados" | "financeiro">("chamados");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [assetDescription, setAssetDescription] = useState("");

  const isClient = roles.includes("client") || roles.includes("client_master");
  const isClientMaster = roles.includes("client_master");

  // Fetch client association via client_contacts
  const { data: clientData } = useQuery({
    queryKey: ["client-user", user?.id],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Buscar cliente pelo vínculo do usuário em client_contacts
      const { data: contact } = await supabase
        .from("client_contacts")
        .select("client_id, id, clients(*)")
        .eq("user_id", user?.id)
        .maybeSingle();
      
      if (contact?.clients) {
        const clientRecord = contact.clients as unknown as Tables<"clients">;
        return { ...clientRecord, contactId: contact.id };
      }
      return null;
    },
    enabled: !!user && isClient,
  });

  // Fetch client tickets - client_master vê todos, client vê apenas os próprios
  const { data: tickets = [] } = useQuery({
    queryKey: ["client-tickets", clientData?.id, clientData?.contactId, isClientMaster, viewMode],
    queryFn: async () => {
      if (!clientData?.id) return [];
      
      let query = supabase
        .from("tickets")
        .select(`
          *,
          ticket_categories(name),
          requester:client_contacts!requester_contact_id(name)
        `)
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false });

      // Se for client normal OU client_master em modo "meus chamados", filtra por requester
      if (!isClientMaster || viewMode === "my") {
        query = query.eq("requester_contact_id", clientData.contactId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    enabled: !!clientData?.id,
  });

  // Fetch client contracts
  const { data: contracts = [] } = useQuery({
    queryKey: ["client-contracts", clientData?.id],
    queryFn: async () => {
      if (!clientData?.id) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("id, name, description, monthly_value, start_date, end_date, status, hours_included, support_model")
        .eq("client_id", clientData.id)
        .eq("status", "active");

      if (error) throw error;
      return data;
    },
    enabled: !!clientData?.id,
  });

  // Fetch ticket comments
  const { data: comments = [] } = useQuery({
    queryKey: ["ticket-comments", selectedTicket],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("id, ticket_id, user_id, content, is_internal, created_at")
        .eq("ticket_id", selectedTicket)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedTicket,
  });

  // Fetch client assets for device linking
  const { data: clientAssets = [] } = useQuery({
    queryKey: ["client-assets", clientData?.id],
    staleTime: 5 * 60 * 1000,
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
    enabled: !!clientData?.id,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_categories")
        .select("id, name, description")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: {
      title: string;
      description: string;
      priority: Enums<"ticket_priority">;
      category_id?: string;
      asset_id?: string | null;
      asset_description?: string | null;
    }) => {
      if (!clientData?.id) throw new Error("Cliente não encontrado");

      const { error } = await supabase.from("tickets").insert({
        title: ticketData.title,
        description: ticketData.description,
        priority: ticketData.priority,
        category_id: ticketData.category_id || null,
        asset_id: ticketData.asset_id || null,
        asset_description: ticketData.asset_description || null,
        client_id: clientData.id,
        created_by: user?.id,
        requester_contact_id: clientData.contactId,
        origin: "portal" as Enums<"ticket_origin">,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      setIsNewTicketOpen(false);
      setSelectedAssetId("");
      setAssetDescription("");
      toast({ title: "Chamado aberto com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao abrir chamado", variant: "destructive" });
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        content,
        is_internal: false,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments"] });
      toast({ title: "Comentário adicionado" });
    },
    onError: (error: Error) => {
      console.error("[AddComment] Falha ao adicionar comentário:", error);
      toast({ title: "Erro ao enviar comentário", description: "Tente novamente.", variant: "destructive" });
    },
  });

  const assetTypeIcons: Record<string, React.ReactNode> = {
    desktop: <Monitor className="h-4 w-4" />,
    laptop: <Laptop className="h-4 w-4" />,
    server: <Server className="h-4 w-4" />,
    printer: <Printer className="h-4 w-4" />,
    network: <Network className="h-4 w-4" />,
    access_point: <Wifi className="h-4 w-4" />,
    other: <Box className="h-4 w-4" />,
  };

  const handleNewTicket = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTicketMutation.mutate({
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      priority: formData.get("priority") as Enums<"ticket_priority">,
      category_id: formData.get("category_id") as string || undefined,
      asset_id: selectedAssetId && selectedAssetId !== "other" ? selectedAssetId : null,
      asset_description: selectedAssetId === "other" ? assetDescription : null,
    });
  };

  const handleAddComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const formData = new FormData(e.currentTarget);
    addCommentMutation.mutate({
      ticketId: selectedTicket,
      content: formData.get("content") as string,
    });
    e.currentTarget.reset();
  };

  const openTickets = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const resolvedTickets = tickets.filter((t) => t.status === "resolved" && !t.satisfaction_rating);
  const closedTickets = tickets.filter((t) => t.status === "closed" || (t.status === "resolved" && t.satisfaction_rating));

  const selectedTicketData = tickets.find((t) => t.id === selectedTicket);

  if (!isClient) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Esta área é restrita para clientes.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Portal do Cliente</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {profile?.full_name}
            </span>
            <Button variant="ghost" size="sm" asChild className="active:scale-[0.98] transition-transform">
              <Link to="/profile">
                <User className="h-4 w-4 mr-2" />
                Meu Perfil
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="active:scale-[0.98] transition-transform">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Section Navigation for client_master */}
        {isClientMaster && (
          <div className="flex items-center gap-2 mb-6">
            <Button
              variant={activeSection === "chamados" ? "default" : "outline"}
              onClick={() => setActiveSection("chamados")}
              className="gap-2"
            >
              <Ticket className="h-4 w-4" />
              Chamados
            </Button>
            <Button
              variant={activeSection === "financeiro" ? "default" : "outline"}
              onClick={() => setActiveSection("financeiro")}
              className="gap-2"
            >
              <DollarSign className="h-4 w-4" />
              Financeiro
            </Button>
          </div>
        )}

        {/* Financial Tab - client_master only */}
        {isClientMaster && activeSection === "financeiro" && clientData?.id && (
          <ClientPortalFinancialTab clientId={clientData.id} />
        )}


        {/* Tickets Section */}
        {activeSection === "chamados" && (
        <>
        {/* CTA - Abrir Chamado */}
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

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Chamados Abertos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{openTickets.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Chamados Resolvidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-status-success">{closedTickets.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Contratos Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{contracts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium truncate">{clientData?.name || "-"}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tickets List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <CardTitle>
                    {isClientMaster && viewMode === "all" ? "Chamados da Empresa" : "Meus Chamados"}
                  </CardTitle>
                  {isClientMaster && (
                    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                      <Button
                        variant={viewMode === "my" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("my")}
                        className="h-7 text-xs"
                      >
                        Meus
                      </Button>
                      <Button
                        variant={viewMode === "all" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("all")}
                        className="h-7 text-xs"
                      >
                        Todos
                      </Button>
                    </div>
                  )}
                </div>
                <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
                  <DialogTrigger asChild>
                    <Button className="active:scale-[0.98] transition-transform">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Chamado
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Abrir Novo Chamado</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleNewTicket} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">Título</Label>
                        <Input
                          id="title"
                          name="title"
                          placeholder="Descreva brevemente o problema"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                          id="description"
                          name="description"
                          placeholder="Descreva o problema em detalhes"
                          rows={4}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="priority">Prioridade</Label>
                          <Select name="priority" defaultValue="medium">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Baixa</SelectItem>
                              <SelectItem value="medium">Média</SelectItem>
                              <SelectItem value="high">Alta</SelectItem>
                              <SelectItem value="critical">Crítica</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="category_id">Categoria</Label>
                          <Select name="category_id">
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Device Selection */}
                      <div className="space-y-2">
                        <Label>Dispositivo com problema</Label>
                        {clientAssets.length > 0 ? (
                          <>
                            <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o dispositivo (opcional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {clientAssets.map((asset) => (
                                  <SelectItem key={asset.id} value={asset.id}>
                                    <span className="flex items-center gap-2">
                                      {assetTypeIcons[asset.asset_type] || <Box className="h-4 w-4" />}
                                      {asset.name}
                                    </span>
                                  </SelectItem>
                                ))}
                                <SelectItem value="other">
                                  <span className="flex items-center gap-2">
                                    <Box className="h-4 w-4" />
                                    Outro dispositivo (especificar)
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {selectedAssetId === "other" && (
                              <Input
                                placeholder="Descreva o dispositivo"
                                value={assetDescription}
                                onChange={(e) => setAssetDescription(e.target.value)}
                              />
                            )}
                          </>
                        ) : (
                          <Input
                            placeholder="Descreva o dispositivo com problema (opcional)"
                            value={assetDescription}
                            onChange={(e) => setAssetDescription(e.target.value)}
                          />
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsNewTicketOpen(false)}>
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={createTicketMutation.isPending}>
                          Abrir Chamado
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="open">
                  <TabsList className="mb-4">
                    <TabsTrigger value="open">Abertos ({openTickets.length})</TabsTrigger>
                    <TabsTrigger value="resolved" className="gap-1">
                      Aguardando Avaliação
                      {resolvedTickets.length > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                          {resolvedTickets.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="closed">Fechados ({closedTickets.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="open">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Título</TableHead>
                          {isClientMaster && viewMode === "all" && (
                            <TableHead>Solicitante</TableHead>
                          )}
                          <TableHead>Status</TableHead>
                          <TableHead>Prioridade</TableHead>
                          <TableHead>Criado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {openTickets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isClientMaster && viewMode === "all" ? 6 : 5} className="text-center py-8 text-muted-foreground">
                              Nenhum chamado aberto
                            </TableCell>
                          </TableRow>
                        ) : (
                          openTickets.map((ticket) => (
                            <TableRow
                              key={ticket.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setSelectedTicket(ticket.id)}
                            >
                              <TableCell>#{ticket.ticket_number}</TableCell>
                              <TableCell>{ticket.title}</TableCell>
                              {isClientMaster && viewMode === "all" && (
                                <TableCell className="text-muted-foreground">
                                  {ticket.requester?.name || "-"}
                                </TableCell>
                              )}
                              <TableCell>
                                <Badge className={statusColors[ticket.status]}>
                                  {statusLabels[ticket.status]}
                                </Badge>
                              </TableCell>
                              <TableCell>{priorityLabels[ticket.priority]}</TableCell>
                              <TableCell>
                                {formatDistanceToNow(new Date(ticket.created_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  
                  {/* Resolved Tickets Awaiting Rating */}
                  <TabsContent value="resolved">
                    {resolvedTickets.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
                        <p>Nenhum chamado aguardando avaliação</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            <Star className="h-4 w-4 inline mr-1" />
                            Avalie os chamados abaixo para encerrá-los definitivamente.
                          </p>
                        </div>
                        {resolvedTickets.map((ticket) => (
                          <Card key={ticket.id} className="border-green-200 dark:border-green-800">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-sm text-muted-foreground">
                                      #{ticket.ticket_number}
                                    </span>
                                    <Badge className="bg-green-500 text-white">
                                      Resolvido
                                    </Badge>
                                  </div>
                                  <h4 className="font-medium">{ticket.title}</h4>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Resolvido em{" "}
                                    {ticket.resolved_at
                                      ? format(new Date(ticket.resolved_at), "dd/MM/yyyy", { locale: ptBR })
                                      : "-"}
                                  </p>
                                </div>
                                <Button
                                  onClick={() => setRatingTicket({
                                    id: ticket.id,
                                    number: ticket.ticket_number,
                                    title: ticket.title,
                                  })}
                                  className="gap-2"
                                >
                                  <Star className="h-4 w-4" />
                                  Avaliar e Encerrar
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="closed">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Título</TableHead>
                          {isClientMaster && viewMode === "all" && (
                            <TableHead>Solicitante</TableHead>
                          )}
                          <TableHead>Status</TableHead>
                          <TableHead>Resolvido em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {closedTickets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isClientMaster && viewMode === "all" ? 5 : 4} className="text-center py-8 text-muted-foreground">
                              Nenhum chamado fechado
                            </TableCell>
                          </TableRow>
                        ) : (
                          closedTickets.map((ticket) => (
                            <TableRow
                              key={ticket.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setSelectedTicket(ticket.id)}
                            >
                              <TableCell>#{ticket.ticket_number}</TableCell>
                              <TableCell>{ticket.title}</TableCell>
                              {isClientMaster && viewMode === "all" && (
                                <TableCell className="text-muted-foreground">
                                  {ticket.requester?.name || "-"}
                                </TableCell>
                              )}
                              <TableCell>
                                <Badge className={statusColors[ticket.status]}>
                                  {statusLabels[ticket.status]}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {ticket.resolved_at
                                  ? format(new Date(ticket.resolved_at), "dd/MM/yyyy", { locale: ptBR })
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Ticket Detail / Chat */}
          <div>
            <Card className="h-[600px] flex flex-col">
              {selectedTicketData ? (
                <>
                  <CardHeader className="border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          #{selectedTicketData.ticket_number}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {selectedTicketData.title}
                        </CardDescription>
                      </div>
                      <Badge className={statusColors[selectedTicketData.status]}>
                        {statusLabels[selectedTicketData.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Description */}
                    <div className="bg-muted p-3 rounded-lg">
                      <p className="text-sm">{selectedTicketData.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(selectedTicketData.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>

                    {/* Comments */}
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg ${
                          comment.user_id === user?.id
                            ? "bg-primary text-primary-foreground ml-8"
                            : "bg-muted mr-8"
                        }`}
                      >
                        <p className="text-sm">{comment.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {format(new Date(comment.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                  {/* Add Comment */}
                  {!["resolved", "closed"].includes(selectedTicketData.status) && (
                    <div className="border-t p-4">
                      <form onSubmit={handleAddComment} className="flex gap-2">
                        <Input
                          name="content"
                          placeholder="Digite sua mensagem..."
                          required
                        />
                        <Button type="submit" size="icon" disabled={addCommentMutation.isPending} aria-label="Enviar comentário">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}
                </>
              ) : (
                <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Selecione um chamado para ver os detalhes</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
        </>
        )}
      </main>

      {/* Rating Dialog */}
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
