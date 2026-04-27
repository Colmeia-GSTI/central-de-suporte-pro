import { useClientBranches } from "./useClientBranches";

export function useClientBranchOptions(clientId: string | undefined | null) {
  const { items, isLoading } = useClientBranches(clientId || "");
  const isEnabled = !!clientId;
  const options = items.map((b) => ({
    value: b.id,
    label: b.is_main ? `${b.name} (Sede)` : b.name,
  }));
  const mainBranchId = items.find((b) => b.is_main)?.id ?? null;
  return {
    options,
    mainBranchId,
    isLoading: isEnabled && isLoading,
    isEmpty: isEnabled && !isLoading && options.length === 0,
  };
}
