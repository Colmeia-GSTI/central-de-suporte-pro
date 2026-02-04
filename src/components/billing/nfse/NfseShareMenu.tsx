import { useState } from "react";
import { Copy, Loader2, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NfseShareMenuProps {
  nfse: {
    id: string;
    numero_nfse: string | null;
    pdf_url: string | null;
    valor_servico: number;
    clients: {
      name: string;
      email: string | null;
      whatsapp: string | null;
    } | null;
  };
  variant?: "icon" | "button";
}

export function NfseShareMenu({ nfse, variant = "icon" }: NfseShareMenuProps) {
  const [sending, setSending] = useState<"email" | "whatsapp" | null>(null);
  const [open, setOpen] = useState(false);

  const hasPdf = !!nfse.pdf_url;
  const hasEmail = !!nfse.clients?.email;
  const hasWhatsapp = !!nfse.clients?.whatsapp;

  const handleSend = async (channel: "email" | "whatsapp") => {
    if (channel === "email" && !hasEmail) {
      toast.error("Cliente sem email", {
        description: "Cadastre o email do cliente antes de enviar.",
      });
      return;
    }

    if (channel === "whatsapp" && !hasWhatsapp) {
      toast.error("Cliente sem WhatsApp", {
        description: "Cadastre o WhatsApp do cliente antes de enviar.",
      });
      return;
    }

    setSending(channel);
    try {
      const { data, error } = await supabase.functions.invoke("send-nfse-notification", {
        body: {
          nfse_history_id: nfse.id,
          channels: [channel],
        },
      });

      if (error) throw error;

      const result = data as { success: boolean; results: { channel: string; success: boolean; error?: string }[] };
      const channelResult = result.results?.find((r) => r.channel === channel);

      if (channelResult?.success) {
        toast.success(`NFS-e enviada por ${channel === "email" ? "Email" : "WhatsApp"}`, {
          description: `Nota #${nfse.numero_nfse || "N/A"} enviada para ${nfse.clients?.name}`,
        });
      } else {
        toast.error(`Erro ao enviar por ${channel === "email" ? "Email" : "WhatsApp"}`, {
          description: channelResult?.error || "Falha no envio",
        });
      }
    } catch (e) {
      toast.error("Erro ao enviar NFS-e", { description: getErrorMessage(e) });
    } finally {
      setSending(null);
      setOpen(false);
    }
  };

  const handleCopyLink = async () => {
    if (!nfse.pdf_url) {
      toast.error("PDF não disponível");
      return;
    }

    try {
      // Generate signed URL for clipboard
      if (nfse.pdf_url.startsWith("nfse-files/")) {
        const path = nfse.pdf_url.replace("nfse-files/", "");
        const { data, error } = await supabase.storage
          .from("nfse-files")
          .createSignedUrl(path, 86400); // 24 hours

        if (error) throw error;
        await navigator.clipboard.writeText(data.signedUrl);
      } else {
        await navigator.clipboard.writeText(nfse.pdf_url);
      }

      toast.success("Link copiado!", {
        description: "O link do PDF é válido por 24 horas.",
      });
    } catch (e) {
      toast.error("Erro ao copiar link", { description: getErrorMessage(e) });
    } finally {
      setOpen(false);
    }
  };

  if (!hasPdf) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>PDF não disponível</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const trigger = variant === "button" ? (
    <Button variant="outline" size="sm">
      {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
      Compartilhar
    </Button>
  ) : (
    <Button variant="ghost" size="icon" className="h-8 w-8">
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              {trigger}
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Compartilhar NFS-e</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleSend("email")}
          disabled={sending !== null}
          className="flex items-center gap-2"
        >
          {sending === "email" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          <span>Enviar por Email</span>
          {!hasEmail && <span className="text-xs text-muted-foreground">(sem email)</span>}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSend("whatsapp")}
          disabled={sending !== null}
          className="flex items-center gap-2"
        >
          {sending === "whatsapp" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          <span>Enviar por WhatsApp</span>
          {!hasWhatsapp && <span className="text-xs text-muted-foreground">(sem número)</span>}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleCopyLink}
          disabled={sending !== null}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          <span>Copiar link do PDF</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
