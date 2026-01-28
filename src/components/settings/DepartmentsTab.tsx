import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus, Pencil, Trash2, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Department {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export function DepartmentsTab() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    manager_id: "",
    is_active: true,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch departments
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, description, manager_id, is_active")
        .order("name");
      if (error) throw error;
      return data as Department[];
    },
  });

  // Fetch profiles for manager selection
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch department member counts
  const { data: memberCounts = {} } = useQuery({
    queryKey: ["department-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id");
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach((m) => {
        counts[m.department_id] = (counts[m.department_id] || 0) + 1;
      });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error("Nome é obrigatório");
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        manager_id: formData.manager_id || null,
        is_active: formData.is_active,
      };

      if (editingDept) {
        const { error } = await supabase
          .from("departments")
          .update(payload)
          .eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: editingDept ? "Departamento atualizado" : "Departamento criado" });
      handleCloseForm();
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: "Departamento excluído" });
      setDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir departamento", variant: "destructive" });
    },
  });

  const handleEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      description: dept.description || "",
      manager_id: dept.manager_id || "",
      is_active: dept.is_active,
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingDept(null);
    setFormData({ name: "", description: "", manager_id: "", is_active: true });
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "—";
    const profile = profiles.find((p) => p.user_id === managerId);
    return profile?.full_name || "—";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Departamentos
            </CardTitle>
            <CardDescription>
              Gerencie as filas e equipes de atendimento (N1, N2, N3, etc.)
            </CardDescription>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleCloseForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Departamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingDept ? "Editar Departamento" : "Novo Departamento"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Suporte N1, Infraestrutura, Desenvolvimento..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição do departamento..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gestor</Label>
                  <Select
                    value={formData.manager_id}
                    onValueChange={(v) => setFormData((f) => ({ ...f, manager_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o gestor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(v) => setFormData((f) => ({ ...f, is_active: v }))}
                  />
                  <Label htmlFor="is_active">Ativo</Label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleCloseForm}>
                    Cancelar
                  </Button>
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Nenhum departamento cadastrado</p>
            <p className="text-sm">Crie departamentos para organizar suas filas de atendimento</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {dept.description || "—"}
                  </TableCell>
                  <TableCell>{getManagerName(dept.manager_id)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {memberCounts[dept.id] || 0}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={dept.is_active ? "default" : "secondary"}>
                      {dept.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(dept)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(dept.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ConfirmDialog
          open={!!deleteConfirm}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Excluir departamento?"
          description="Esta ação não pode ser desfeita. Chamados vinculados a este departamento ficarão sem departamento."
          confirmLabel="Excluir"
          onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
          variant="destructive"
        />
      </CardContent>
    </Card>
  );
}
