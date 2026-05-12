import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientTicketForm } from "@/components/client-portal/ClientTicketForm";
import type { ClientMonitoredDevice } from "@/hooks/useClientMonitoredDevices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  defaultPhone: string | null;
  defaultIsWhatsapp: boolean;
  monitoredDevices: ClientMonitoredDevice[];
  clientAssets: { id: string; name: string; asset_type: string }[];
  categories: { id: string; name: string }[];
  onCreated: () => void;
}

export function NewTicketDialog({
  open, onOpenChange,
  contactName, defaultPhone, defaultIsWhatsapp,
  monitoredDevices, clientAssets, categories, onCreated,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir Novo Chamado</DialogTitle>
        </DialogHeader>
        <ClientTicketForm
          contactName={contactName}
          defaultPhone={defaultPhone}
          defaultIsWhatsapp={defaultIsWhatsapp}
          monitoredDevices={monitoredDevices}
          clientAssets={clientAssets}
          categories={categories}
          onSuccess={() => {
            onOpenChange(false);
            onCreated();
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
