import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Enums } from "@/integrations/supabase/types";

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  resolved: "Resolvido",
  closed: "Fechado",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-500",
  in_progress: "bg-yellow-500",
  waiting: "bg-orange-500",
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

  const isClient = roles.includes("client") || roles.includes("client_master");
  const isClientMaster = roles.includes("client_master");

  // Fetch client association via client_contacts
  const { data: clientData } = useQuery({
    queryKey: ["client-user", user?.id],
    queryFn: async () => {
      // Buscar cliente pelo vínculo do usuário em client_contacts
      const { data: contact } = await supabase
        .from("client_contacts")
        .select("client_id, id, clients(*)")
        .eq("user_id", user?.id)
        .maybeSingle();
      
      if (contact?.clients) {
        return { ...(contact.clients as any), contactId: contact.id };
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

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
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
    }) => {
      if (!clientData?.id) throw new Error("Cliente não encontrado");

      const { error } = await supabase.from("tickets").insert({
        ...ticketData,
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
  });

  const handleNewTicket = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTicketMutation.mutate({
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      priority: formData.get("priority") as Enums<"ticket_priority">,
      category_id: formData.get("category_id") as string || undefined,
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
  const closedTickets = tickets.filter((t) => ["resolved", "closed"].includes(t.status));

  const selectedTicketData = tickets.find((t) => t.id === selectedTicket);

  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Portal do Cliente</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile?.full_name}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
              <p className="text-2xl font-bold text-green-600">{closedTickets.length}</p>
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
                    <Button>
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
                          openTickets.map((ticket: any) => (
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
                          closedTickets.map((ticket: any) => (
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
                        <Button type="submit" size="icon">
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
      </main>
    </div>
  );
}
