/**
 * Granular Role-Based Access Control (RBAC) System
 * 
 * This module defines the permission structure for the application.
 * Permissions are organized by:
 * - Module: Functional area of the application (tickets, clients, financial, etc.)
 * - Action: Operation type (view, create, edit, delete, export, manage)
 * - Role: User role (admin, manager, technician, financial, client, client_master)
 * 
 * SECURITY NOTES:
 * 1. Frontend permissions are for UI control ONLY - never trust client-side checks
 * 2. All data access is protected by Supabase RLS policies
 * 3. Override permissions are stored in role_permission_overrides table
 * 4. Use PermissionGate component for UI, useSecureAction for mutations
 */

export type ModuleAction = "view" | "create" | "edit" | "delete" | "export" | "manage";

export type Module = 
  | "dashboard"
  | "tickets"
  | "clients"
  | "contracts"
  | "services"
  | "monitoring"
  | "inventory"
  | "calendar"
  | "gamification"
  | "financial"
  | "reports"
  | "knowledge"
  | "settings"
  | "users";

export type AppRole = "admin" | "manager" | "technician" | "financial" | "client" | "client_master";

// Staff roles - these have access to internal modules
export const STAFF_ROLES: AppRole[] = ["admin", "manager", "technician", "financial"];

// Client roles - limited access to client-facing features
export const CLIENT_ROLES: AppRole[] = ["client", "client_master"];

interface ModulePermissions {
  [action: string]: AppRole[];
}

interface PermissionsConfig {
  [module: string]: ModulePermissions;
}

// Define all permissions per module and action
export const PERMISSIONS_CONFIG: PermissionsConfig = {
  dashboard: {
    view: ["admin", "manager", "technician", "financial", "client", "client_master"],
  },
  tickets: {
    view: ["admin", "manager", "technician", "client", "client_master"],
    create: ["admin", "manager", "technician", "client", "client_master"],
    edit: ["admin", "manager", "technician"],
    delete: ["admin", "manager"],
    export: ["admin", "manager"],
    manage: ["admin", "manager"],
  },
  clients: {
    view: ["admin", "manager", "technician", "financial"],
    create: ["admin", "manager", "technician", "financial"],
    edit: ["admin", "manager", "technician", "financial"],
    delete: ["admin"],
    export: ["admin", "manager", "financial"],
  },
  contracts: {
    view: ["admin", "manager", "financial"],
    create: ["admin", "manager", "financial"],
    edit: ["admin", "manager", "financial"],
    delete: ["admin", "financial"],
    export: ["admin", "manager", "financial"],
  },
  services: {
    view: ["admin", "manager", "technician", "financial"],
    create: ["admin", "financial"],
    edit: ["admin", "financial"],
    delete: ["admin"],
  },
  monitoring: {
    view: ["admin", "manager", "technician"],
    manage: ["admin", "manager"],
  },
  inventory: {
    view: ["admin", "manager", "technician", "client", "client_master"],
    create: ["admin", "manager", "technician"],
    edit: ["admin", "manager", "technician"],
    delete: ["admin", "manager"],
    export: ["admin", "manager"],
  },
  calendar: {
    view: ["admin", "manager", "technician"],
    create: ["admin", "manager", "technician"],
    edit: ["admin", "manager", "technician"],
    delete: ["admin", "manager", "technician"],
  },
  gamification: {
    view: ["admin", "manager", "technician"],
    manage: ["admin"],
  },
  financial: {
    view: ["admin", "manager", "financial"],
    create: ["admin", "financial"],
    edit: ["admin", "financial"],
    delete: ["admin"],
    export: ["admin", "manager", "financial"],
    manage: ["admin", "financial"],
  },
  reports: {
    view: ["admin", "manager", "financial"],
    export: ["admin", "manager", "financial"],
  },
  knowledge: {
    view: ["admin", "manager", "technician", "client", "client_master"],
    create: ["admin", "manager", "technician"],
    edit: ["admin", "manager", "technician"],
    delete: ["admin", "manager"],
  },
  settings: {
    view: ["admin", "manager"],
    edit: ["admin"],
    manage: ["admin"],
  },
  users: {
    view: ["admin", "manager"],
    create: ["admin"],
    edit: ["admin"],
    delete: ["admin"],
  },
};

