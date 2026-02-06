import { AlertCircle, CheckCircle2, Clock, Download, File, Mail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface InvoiceActionIndicatorsProps {
  boletoStatus?: "pendente" | "gerado" | "enviado" | "erro" | null;
  boletoUrl?: string | null;
  boletoError?: string | null;

  nfseStatus?: "pendente" | "gerada" | "erro" | null;
  nfseUrl?: string | null;
  nfseError?: string | null;

  emailStatus?: "pendente" | "enviado" | "erro" | null;
  emailError?: string | null;

  onBoletoClick?: () => void;
  onNfseClick?: () => void;
  onEmailClick?: () => void;

  size?: "sm" | "md" | "lg";
}

export function InvoiceActionIndicators({
  boletoStatus,
  boletoUrl,
  boletoError,
  nfseStatus,
  nfseUrl,
  nfseError,
  emailStatus,
  emailError,
  onBoletoClick,
  onNfseClick,
  onEmailClick,
  size = "md",
}: InvoiceActionIndicatorsProps) {
  const iconSize = size === "sm" ? 16 : size === "lg" ? 24 : 20;

  const renderBoletoIndicator = () => {
    const baseClass = "cursor-pointer transition-all hover:scale-110";

    if (boletoStatus === "erro") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-danger`}
              onClick={onBoletoClick}
              title="Erro no boleto"
            >
              <AlertCircle size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs">
              <p className="font-semibold">Erro no boleto</p>
              <p className="text-sm">{boletoError || "Erro desconhecido"}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (boletoStatus === "enviado" && boletoUrl) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-success`}
              onClick={onBoletoClick}
              title="Boleto enviado - clique para baixar"
            >
              <CheckCircle2 size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Boleto enviado ao banco</p>
            <p className="text-xs text-muted-foreground">Clique para abrir/baixar</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (boletoStatus === "gerado") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-warning`}
              onClick={onBoletoClick}
              title="Boleto gerado"
            >
              <File size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Boleto gerado</p>
            <p className="text-xs text-muted-foreground">Aguardando envio</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Pendente
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${baseClass} text-muted-foreground`}
            onClick={onBoletoClick}
            title="Boleto pendente"
          >
            <Clock size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Boleto não processado</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderNfseIndicator = () => {
    const baseClass = "cursor-pointer transition-all hover:scale-110";

    if (nfseStatus === "erro") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-danger`}
              onClick={onNfseClick}
              title="Erro na NFS-e"
            >
              <AlertCircle size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs">
              <p className="font-semibold">Erro na NFS-e</p>
              <p className="text-sm">{nfseError || "Erro desconhecido"}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (nfseStatus === "gerada" && nfseUrl) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-success`}
              onClick={onNfseClick}
              title="NFS-e gerada - clique para baixar"
            >
              <CheckCircle2 size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>NFS-e gerada com sucesso</p>
            <p className="text-xs text-muted-foreground">Clique para abrir/baixar</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Pendente
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${baseClass} text-muted-foreground`}
            onClick={onNfseClick}
            title="NFS-e pendente"
          >
            <Clock size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>NFS-e não processada</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderEmailIndicator = () => {
    const baseClass = "cursor-pointer transition-all hover:scale-110";

    if (emailStatus === "erro") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-danger`}
              onClick={onEmailClick}
              title="Erro no envio de email"
            >
              <AlertCircle size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs">
              <p className="font-semibold">Erro no email</p>
              <p className="text-sm">{emailError || "Erro desconhecido"}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (emailStatus === "enviado") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${baseClass} text-status-success`}
              onClick={onEmailClick}
              title="Email enviado"
            >
              <CheckCircle2 size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Email enviado com sucesso</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Pendente
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${baseClass} text-muted-foreground`}
            onClick={onEmailClick}
            title="Email não enviado"
          >
            <Clock size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Email não enviado</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex gap-1.5">
      {renderBoletoIndicator()}
      {renderNfseIndicator()}
      {renderEmailIndicator()}
    </div>
  );
}
