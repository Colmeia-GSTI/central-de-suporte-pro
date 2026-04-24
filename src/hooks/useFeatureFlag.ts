import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  rollout_percentage: number | null;
  enabled_for_roles: string[] | null;
  enabled_for_user_ids: string[] | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

const FLAGS_QUERY_KEY = ["feature_flags"] as const;
const STALE_TIME = 5 * 60 * 1000; // 5 min

// FNV-1a 32-bit — determinístico para rollout gradual
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function evaluateFlag(
  flag: FeatureFlag | undefined,
  userId: string | null,
  userRoles: string[]
): boolean {
  if (!flag) return false;
  if (!flag.enabled) return false;

  // Whitelist por user_id tem prioridade absoluta
  if (userId && flag.enabled_for_user_ids?.includes(userId)) return true;

  // Filtro por role — se definido, usuário precisa ter pelo menos uma das roles
  if (flag.enabled_for_roles && flag.enabled_for_roles.length > 0) {
    const hasMatchingRole = userRoles.some((r) => flag.enabled_for_roles!.includes(r));
    if (!hasMatchingRole) return false;
  }

  // Rollout gradual baseado em hash determinístico
  const pct = flag.rollout_percentage ?? 0;
  if (pct >= 100) return true;
  if (pct <= 0) {
    // Sem rollout definido mas roles/users matchearam: liberar
    return Boolean(
      (flag.enabled_for_roles && flag.enabled_for_roles.length > 0) ||
        (flag.enabled_for_user_ids && flag.enabled_for_user_ids.length > 0)
    )
      ? true
      : true; // enabled=true sem restrições => liga para todos
  }

  if (!userId) return false;
  const bucket = fnv1a(`${userId}:${flag.key}`) % 100;
  return bucket < pct;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: FLAGS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("key", { ascending: true });
      if (error) {
        console.error("[useFeatureFlags] Erro ao carregar flags:", error);
        throw error;
      }
      return (data ?? []) as FeatureFlag[];
    },
    staleTime: STALE_TIME,
  });
}

export function useFeatureFlag(key: string): boolean {
  const { user, roles } = useAuth();
  const { data: flags } = useFeatureFlags();

  const userId = user?.id ?? null;
  const flag = flags?.find((f) => f.key === key);

  return evaluateFlag(flag, userId, roles ?? []);
}
