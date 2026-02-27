import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link2, Plus, X, ChevronDown, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

interface TicketLinksSectionProps {
  ticketId: string;
  ticketNumber: number;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  related: "Relacionado",
  duplicates: "Duplicata de",
  is_parent_of: "Pai de",
  is_child_of: "Filho de",
};

export function TicketLinksSection({ ticketId, ticketNumber }: TicketLinksSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [linkType, setLinkType] = useState("related");
  const [searchResults, setSearchResults] = useState<{ id: string; ticket_number: number; title: string }[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(searchText, 300);

  // Fetch existing links
  const { data: links = [] } = useQuery({
    queryKey: ["ticket-links", ticketId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("ticket_links") as any)
        .select(`
          id,
          link_type,
          related_ticket_id,
          related_ticket:tickets!ticket_links_related_ticket_id_fkey(
            id, ticket_number, title, status
          )
        `)
        .eq("ticket_id", ticketId);
      if (error) throw error;
      return (data || []) as {
        id: string;
        link_type: string;
        related_ticket_id: string;
        related_ticket: { id: string; ticket_number: number; title: string; status: string };
      }[];
    },
    enabled: isOpen,
  });

  // Search tickets to link
  const handleSearch = async (value: string) => {
    setSearchText(value);
    if (!value || value.length < 2) {
      setSearchResults([]);
      return;
    }
    const searchNum = parseInt(value);
    let query = supabase.from("tickets").select("id, ticket_number, title").neq("id", ticketId).limit(8);
    if (!isNaN(searchNum)) {
      query = query.eq("ticket_number", searchNum);
    } else {
      query = query.ilike("title", `%${value}%`);
    }
    const { data } = await query;
    setSearchResults(data || []);
  };

  const addLinkMutation = useMutation({
    mutationFn: async (relatedId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("ticket_links") as any).insert({
        ticket_id: ticketId,
        related_ticket_id: relatedId,
        link_type: linkType,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-links", ticketId] });
      setSearchText("");
      setSearchResults([]);
      toast({ title: "Vínculo adicionado" });
    },
    onError: (e: Error) => {
      toast({
        title: e.message.includes("unique") ? "Este vínculo já existe" : "Erro ao adicionar vínculo",
        variant: "destructive",
      });
    },
  });

  const removeLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("ticket_links") as any).delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-links", ticketId] });
      toast({ title: "Vínculo removido" });
    },
    onError: () => toast({ title: "Erro ao remover vínculo", variant: "destructive" }),
  });

  const statusColors: Record<string, string> = {
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    waiting: "bg-purple-100 text-purple-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-600",
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Chamados Vinculados
            {links.length > 0 && (
              <Badge variant="secondary" className="text-xs">{links.length}</Badge>
            )}
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-2 space-y-3">
        {/* Existing links */}
        {links.length > 0 && (
          <div className="space-y-1.5">
            {links.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {LINK_TYPE_LABELS[link.link_type] || link.link_type}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                    #{link.related_ticket.ticket_number}
                  </span>
                  <span className="text-sm truncate">{link.related_ticket.title}</span>
                  <Badge
                    className={`text-[10px] flex-shrink-0 ${statusColors[link.related_ticket.status] || "bg-gray-100 text-gray-600"}`}
                  >
                    {link.related_ticket.status}
                  </Badge>
                </div>
                <button
                  onClick={() => removeLinkMutation.mutate(link.id)}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                  aria-label="Remover vínculo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add link form */}
        <div className="space-y-2 border-t pt-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Plus className="h-3 w-3" />
            Vincular chamado
          </Label>
          <div className="flex gap-2">
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LINK_TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                placeholder="Buscar por # ou título..."
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-8 text-sm"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((t) => (
                    <button
                      key={t.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                      onClick={() => {
                        addLinkMutation.mutate(t.id);
                      }}
                    >
                      <span className="text-xs font-mono text-muted-foreground mr-2">#{t.ticket_number}</span>
                      <span className="text-sm">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
