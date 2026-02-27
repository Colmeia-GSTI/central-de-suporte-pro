import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Building2, Loader2, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TicketTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  currentAssignedTo?: string | null;
  currentDepartmentId?: string | null;
  onSuccess?: () => void;
}

export function TicketTransferDialog({
  open,
  onOpenChange,
  ticketId,
  currentAssignedTo,
  currentDepartmentId,
  onSuccess,
}: TicketTransferDialogProps) {
  const [transferType, setTransferType] = useState<"technician" | "department">("technician");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch staff technicians (filter by role) + their active ticket count
  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians-transfer"],
    queryFn: async () => {
      // 1. Get user_ids that are staff (technician, manager, admin)
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["technician", "manager", "admin"]);
      if (rolesError) throw rolesError;

      const staffUserIds = [...new Set((rolesData || []).map((r) => r.user_id))];
      if (staffUserIds.length === 0) return [];

      // 2. Fetch profiles for those users
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", staffUserIds)
        .order("full_name");
      if (profilesError) throw profilesError;

      // 3. Fetch active ticket counts per user
      const { data: ticketCounts, error: countError } = await supabase
        .from("tickets")
        .select("assigned_to")
        .in("status", ["open", "in_progress", "waiting", "paused", "no_contact"])
        .not("assigned_to", "is", null);
      if (countError) throw countError;

      const countByUser = new Map<string, number>();
      for (const t of ticketCounts || []) {
        if (t.assigned_to) {
          countByUser.set(t.assigned_to, (countByUser.get(t.assigned_to) || 0) + 1);
        }
      }

      return (profilesData || []).map((p) => ({
        ...p,
        activeTickets: countByUser.get(p.user_id) || 0,
      }));
    },
    enabled: open,
  });

  // Fetch departments
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      // Create transfer record
      const { error: transferError } = await supabase.from("ticket_transfers").insert({
        ticket_id: ticketId,
        transferred_by: user?.id,
        from_user_id: currentAssignedTo || null,
        to_user_id: transferType === "technician" ? selectedTechnicianId : null,
        from_department_id: currentDepartmentId || null,
        to_department_id: transferType === "department" ? selectedDepartmentId : null,
        reason: reason || null,
      });
      if (transferError) throw transferError;

      // Update ticket
      const updates: Record<string, string | null> = {};
      if (transferType === "technician") {
        updates.assigned_to = selectedTechnicianId;
      } else {
        updates.department_id = selectedDepartmentId;
        updates.assigned_to = null; // Clear assignee when transferring to department
      }

      const { error: ticketError } = await supabase
        .from("tickets")
        .update(updates)
        .eq("id", ticketId);
      if (ticketError) throw ticketError;

      // Registrar no histórico (best-effort)
      const toTechnicianName = technicians.find((t) => t.user_id === selectedTechnicianId)?.full_name;
      const toDepartmentName = departments.find((d) => d.id === selectedDepartmentId)?.name;

      let comment =
        transferType === "technician"
          ? `Transferido para técnico: ${toTechnicianName || selectedTechnicianId}`
          : `Transferido para departamento: ${toDepartmentName || selectedDepartmentId}`;
      if (reason.trim()) comment += ` — ${reason.trim()}`;

      const { error: historyError } = await supabase.from("ticket_history").insert([
        {
          ticket_id: ticketId,
          user_id: user?.id,
          comment,
        },
      ]);

      if (historyError) {
        logger.warn("Failed to insert ticket_history (transfer)", "Tickets", { error: historyError.message });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      toast({ title: "Chamado transferido com sucesso" });
      handleClose();
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Erro ao transferir chamado",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setSelectedTechnicianId("");
    setSelectedDepartmentId("");
    setReason("");
    onOpenChange(false);
  };

  const handleTransfer = () => {
    if (transferType === "technician" && !selectedTechnicianId) {
      toast({ title: "Selecione um técnico", variant: "destructive" });
      return;
    }
    if (transferType === "department" && !selectedDepartmentId) {
      toast({ title: "Selecione um departamento", variant: "destructive" });
      return;
    }
    transferMutation.mutate();
  };

  const isValid =
    (transferType === "technician" && selectedTechnicianId) ||
    (transferType === "department" && selectedDepartmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir Chamado
          </DialogTitle>
          <DialogDescription>
            Transfira este chamado para outro técnico ou departamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={transferType} onValueChange={(v) => setTransferType(v as typeof transferType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="technician" className="gap-2">
                <User className="h-4 w-4" />
                Técnico
              </TabsTrigger>
              <TabsTrigger value="department" className="gap-2">
                <Building2 className="h-4 w-4" />
                Departamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="technician" className="mt-4">
              <div className="space-y-2">
                <Label>Selecione o técnico</Label>
                <Select value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um técnico..." />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians
                      .filter((t) => t.user_id !== currentAssignedTo)
                      .map((tech) => (
                        <SelectItem key={tech.user_id} value={tech.user_id}>
                          <span className="flex items-center justify-between w-full gap-2">
                            <span>{tech.full_name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {tech.activeTickets} {tech.activeTickets === 1 ? "chamado" : "chamados"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="department" className="mt-4">
              <div className="space-y-2">
                <Label>Selecione o departamento</Label>
                <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um departamento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        Nenhum departamento cadastrado
                      </div>
                    ) : (
                      departments
                        .filter((d) => d.id !== currentDepartmentId)
                        .map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label>Motivo da transferência (opcional)</Label>
            <Textarea
              placeholder="Descreva o motivo da transferência..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!isValid || transferMutation.isPending}
            >
              {transferMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferindo...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transferir
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
