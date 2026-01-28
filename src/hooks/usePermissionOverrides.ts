import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, Module, ModuleAction } from "@/lib/permissions";

interface PermissionOverride {
  role: AppRole;
  module: string;
  action: string;
  is_allowed: boolean;
}

// Cache the overrides in a Map for quick lookup
let overridesCache: Map<string, boolean> | null = null;

export function usePermissionOverrides() {
  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["permission-overrides-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permission_overrides")
        .select("role, module, action, is_allowed");
      
      if (error) throw error;
      
      // Update the cache
      overridesCache = new Map();
      (data as PermissionOverride[]).forEach(o => {
        overridesCache!.set(`${o.role}:${o.module}:${o.action}`, o.is_allowed);
      });
      
      return data as PermissionOverride[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });

  const getOverride = (role: AppRole, module: Module, action: ModuleAction): boolean | undefined => {
    const key = `${role}:${module}:${action}`;
    
    // Use cache if available
    if (overridesCache) {
      return overridesCache.has(key) ? overridesCache.get(key) : undefined;
    }
    
    // Fall back to query data
    const override = overrides.find(
      o => o.role === role && o.module === module && o.action === action
    );
    
    return override?.is_allowed;
  };

  return {
    overrides,
    isLoading,
    getOverride,
  };
}

// Sync function for use in non-hook contexts (uses cache)
export function getPermissionOverrideSync(role: AppRole, module: Module, action: ModuleAction): boolean | undefined {
  if (!overridesCache) return undefined;
  
  const key = `${role}:${module}:${action}`;
  return overridesCache.has(key) ? overridesCache.get(key) : undefined;
}
