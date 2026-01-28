import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { Banknote, AlertTriangle } from "lucide-react";
import { isBefore, startOfDay } from "date-fns";

interface InvoiceDueInfo {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  clients: { name: string } | null;
}

interface InvoiceDueBadgeProps {
  invoice: InvoiceDueInfo;
  onClick?: () => void;
}

export function InvoiceDueBadge({ invoice, onClick }: InvoiceDueBadgeProps) {
  const isOverdue = invoice.status === "overdue" || 
    (invoice.status === "pending" && isBefore(new Date(invoice.due_date), startOfDay(new Date())));
  
  return (
    <button
      onClick={onClick}
      className={`
        text-[10px] px-1 py-0.5 rounded truncate flex items-center gap-0.5 w-full text-left
        ${isOverdue ? "bg-destructive text-destructive-foreground" : "bg-status-warning text-white"}
      `}
      title={`${invoice.clients?.name || "Cliente"} - ${formatCurrency(invoice.amount)}`}
    >
      {isOverdue ? (
        <AlertTriangle className="h-2 w-2 flex-shrink-0" />
      ) : (
        <Banknote className="h-2 w-2 flex-shrink-0" />
      )}
      <span className="truncate">
        #{invoice.invoice_number}
      </span>
    </button>
  );
}

interface InvoiceDueCardProps {
  invoice: InvoiceDueInfo;
  onScheduleReminder?: () => void;
  onSendCollection?: () => void;
}

export function InvoiceDueCard({ invoice, onScheduleReminder, onSendCollection }: InvoiceDueCardProps) {
  const isOverdue = invoice.status === "overdue" || 
    (invoice.status === "pending" && isBefore(new Date(invoice.due_date), startOfDay(new Date())));
  
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">Fatura #{invoice.invoice_number}</p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.clients?.name || "Cliente não definido"}
          </p>
          <p className="text-lg font-semibold mt-1">
            {formatCurrency(invoice.amount)}
          </p>
        </div>
        <Badge variant={isOverdue ? "destructive" : "outline"}>
          {isOverdue ? "Vencido" : "A Vencer"}
        </Badge>
      </div>
    </div>
  );
}
