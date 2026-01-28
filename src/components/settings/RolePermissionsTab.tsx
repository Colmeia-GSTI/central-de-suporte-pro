import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RotateCcw, Shield, Info } from "lucide-react";
import { 
  PERMISSIONS_CONFIG, 
  MODULE_METADATA, 
  ACTION_METADATA,
  ROLE_METADATA,
  Module, 
  ModuleAction, 
  AppRole 
} from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PermissionOverride {
  id: string;
  role: AppRole;
  module: string;
  action: string;
  is_allowed: boolean;
}

const EDITABLE_ROLES: AppRole[] = ["client", "client_master", "technician", "financial", "manager"];
const ALL_MODULES = Object.keys(MODULE_METADATA) as Module[];
const ALL_ACTIONS: ModuleAction[] = ["view", "create", "edit", "delete", "export", "manage"];

export function RolePermissionsTab() {
  const [selectedRole, setSelectedRole] = useState<AppRole>("client");
  const queryClient = useQueryClient();

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["permission-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permission_overrides")
        .select("id, role, module, action, is_allowed");
      
      if (error) throw error;
      return data as PermissionOverride[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ 
      role, 
      module, 
      action, 
      is_allowed 
    }: { 
      role: AppRole; 
      module: string; 
      action: string; 
      is_allowed: boolean | null;
    }) => {
      if (is_allowed === null) {
        // Remove override (back to default)
        const { error } = await supabase
          .from("role_permission_overrides")
          .delete()
          .eq("role", role)
          .eq("module", module)
          .eq("action", action);
        
        if (error) throw error;
      } else {
        // Upsert override
        const { error } = await supabase
          .from("role_permission_overrides")
          .upsert({
            role,
            module,
            action,
            is_allowed,
          }, {
            onConflict: "role,module,action",
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-overrides"] });
      toast.success("Permissão atualizada");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar permissão: " + error.message);
    },
  });

  const resetRoleMutation = useMutation({
    mutationFn: async (role: AppRole) => {
      const { error } = await supabase
        .from("role_permission_overrides")
        .delete()
        .eq("role", role);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-overrides"] });
      toast.success("Permissões restauradas para o padrão");
    },
    onError: (error) => {
      toast.error("Erro ao restaurar permissões: " + error.message);
    },
  });

  // Get the default permission from PERMISSIONS_CONFIG
  const getDefaultPermission = (module: Module, action: ModuleAction, role: AppRole): boolean => {
    const moduleConfig = PERMISSIONS_CONFIG[module];
    if (!moduleConfig) return false;
    
    const allowedRoles = moduleConfig[action];
    if (!allowedRoles) return false;
    
    return allowedRoles.includes(role);
  };

  // Check if the action is available for the module
  const isActionAvailableForModule = (module: Module, action: ModuleAction): boolean => {
    const moduleConfig = PERMISSIONS_CONFIG[module];
    if (!moduleConfig) return false;
    return action in moduleConfig;
  };

  // Get the current permission (override or default)
  const getCurrentPermission = (module: Module, action: ModuleAction, role: AppRole): {
    value: boolean;
    isOverride: boolean;
  } => {
    const override = overrides.find(
      o => o.role === role && o.module === module && o.action === action
    );
    
    if (override) {
      return { value: override.is_allowed, isOverride: true };
    }
    
    return { value: getDefaultPermission(module, action, role), isOverride: false };
  };

  const handleToggle = (module: Module, action: ModuleAction, currentValue: boolean, isOverride: boolean) => {
    const defaultValue = getDefaultPermission(module, action, selectedRole);
    const newValue = !currentValue;
    
    // If the new value equals the default, remove the override
    if (newValue === defaultValue && isOverride) {
      updateMutation.mutate({
        role: selectedRole,
        module,
        action,
        is_allowed: null,
      });
    } else if (newValue !== defaultValue || isOverride) {
      updateMutation.mutate({
        role: selectedRole,
        module,
        action,
        is_allowed: newValue,
      });
    }
  };

  const roleOverrideCount = overrides.filter(o => o.role === selectedRole).length;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Regras de Permissões
              </CardTitle>
              <CardDescription>
                Configure as permissões de cada perfil de usuário por módulo e ação
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Role selector */}
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${ROLE_METADATA[role].color}`} />
                        {ROLE_METADATA[role].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {roleOverrideCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                {roleOverrideCount} override{roleOverrideCount > 1 ? 's' : ''}
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => resetRoleMutation.mutate(selectedRole)}
              disabled={roleOverrideCount === 0 || resetRoleMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar Padrões
            </Button>
          </div>

          {/* Info about current role */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <strong>{ROLE_METADATA[selectedRole].label}</strong>: {ROLE_METADATA[selectedRole].description}
            </div>
          </div>

          {/* Permissions matrix */}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Módulo</TableHead>
                  {ALL_ACTIONS.map((action) => (
                    <TableHead key={action} className="text-center w-[100px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{ACTION_METADATA[action].label}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {ACTION_METADATA[action].description}
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : (
                  ALL_MODULES.map((module) => (
                    <TableRow key={module}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium cursor-help">
                              {MODULE_METADATA[module].label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {MODULE_METADATA[module].description}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      {ALL_ACTIONS.map((action) => {
                        const isAvailable = isActionAvailableForModule(module, action);
                        
                        if (!isAvailable) {
                          return (
                            <TableCell key={action} className="text-center">
                              <span className="text-muted-foreground/50">—</span>
                            </TableCell>
                          );
                        }

                        const { value, isOverride } = getCurrentPermission(module, action, selectedRole);
                        
                        return (
                          <TableCell key={action} className="text-center">
                            <div className="flex items-center justify-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="relative">
                                    <Checkbox
                                      checked={value}
                                      onCheckedChange={() => handleToggle(module, action, value, isOverride)}
                                      disabled={updateMutation.isPending}
                                      className={isOverride ? "border-primary" : ""}
                                    />
                                    {isOverride && (
                                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isOverride ? (
                                    <span>Override ativo (clique para alternar)</span>
                                  ) : (
                                    <span>Permissão padrão (clique para criar override)</span>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Checkbox checked disabled className="opacity-70" />
              <span>Permitido</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox disabled className="opacity-70" />
              <span>Bloqueado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Checkbox disabled className="border-primary opacity-70" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              </div>
              <span>Override ativo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground/50">—</span>
              <span>Não aplicável</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
