import { useClientBranches } from "./useClientBranches";

export function useClientBranchOptions(clientId: string | undefined | null) {
  const { items, isLoading } = useClientBranches(clientId ?? "");
  const options = items.map((b) => ({
    value: b.id,
    label: b.is_main ? `${b.name} (Sede)` : b.name,
  }));
  return { options, isLoading, isEmpty: !isLoading && options.length === 0 };
}
