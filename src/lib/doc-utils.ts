import { differenceInDays, parseISO } from "date-fns";

export function daysUntil(dateStr: string | null | undefined): {
  text: string;
  variant: "destructive" | "warning" | "default" | "secondary";
} {
  if (!dateStr) return { text: "—", variant: "secondary" };

  const target = parseISO(dateStr);
  const diff = differenceInDays(target, new Date());

  if (diff < 0) {
    return { text: `vencido há ${Math.abs(diff)} dias`, variant: "destructive" };
  }
  if (diff === 0) {
    return { text: "vence hoje", variant: "destructive" };
  }
  if (diff <= 30) {
    return { text: `em ${diff} dias`, variant: "destructive" };
  }
  if (diff <= 60) {
    return { text: `em ${diff} dias`, variant: "warning" };
  }
  return { text: `em ${diff} dias`, variant: "default" };
}

export function display(v: string | number | boolean | null | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

export const statusColors: Record<string, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  overdue: "bg-yellow-500",
  unknown: "bg-gray-400",
};
