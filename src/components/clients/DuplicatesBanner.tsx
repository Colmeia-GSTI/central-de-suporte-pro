import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MergeClientsDialog } from "./MergeClientsDialog";
import { usePermissions } from "@/hooks/usePermissions";

interface DuplicateGroup {
  normalized_document: string;
  occurrences: number;
  clients: Array<{
    id: string;
    name: string;
    document?: string | null;
    email?: string | null;
    contracts_count?: number;
    tickets_count?: number;
    invoices_count?: number;
    contacts_count?: number;
  }>;
}

export function DuplicatesBanner() {
  const { isAdmin } = usePermissions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);

  const { data: groups } = useQuery({
    queryKey: ["duplicate-clients"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("detect_duplicate_clients" as never);
      if (error) throw error;
      return (data as unknown as DuplicateGroup[]) || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!isAdmin || !groups || groups.length === 0) return null;

  return (
    <>
      <Alert className="border-warning bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
          <span>
            Detectamos <strong>{groups.length}</strong>{" "}
            {groups.length === 1 ? "grupo de potenciais duplicatas" : "grupos de potenciais duplicatas"}.
          </span>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
            Ver e resolver
          </Button>
        </AlertDescription>
      </Alert>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Clientes duplicados
            </SheetTitle>
            <SheetDescription>
              Selecione um grupo para mesclar os cadastros em um único cliente canônico.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {groups.map((g) => (
              <Card key={g.normalized_document}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>CNPJ {g.normalized_document}</span>
                    <Badge>{g.occurrences} cadastros</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ul className="text-xs space-y-1">
                    {g.clients.map((c) => (
                      <li key={c.id} className="flex items-center justify-between">
                        <span className="truncate">{c.name}</span>
                        <span className="text-muted-foreground">
                          {c.contracts_count ?? 0}c · {c.tickets_count ?? 0}t · {c.invoices_count ?? 0}f
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" onClick={() => setMergeGroup(g)} className="w-full">
                    Mesclar este grupo
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {mergeGroup && (
        <MergeClientsDialog
          open={!!mergeGroup}
          onOpenChange={(open) => !open && setMergeGroup(null)}
          group={mergeGroup.clients}
        />
      )}
    </>
  );
}
