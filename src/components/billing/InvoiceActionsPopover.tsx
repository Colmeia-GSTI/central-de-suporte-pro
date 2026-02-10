import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Barcode, QrCode, MoreHorizontal, Loader2, FileText, Mail, MessageCircle,
  Send, Zap, XCircle, Building2, HandCoins, Ban, CheckCircle2, Clock, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceForActions {
  id: string;
  invoice_number: number;
  amount: number;
  boleto_url: string | null;
  pix_code: string | null;
  contract_id: string | null;
  client_id: string | null;
  billing_provider: string | null;
  status: string;
  clients?: { name: string } | null;
}

interface NfseInfo {
  status: string;
  numero_nfse: string | null;
}

interface InvoiceActionsPopoverProps {
  invoice: InvoiceForActions;
  nfseInfo?: NfseInfo;
  generatingPayment: string | null;
  processingComplete: string | null;
  sendingNotification: string | null;
  onEmitComplete: () => void;
  onGeneratePayment: (invoiceId: string, type: "boleto" | "pix", provider: "banco_inter" | "asaas") => void;
  onManualPayment: () => void;
  onMarkAsPaid: () => void;
  onSecondCopy: () => void;
  onRenegotiate: () => void;
  onResendNotification: (invoiceId: string, channels: ("email" | "whatsapp")[]) => void;
  onEmitNfse: () => void;
  onCancelBoleto: () => void;
  onCancelNfse: () => void;
  onViewHistory: () => void;
}

type SubMenu = null | "boleto" | "pix";