// Helper function to check if a role has permission for a specific action on a module
export function hasPermission(
  roles: AppRole[],
  module: Module,
  action: ModuleAction
): boolean {
  const modulePermissions = PERMISSIONS_CONFIG[module];
  if (!modulePermissions) return false;

  const allowedRoles = modulePermissions[action];
  if (!allowedRoles) return false;

  return roles.some((role) => allowedRoles.includes(role));
}

// Helper function to get all allowed actions for a role on a module
export function getAllowedActions(
  roles: AppRole[],
  module: Module
): ModuleAction[] {
  const modulePermissions = PERMISSIONS_CONFIG[module];
  if (!modulePermissions) return [];

  return Object.entries(modulePermissions)
    .filter(([_, allowedRoles]) => roles.some((role) => allowedRoles.includes(role)))
    .map(([action]) => action as ModuleAction);
}

// Module metadata for UI display
export const MODULE_METADATA: Record<Module, { label: string; description: string }> = {
  dashboard: {
    label: "Dashboard",
    description: "Visão geral do sistema",
  },
  tickets: {
    label: "Chamados",
    description: "Gerenciamento de chamados de suporte",
  },
  clients: {
    label: "Clientes",
    description: "Cadastro e gestão de clientes",
  },
  contracts: {
    label: "Contratos",
    description: "Contratos e serviços",
  },
  services: {
    label: "Serviços",
    description: "Catálogo de serviços para contratos",
  },
  monitoring: {
    label: "Monitoramento",
    description: "Monitoramento de dispositivos e alertas",
  },
  inventory: {
    label: "Inventário",
    description: "Ativos e licenças de software",
  },
  calendar: {
    label: "Agenda",
    description: "Eventos e agendamentos",
  },
  gamification: {
    label: "Gamificação",
    description: "Sistema de pontos e conquistas",
  },
  financial: {
    label: "Financeiro",
    description: "Faturas e lançamentos financeiros",
  },
  reports: {
    label: "Relatórios",
    description: "Relatórios e análises",
  },
  knowledge: {
    label: "Base de Conhecimento",
    description: "Artigos e documentação",
  },
  settings: {
    label: "Configurações",
    description: "Configurações do sistema",
  },
  users: {
    label: "Usuários",
    description: "Gerenciamento de usuários e permissões",
  },
};

export const ACTION_METADATA: Record<ModuleAction, { label: string; description: string }> = {
  view: {
    label: "Visualizar",
    description: "Ver registros e informações",
  },
  create: {
    label: "Criar",
    description: "Adicionar novos registros",
  },
  edit: {
    label: "Editar",
    description: "Modificar registros existentes",
  },
  delete: {
    label: "Excluir",
    description: "Remover registros",
  },
  export: {
    label: "Exportar",
    description: "Exportar dados para arquivo",
  },
  manage: {
    label: "Gerenciar",
    description: "Configurações avançadas do módulo",
  },
};

export const ROLE_METADATA: Record<AppRole, { label: string; description: string; color: string }> = {
  admin: {
    label: "Administrador",
    description: "Acesso total ao sistema",
    color: "bg-red-500",
  },
  manager: {
    label: "Gerente",
    description: "Gerenciamento de equipe e operações",
    color: "bg-purple-500",
  },
  technician: {
    label: "Técnico",
    description: "Atendimento e suporte técnico",
    color: "bg-blue-500",
  },
  financial: {
    label: "Financeiro",
    description: "Gestão financeira e faturamento",
    color: "bg-green-500",
  },
  client: {
    label: "Cliente",
    description: "Acesso ao portal do cliente",
    color: "bg-gray-500",
  },
  client_master: {
    label: "Cliente Master",
    description: "Visão consolidada multi-filiais",
    color: "bg-amber-500",
  },
};
