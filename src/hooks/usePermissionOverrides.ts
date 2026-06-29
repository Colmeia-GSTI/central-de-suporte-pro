import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, Module, ModuleAction } from "@/lib/permissions";

interface PermissionOverride {
  role: AppRole;
  module: string;
  action: string;
  is_allowed: boolean;
}

export function usePermissionOverrides() {
  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["permission-overrides-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permission_overrides")
        .select("role, module, action, is_allowed");

      if (error) throw error;
      return data as PermissionOverride[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Mapa derivado para lookup O(1), reativo aos dados do React Query — sem cache
  // global mutavel (que ficava stale e ignorava a reatividade do Query).
  const overrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const o of overrides) {
      map.set(`${o.role}:${o.module}:${o.action}`, o.is_allowed);
    }
    return map;
  }, [overrides]);

  const getOverride = (role: AppRole, module: Module, action: ModuleAction): boolean | undefined => {
    const key = `${role}:${module}:${action}`;
    return overrideMap.has(key) ? overrideMap.get(key) : undefined;
  };

  return {
    overrides,
    isLoading,
    getOverride,
  };
}
