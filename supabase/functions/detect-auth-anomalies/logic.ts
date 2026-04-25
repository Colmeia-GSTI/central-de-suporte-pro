import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

interface AnomalyReport {
  orphans: Array<{ user_id: string; email: string | null }>;
  zombies: Array<{ user_id: string; full_name: string | null; email: string | null }>;
  unconfirmed_old: Array<{ user_id: string; email: string | null; created_at: string }>;
  roleless: Array<{ user_id: string; email: string | null }>;
}

export async function detectAnomalies(admin: SupabaseClient): Promise<AnomalyReport> {
  // Auth users
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) throw authErr;
  const authUsers = authData.users;
  const authIds = new Set(authUsers.map((u) => u.id));

  // Profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, full_name, email");
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>(
    (profiles ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]),
  );
  const profileIds = new Set((profiles ?? []).map((p) => p.user_id));

  // Roles
  const { data: roles } = await admin.from("user_roles").select("user_id");
  const roleIds = new Set((roles ?? []).map((r) => r.user_id));

  // Orphans: auth.users without profile
  const orphans = authUsers
    .filter((u) => !profileIds.has(u.id))
    .map((u) => ({ user_id: u.id, email: u.email ?? null }));

  // Zombies: profile without auth user
  const zombies = (profiles ?? [])
    .filter((p) => !authIds.has(p.user_id))
    .map((p) => ({ user_id: p.user_id, full_name: p.full_name, email: p.email }));

  // Unconfirmed > 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const unconfirmed_old = authUsers
    .filter((u) => !u.email_confirmed_at && new Date(u.created_at).getTime() < sevenDaysAgo)
    .map((u) => ({ user_id: u.id, email: u.email ?? null, created_at: u.created_at }));

  // Roleless: auth user with profile but no role
  const roleless = authUsers
    .filter((u) => profileIds.has(u.id) && !roleIds.has(u.id))
    .map((u) => ({ user_id: u.id, email: u.email ?? null }));

  return { orphans, zombies, unconfirmed_old, roleless };
}

export function totalAnomalies(r: AnomalyReport): number {
  return r.orphans.length + r.zombies.length + r.unconfirmed_old.length + r.roleless.length;
}
