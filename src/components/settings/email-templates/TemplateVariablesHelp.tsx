import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TemplateVariablesHelpProps {
  templateType: string;
}

const TEMPLATE_VARIABLES: Record<string, { variable: string; description: string }[]> = {
  nfse: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{nfse_number}}", description: "Número da NFS-e" },
    { variable: "{{valor}}", description: "Valor da nota" },
    { variable: "{{competencia}}", description: "Mês/Ano de competência" },
    { variable: "{{pdf_url}}", description: "Link para o PDF" },
  ],
  ticket_created: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{ticket_number}}", description: "Número do chamado" },
    { variable: "{{title}}", description: "Título do chamado" },
    { variable: "{{status}}", description: "Status atual" },
    { variable: "{{priority}}", description: "Prioridade" },
    { variable: "{{portal_url}}", description: "Link para o portal" },
  ],
  ticket_updated: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{ticket_number}}", description: "Número do chamado" },
    { variable: "{{title}}", description: "Título do chamado" },
    { variable: "{{status}}", description: "Novo status" },
    { variable: "{{portal_url}}", description: "Link para o portal" },
  ],
  ticket_commented: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{ticket_number}}", description: "Número do chamado" },
    { variable: "{{title}}", description: "Título do chamado" },
    { variable: "{{comment}}", description: "Texto do comentário" },
    { variable: "{{portal_url}}", description: "Link para o portal" },
  ],
  ticket_resolved: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{ticket_number}}", description: "Número do chamado" },
    { variable: "{{title}}", description: "Título do chamado" },
    { variable: "{{portal_url}}", description: "Link para o portal" },
  ],
  invoice_reminder: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{invoice_number}}", description: "Número da fatura" },
    { variable: "{{amount}}", description: "Valor da fatura" },
    { variable: "{{due_date}}", description: "Data de vencimento" },
    { variable: "{{days_until_due}}", description: "Dias até o vencimento" },
  ],
  invoice_payment: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{invoice_number}}", description: "Número da fatura" },
    { variable: "{{amount}}", description: "Valor da fatura" },
    { variable: "{{due_date}}", description: "Data de vencimento" },
    { variable: "{{boleto_url}}", description: "Link do boleto" },
    { variable: "{{boleto_barcode}}", description: "Código de barras" },
    { variable: "{{pix_code}}", description: "Código PIX" },
  ],
  invoice_collection_reminder: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{invoice_number}}", description: "Número da fatura" },
    { variable: "{{amount}}", description: "Valor da fatura" },
    { variable: "{{due_date}}", description: "Data de vencimento" },
  ],
  invoice_collection_urgent: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{invoice_number}}", description: "Número da fatura" },
    { variable: "{{amount}}", description: "Valor da fatura" },
    { variable: "{{due_date}}", description: "Data de vencimento" },
  ],
  invoice_collection_final: [
    { variable: "{{client_name}}", description: "Nome do cliente" },
    { variable: "{{invoice_number}}", description: "Número da fatura" },
    { variable: "{{amount}}", description: "Valor da fatura" },
    { variable: "{{due_date}}", description: "Data de vencimento" },
  ],
  certificate_expiry_warning: [
    { variable: "{{company_name}}", description: "Nome da empresa" },
    { variable: "{{cnpj}}", description: "CNPJ da empresa" },
    { variable: "{{days_remaining}}", description: "Dias restantes" },
    { variable: "{{expiry_date}}", description: "Data de expiração" },
  ],
  certificate_expiry_critical: [
    { variable: "{{company_name}}", description: "Nome da empresa" },
    { variable: "{{cnpj}}", description: "CNPJ da empresa" },
    { variable: "{{days_remaining}}", description: "Dias restantes" },
    { variable: "{{expiry_date}}", description: "Data de expiração" },
  ],
  certificate_expiry_expired: [
    { variable: "{{company_name}}", description: "Nome da empresa" },
    { variable: "{{cnpj}}", description: "CNPJ da empresa" },
    { variable: "{{expiry_date}}", description: "Data de expiração" },
  ],
  alert: [
    { variable: "{{level}}", description: "Nível do alerta" },
    { variable: "{{title}}", description: "Título do alerta" },
    { variable: "{{message}}", description: "Mensagem do alerta" },
    { variable: "{{device_name}}", description: "Nome do dispositivo" },
    { variable: "{{client_name}}", description: "Nome do cliente" },
  ],
};

export function TemplateVariablesHelp({ templateType }: TemplateVariablesHelpProps) {
  const variables = TEMPLATE_VARIABLES[templateType] || [];

  if (variables.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <HelpCircle className="h-4 w-4" />
          Variáveis disponíveis
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Variáveis do Template</h4>
          <p className="text-xs text-muted-foreground">
            Use estas variáveis no seu template. Elas serão substituídas pelos valores reais no envio.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {variables.map((v) => (
              <div key={v.variable} className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  {v.variable}
                </Badge>
                <span className="text-xs text-muted-foreground">{v.description}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground border-t pt-2">
            Use <code className="bg-muted px-1 rounded">{"{{#variavel}}...{{/variavel}}"}</code> para conteúdo condicional.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
