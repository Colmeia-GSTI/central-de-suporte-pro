import { diffJsonb, type JsonValue } from "@/lib/audit-diff";
import { Badge } from "@/components/ui/badge";

interface Props {
  oldData: unknown;
  newData: unknown;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function AuditLogDiff({ oldData, newData }: Props) {
  const diff = diffJsonb(oldData as JsonValue, newData as JsonValue);
  const hasAny = diff.added.length + diff.removed.length + diff.changed.length > 0;

  if (!hasAny) {
    return <p className="text-sm text-muted-foreground">Nenhuma diferença detectada.</p>;
  }

  return (
    <div className="space-y-3">
      {diff.changed.map((d) => (
        <div key={`c-${d.key}`} className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-warning border-warning/30">alterado</Badge>
            <span className="font-mono text-xs">{d.key}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <pre className="bg-destructive/10 text-destructive rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
              {formatValue(d.oldValue)}
            </pre>
            <pre className="bg-success/10 text-success rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
              {formatValue(d.newValue)}
            </pre>
          </div>
        </div>
      ))}
      {diff.added.map((d) => (
        <div key={`a-${d.key}`} className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-success border-success/30">adicionado</Badge>
            <span className="font-mono text-xs">{d.key}</span>
          </div>
          <pre className="bg-success/10 text-success rounded p-2 overflow-auto max-h-40 text-xs whitespace-pre-wrap break-all">
            {formatValue(d.newValue)}
          </pre>
        </div>
      ))}
      {diff.removed.map((d) => (
        <div key={`r-${d.key}`} className="rounded-md border border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-destructive border-destructive/30">removido</Badge>
            <span className="font-mono text-xs">{d.key}</span>
          </div>
          <pre className="bg-destructive/10 text-destructive rounded p-2 overflow-auto max-h-40 text-xs whitespace-pre-wrap break-all">
            {formatValue(d.oldValue)}
          </pre>
        </div>
      ))}
    </div>
  );
}
