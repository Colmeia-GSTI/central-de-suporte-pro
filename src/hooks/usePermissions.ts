import { useAuth } from "@/hooks/useAuth";
import { hasPermission, getAllowedActions, Module, ModuleAction, AppRole, PERMISSIONS_CONFIG } from "@/lib/permissions";
import { usePermissionOverrides } from "@/hooks/usePermissionOverrides";

export function usePermissions() {
  const { roles } = useAuth();
  const { getOverride } = usePermissionOverrides();

  const can = (module: Module, action: ModuleAction): boolean => {
    const userRoles = roles as AppRole[];
    
    // Check for any override first
    for (const role of userRoles) {
      const override = getOverride(role, module, action);
      if (override !== undefined) {
        // If any role has an explicit allow, permit
        if (override === true) return true;
      }
    }
    
    // Check if any role has an explicit deny override
    for (const role of userRoles) {
      const override = getOverride(role, module, action);
      if (override === false) {
        // Only deny if no other role allows it
        const anyRoleAllows = userRoles.some(r => {
          const o = getOverride(r, module, action);
          return o === true || (o === undefined && hasPermission([r], module, action));
        });
        if (!anyRoleAllows) return false;
      }
    }
    
    // Fall back to default permissions
    return hasPermission(userRoles, module, action);
  };

  const canAny = (module: Module, actions: ModuleAction[]): boolean => {
    return actions.some((action) => can(module, action));
  };

  const canAll = (module: Module, actions: ModuleAction[]): boolean => {
    return actions.every((action) => can(module, action));
  };

  const getActions = (module: Module): ModuleAction[] => {
    const userRoles = roles as AppRole[];
    const moduleConfig = PERMISSIONS_CONFIG[module];
    if (!moduleConfig) return [];
    
    const allActions = Object.keys(moduleConfig) as ModuleAction[];
    return allActions.filter(action => can(module, action));
  };

  const canViewModule = (module: Module): boolean => {
    return can(module, "view");
  };

  const canEditModule = (module: Module): boolean => {
    return can(module, "edit");
  };

  const canManageModule = (module: Module): boolean => {
    return can(module, "manage");
  };

  return {
    can,
    canAny,
    canAll,
    getActions,
    canViewModule,
    canEditModule,
    canManageModule,
    roles: roles as AppRole[],
  };
}