function MenuButton({
  onClick,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}

export function InvoiceActionsPopover({
  invoice,
  nfseInfo,
  generatingPayment,
  processingComplete,
  sendingNotification,
  onEmitComplete,
  onGeneratePayment,
  onManualPayment,
  onMarkAsPaid,
  onSecondCopy,
  onRenegotiate,
  onResendNotification,
  onEmitNfse,
  onCancelBoleto,
  onCancelNfse,
  onViewHistory,
}: InvoiceActionsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);

  const isPendingOrOverdue = invoice.status === "pending" || invoice.status === "overdue";
  const hasPaymentMethod = !!invoice.boleto_url || !!invoice.pix_code;
  const hasBoleto = !!invoice.boleto_url;
  const canCancelBoleto = hasBoleto && invoice.status !== "paid";
  const hasAuthorizedNfse = nfseInfo?.status === "autorizada";

  const closeAndRun = (fn: () => void) => {
    setOpen(false);
    setSubMenu(null);
    fn();
  };

  // Sub-menu for provider selection
  if (subMenu) {
    const type = subMenu;
    const label = type === "boleto" ? "Gerar Boleto" : "Gerar PIX";
    return (
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSubMenu(null); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background h-9 w-9 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {generatingPayment?.startsWith(invoice.id) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <MenuButton onClick={() => setSubMenu(null)}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            {label}
          </MenuButton>
          <MenuSeparator />
          <MenuButton
            onClick={() => closeAndRun(() => onGeneratePayment(invoice.id, type, "banco_inter"))}
            disabled={generatingPayment !== null}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Banco Inter
          </MenuButton>
          <MenuButton
            onClick={() => closeAndRun(() => onGeneratePayment(invoice.id, type, "asaas"))}
            disabled={generatingPayment !== null}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Asaas
          </MenuButton>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background h-9 w-9 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {generatingPayment?.startsWith(invoice.id) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {/* Emitir Completo */}
        {isPendingOrOverdue && (
          <>
            <MenuButton
              onClick={() => closeAndRun(onEmitComplete)}
              disabled={processingComplete !== null || generatingPayment !== null}
              className="font-medium text-primary"
            >
              {processingComplete === invoice.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Emitir Completo
            </MenuButton>
            <MenuSeparator />
          </>
        )}

        {/* Gerar Boleto / PIX */}
        {isPendingOrOverdue && (
          <>
            {!invoice.boleto_url && (
              <MenuButton onClick={() => setSubMenu("boleto")}>
                <Barcode className="mr-2 h-4 w-4" />
                Gerar Boleto
              </MenuButton>
            )}
            {!invoice.pix_code && (
              <MenuButton onClick={() => setSubMenu("pix")}>
                <QrCode className="mr-2 h-4 w-4" />
                Gerar PIX
              </MenuButton>
            )}
          </>
        )}

        {/* Baixa Manual / Marcar como Pago */}
        {isPendingOrOverdue && (
          <>
            <MenuButton onClick={() => closeAndRun(onManualPayment)}>
              <HandCoins className="mr-2 h-4 w-4" />
              Baixa Manual
            </MenuButton>
            <MenuButton onClick={() => closeAndRun(onMarkAsPaid)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar como Pago (rápido)
            </MenuButton>
          </>
        )}

        {/* Segunda Via / Renegociar */}
        {invoice.status === "overdue" && (
          <>
            <MenuButton onClick={() => closeAndRun(onSecondCopy)}>
              <Barcode className="mr-2 h-4 w-4" />
              Segunda Via
            </MenuButton>
            <MenuButton onClick={() => closeAndRun(onRenegotiate)}>
              <HandCoins className="mr-2 h-4 w-4" />
              Renegociar
            </MenuButton>
          </>
        )}

        {/* Notificações */}
        {isPendingOrOverdue && hasPaymentMethod && (
          <>
            <MenuSeparator />
            <MenuButton
              onClick={() => closeAndRun(() => onResendNotification(invoice.id, ["email"]))}
              disabled={sendingNotification !== null}
            >
              <Mail className="mr-2 h-4 w-4" />
              Enviar por Email
            </MenuButton>
            <MenuButton
              onClick={() => closeAndRun(() => onResendNotification(invoice.id, ["whatsapp"]))}
              disabled={sendingNotification !== null}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Enviar por WhatsApp
            </MenuButton>
            <MenuButton
              onClick={() => closeAndRun(() => onResendNotification(invoice.id, ["email", "whatsapp"]))}
              disabled={sendingNotification !== null}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar Email + WhatsApp
            </MenuButton>
          </>
        )}

        {/* NFS-e Manual */}
        {invoice.contract_id && isPendingOrOverdue && (
          <>
            <MenuSeparator />
            <MenuButton onClick={() => closeAndRun(onEmitNfse)}>
              <FileText className="mr-2 h-4 w-4" />
              Emitir NFS-e Manual
            </MenuButton>
          </>
        )}

        {/* Cancel Actions */}
        <MenuSeparator />
        <MenuButton
          onClick={() => canCancelBoleto && closeAndRun(onCancelBoleto)}
          disabled={!canCancelBoleto}
          className={canCancelBoleto ? "text-destructive" : ""}
        >
          <Ban className="mr-2 h-4 w-4" />
          <div className="flex flex-col items-start">
            <span>Cancelar Boleto</span>
            {!canCancelBoleto && (
              <span className="text-xs text-muted-foreground">
                {!hasBoleto ? "Nenhum boleto gerado" : "Boleto de fatura paga não pode ser cancelado"}
              </span>
            )}
          </div>
        </MenuButton>

        <MenuButton
          onClick={() => hasAuthorizedNfse && closeAndRun(onCancelNfse)}
          disabled={!hasAuthorizedNfse}
          className={hasAuthorizedNfse ? "text-destructive" : ""}
        >
          <XCircle className="mr-2 h-4 w-4" />
          <div className="flex flex-col items-start">
            <span>Cancelar NFS-e</span>
            {!hasAuthorizedNfse && (
              <span className="text-xs text-muted-foreground">
                {nfseInfo ? `NFS-e "${nfseInfo.status}" não pode ser cancelada` : "Sem NFS-e vinculada"}
              </span>
            )}
          </div>
        </MenuButton>

        {/* Histórico */}
        <MenuSeparator />
        <MenuButton onClick={() => closeAndRun(onViewHistory)}>
          <Clock className="mr-2 h-4 w-4" />
          Ver Histórico
        </MenuButton>
      </PopoverContent>
    </Popover>
  );
}
