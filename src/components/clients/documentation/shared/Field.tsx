/**
 * Reusable read-only field display for doc section components.
 * Replaces local Field components in DocSectionClientInfo, DocSectionInfrastructure,
 * DocSectionSupportHours, and DocSectionTelephony.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
