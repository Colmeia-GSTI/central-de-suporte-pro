import { Ticket, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PortalSection = "chamados" | "financeiro";

interface Props {
  active: PortalSection;
  onChange: (s: PortalSection) => void;
}

export function ClientPortalNav({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <Button variant={active === "chamados" ? "default" : "outline"} onClick={() => onChange("chamados")} className="gap-2">
        <Ticket className="h-4 w-4" />
        Chamados
      </Button>
      <Button variant={active === "financeiro" ? "default" : "outline"} onClick={() => onChange("financeiro")} className="gap-2">
        <DollarSign className="h-4 w-4" />
        Financeiro
      </Button>
    </div>
  );
}
