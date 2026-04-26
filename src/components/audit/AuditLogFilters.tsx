import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export const AUDITED_TABLES = [
  "user_roles",
  "invoices",
  "contracts",
  "clients",
  "bank_accounts",
  "integration_settings",
] as const;

export const AUDITED_ACTIONS = ["INSERT", "UPDATE", "DELETE"] as const;

export interface FiltersState {
  table: string;
  action: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  value: FiltersState;
  onChange: (v: FiltersState) => void;
}

export function AuditLogFilters({ value, onChange }: Props) {
  const update = <K extends keyof FiltersState>(k: K, v: FiltersState[K]) =>
    onChange({ ...value, [k]: v });

  const clear = () =>
    onChange({ table: "all", action: "all", search: "", dateFrom: "", dateTo: "" });

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <div className="col-span-2">
        <Label htmlFor="audit-search" className="text-xs">Buscar (nome/email)</Label>
        <Input
          id="audit-search"
          value={value.search}
          onChange={(e) => update("search", e.target.value)}
          placeholder="Ex: João"
        />
      </div>
      <div>
        <Label className="text-xs">Tabela</Label>
        <Select value={value.table} onValueChange={(v) => update("table", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {AUDITED_TABLES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Ação</Label>
        <Select value={value.action} onValueChange={(v) => update("action", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {AUDITED_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="audit-from" className="text-xs">De</Label>
        <Input id="audit-from" type="date" value={value.dateFrom} onChange={(e) => update("dateFrom", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="audit-to" className="text-xs">Até</Label>
          <Input id="audit-to" type="date" value={value.dateTo} onChange={(e) => update("dateTo", e.target.value)} />
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Limpar filtros">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
