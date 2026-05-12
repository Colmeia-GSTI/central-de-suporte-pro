import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Star, CheckCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { type PortalTicket, statusLabels, statusColors, priorityLabels } from "./portal-types";

interface Props {
  tickets: PortalTicket[];
  isClientMaster: boolean;
  viewMode: "my" | "all";
  onViewModeChange: (m: "my" | "all") => void;
  onSelectTicket: (id: string) => void;
  onOpenNew: () => void;
  onRate: (t: { id: string; number: number; title: string }) => void;
}

export function ClientTicketsList({
  tickets,
  isClientMaster,
  viewMode,
  onViewModeChange,
  onSelectTicket,
  onOpenNew,
  onRate,
}: Props) {
  const openTickets = tickets.filter((t) => !["resolved", "closed"].includes(t.status));
  const resolvedTickets = tickets.filter((t) => t.status === "resolved" && !t.satisfaction_rating);
  const closedTickets = tickets.filter((t) => t.status === "closed" || (t.status === "resolved" && t.satisfaction_rating));
  const showRequester = isClientMaster && viewMode === "all";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <CardTitle>{showRequester ? "Chamados da Empresa" : "Meus Chamados"}</CardTitle>
          {isClientMaster && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant={viewMode === "my" ? "secondary" : "ghost"} size="sm" onClick={() => onViewModeChange("my")} className="h-7 text-xs">Meus</Button>
              <Button variant={viewMode === "all" ? "secondary" : "ghost"} size="sm" onClick={() => onViewModeChange("all")} className="h-7 text-xs">Todos</Button>
            </div>
          )}
        </div>
        <Button onClick={onOpenNew} className="active:scale-[0.98] transition-transform">
          <Plus className="h-4 w-4 mr-2" />
          Novo Chamado
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="open">
          <TabsList className="mb-4">
            <TabsTrigger value="open">Abertos ({openTickets.length})</TabsTrigger>
            <TabsTrigger value="resolved" className="gap-1">
              Aguardando Avaliação
              {resolvedTickets.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{resolvedTickets.length}</Badge>
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
                  {showRequester && <TableHead>Solicitante</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showRequester ? 6 : 5} className="text-center py-8 text-muted-foreground">
                      Nenhum chamado aberto
                    </TableCell>
                  </TableRow>
                ) : (
                  openTickets.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectTicket(t.id)}>
                      <TableCell>#{t.ticket_number}</TableCell>
                      <TableCell>{t.title}</TableCell>
                      {showRequester && <TableCell className="text-muted-foreground">{t.requester?.name || "-"}</TableCell>}
                      <TableCell><Badge className={statusColors[t.status]}>{statusLabels[t.status]}</Badge></TableCell>
                      <TableCell>{priorityLabels[t.priority]}</TableCell>
                      <TableCell>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

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
                {resolvedTickets.map((t) => (
                  <Card key={t.id} className="border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-muted-foreground">#{t.ticket_number}</span>
                            <Badge className="bg-green-500 text-white">Resolvido</Badge>
                          </div>
                          <h4 className="font-medium">{t.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Resolvido em {t.resolved_at ? format(new Date(t.resolved_at), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                          </p>
                        </div>
                        <Button onClick={() => onRate({ id: t.id, number: t.ticket_number, title: t.title })} className="gap-2">
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
                  {showRequester && <TableHead>Solicitante</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Resolvido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showRequester ? 5 : 4} className="text-center py-8 text-muted-foreground">
                      Nenhum chamado fechado
                    </TableCell>
                  </TableRow>
                ) : (
                  closedTickets.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectTicket(t.id)}>
                      <TableCell>#{t.ticket_number}</TableCell>
                      <TableCell>{t.title}</TableCell>
                      {showRequester && <TableCell className="text-muted-foreground">{t.requester?.name || "-"}</TableCell>}
                      <TableCell><Badge className={statusColors[t.status]}>{statusLabels[t.status]}</Badge></TableCell>
                      <TableCell>{t.resolved_at ? format(new Date(t.resolved_at), "dd/MM/yyyy", { locale: ptBR }) : "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
