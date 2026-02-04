import { useAuth } from "./useAuth";

/**
 * Hook to check if user is ONLY a technician (no higher roles like admin/manager/financial)
 * Used to hide sensitive client data from technicians
 */
export function useIsTechnicianOnly(): boolean {
  const { roles } = useAuth();
  
  const hasTechnician = roles.includes("technician");
  const hasHigherRole = roles.some(r => 
    ["admin", "manager", "financial"].includes(r)
  );
  
  return hasTechnician && !hasHigherRole;
}
