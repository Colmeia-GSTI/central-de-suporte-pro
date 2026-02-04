import { useMemo } from "react";

interface EmailPreviewProps {
  subject: string;
  htmlContent: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  footerText: string;
}

// Sample data for preview
const SAMPLE_DATA: Record<string, string> = {
  client_name: "Cliente Exemplo",
  nfse_number: "12345",
  valor: "R$ 1.500,00",
  competencia: "01/2026",
  pdf_url: "#",
  ticket_number: "4321",
  title: "Problema com sistema",
  status: "Em Andamento",
  priority: "Alta",
  portal_url: "#",
  comment: "Este é um exemplo de comentário adicionado ao chamado.",
  invoice_number: "9876",
  amount: "R$ 2.500,00",
  due_date: "15/02/2026",
  days_until_due: "5",
  boleto_url: "#",
  boleto_barcode: "23793.38128 60000.000003 00000.000406 1 84340000012500",
  pix_code: "00020126580014br.gov.bcb.pix0136a629534e-7693-4846-835d-2f4b5204fa42",
  company_name: "Empresa Exemplo LTDA",
  cnpj: "12.345.678/0001-90",
  days_remaining: "15",
  expiry_date: "20/02/2026",
  level: "CRÍTICO",
  message: "Serviço HTTP não está respondendo na porta 443.",
  device_name: "Servidor-01",
};

function replaceVariables(template: string, data: Record<string, string>): string {
  let result = template;
  
  // Replace simple variables {{variable}}
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value);
  });
  
  // Handle conditional blocks {{#variable}}...{{/variable}}
  Object.entries(data).forEach(([key, value]) => {
    const conditionalRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    if (value) {
      result = result.replace(conditionalRegex, "$1");
    } else {
      result = result.replace(conditionalRegex, "");
    }
  });
  
  return result;
}

export function EmailPreview({
  subject,
  htmlContent,
  logoUrl,
  primaryColor,
  secondaryColor,
  footerText,
}: EmailPreviewProps) {
  const previewHtml = useMemo(() => {
    const processedContent = replaceVariables(htmlContent, SAMPLE_DATA);
    const processedSubject = replaceVariables(subject, SAMPLE_DATA);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; }
          .email-container { max-width: 600px; margin: 0 auto; background: #fff; }
          .email-header { background: ${primaryColor}; padding: 24px; text-align: center; }
          .email-header img { max-height: 50px; max-width: 200px; }
          .email-content { padding: 32px 24px; color: #1f2937; line-height: 1.6; }
          .email-content h2 { margin-top: 0; color: #111827; }
          .email-content a { color: ${primaryColor}; }
          .email-content blockquote { border-left: 3px solid ${primaryColor}; padding-left: 15px; margin: 15px 0; background: #f9fafb; padding: 12px 15px; }
          .email-content code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          .email-footer { background: ${secondaryColor}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : `<span style="color: #fff; font-size: 18px; font-weight: 600;">Colmeia</span>`}
          </div>
          <div class="email-content">
            ${processedContent}
          </div>
          <div class="email-footer">
            ${footerText}
          </div>
        </div>
      </body>
      </html>
    `;
  }, [subject, htmlContent, logoUrl, primaryColor, secondaryColor, footerText]);

  const processedSubject = useMemo(() => replaceVariables(subject, SAMPLE_DATA), [subject]);

  return (
    <div className="border rounded-lg overflow-hidden bg-muted/30">
      <div className="bg-muted px-4 py-2 border-b">
        <p className="text-xs text-muted-foreground">Assunto:</p>
        <p className="text-sm font-medium truncate">{processedSubject}</p>
      </div>
      <iframe
        srcDoc={previewHtml}
        className="w-full h-[500px] bg-white"
        title="Email Preview"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
