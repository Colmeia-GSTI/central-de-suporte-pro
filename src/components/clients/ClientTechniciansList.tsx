import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UserCheck, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TechnicianAssignment {
  id: string;
  user_id: string;
  assigned_at: string;
  profile?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

interface ClientTechniciansListProps {
  clientId: string;
}

export function ClientTechniciansList({ clientId }: ClientTechniciansListProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; assignment: TechnicianAssignment | null }>({
    open: false,
    assignment: null,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch assigned technicians
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["client-technicians", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_technicians")
        .select("id, user_id, assigned_at")
        .eq("client_id", clientId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles for each technician
      if (data.length > 0) {
        const userIds = data.map((d) => d.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, avatar_url")
          .in("user_id", userIds);

        if (profilesError) throw profilesError;

        return data.map((assignment) => ({
          ...assignment,
          profile: profiles?.find((p) => p.user_id === assignment.user_id),
        })) as TechnicianAssignment[];
      }

      return data as TechnicianAssignment[];
    },
  });

  // Fetch available technicians (staff members not yet assigned)
  const { data: availableTechnicians = [] } = useQuery({
    queryKey: ["available-technicians", clientId],
    queryFn: async () => {
      // Get technicians (users with technician, admin, or manager role)
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["technician", "admin", "manager"]);

      if (rolesError) throw rolesError;

      const technicianUserIds = [...new Set(userRoles?.map((r) => r.user_id) || [])];

      if (technicianUserIds.length === 0) return [];

      // Get already assigned technicians
      const assignedIds = assignments.map((a) => a.user_id);

      // Filter out already assigned technicians
      const availableIds = technicianUserIds.filter((id) => !assignedIds.includes(id));

      if (availableIds.length === 0) return [];

      // Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", availableIds)
        .order("full_name");

      if (profilesError) throw profilesError;

      return profiles || [];
    },
    enabled: isDialogOpen,
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("client_technicians").insert({
        client_id: clientId,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-technicians", clientId] });
      queryClient.invalidateQueries({ queryKey: ["available-technicians", clientId] });
      toast({ title: "Técnico vinculado com sucesso" });
      setIsDialogOpen(false);
      setSelectedTechnicianId("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao vincular técnico", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_technicians").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-technicians", clientId] });
      queryClient.invalidateQueries({ queryKey: ["available-technicians", clientId] });
      toast({ title: "Técnico desvinculado" });
      setDeleteConfirm({ open: false, assignment: null });
    },
    onError: () => {
      toast({ title: "Erro ao desvincular técnico", variant: "destructive" });
    },
  });

  const handleAssign = () => {
    if (selectedTechnicianId) {
      assignMutation.mutate(selectedTechnicianId);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Técnicos Vinculados</CardTitle>
          <CardDescription>
            Técnicos responsáveis pelo atendimento deste cliente
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <PermissionGate module="clients" action="edit">
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Vincular Técnico
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Técnico</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um técnico" />
                </SelectTrigger>
                <SelectContent>
                  {availableTechnicians.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Todos os técnicos já estão vinculados
                    </div>
                  ) : (
                    availableTechnicians.map((tech) => (
                      <SelectItem key={tech.user_id} value={tech.user_id}>
                        {tech.full_name} ({tech.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={!selectedTechnicianId || assignMutation.isPending}
                >
                  {assignMutation.isPending ? "Vinculando..." : "Vincular"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8">
            <UserCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">Nenhum técnico vinculado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead>Vinculado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={assignment.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(assignment.profile?.full_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{assignment.profile?.full_name || "Usuário desconhecido"}</p>
                        <p className="text-sm text-muted-foreground">{assignment.profile?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(assignment.assigned_at), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate module="clients" action="edit">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirm({ open: true, assignment })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Desvincular Técnico"
        description={`Tem certeza que deseja desvincular "${deleteConfirm.assignment?.profile?.full_name}" deste cliente?`}
        confirmLabel="Desvincular"
        variant="destructive"
        onConfirm={() => deleteConfirm.assignment && removeMutation.mutate(deleteConfirm.assignment.id)}
        isLoading={removeMutation.isPending}
      />
    </Card>
  );
}
