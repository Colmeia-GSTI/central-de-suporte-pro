import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Eye, Info } from "lucide-react";

interface ContractNotificationMessageFormProps {
  value: string;
  onChange: (value: string) => void;
  clientName?: string;
}

const AVAILABLE_VARIABLES = [
  { key: "{cliente}", description: "Nome do cliente" },
  { key: "{valor}", description: "Valor da fatura" },
  { key: "{vencimento}", description: "Data de vencimento" },
  { key: "{fatura}", description: "Número da fatura" },
  { key: "{contrato}", description: "Nome do contrato" },
  { key: "{boleto}", description: "Link do boleto" },
  { key: "{pix}", description: "Código PIX copia-e-cola" },
];

const DEFAULT_MESSAGE = `Olá {cliente}!

Segue sua fatura #{fatura} no valor de {valor}.
Vencimento: {vencimento}.

Qualquer dúvida, estamos à disposição!`;

export function ContractNotificationMessageForm({
  value,
  onChange,
  clientName = "Cliente Exemplo",
}: ContractNotificationMessageFormProps) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    // Generate preview with sample data
    const sampleData = {
      "{cliente}": clientName,
      "{valor}": "R$ 1.500,00",
      "{vencimento}": "10/02/2026",
      "{fatura}": "12345",
      "{contrato}": "Suporte Mensal",
      "{boleto}": "https://banco.inter/boleto/123",
      "{pix}": "00020126580014br.gov.bcb...",
    };

    let previewText = value || DEFAULT_MESSAGE;
    Object.entries(sampleData).forEach(([key, val]) => {
      previewText = previewText.replace(new RegExp(key, "g"), val);
    });
    setPreview(previewText);
  }, [value, clientName]);

  const insertVariable = (variable: string) => {
    onChange((value || "") + variable);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Mensagem Personalizada para Cobranças
        </Label>
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={DEFAULT_MESSAGE}
          rows={5}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="text-sm text-muted-foreground mr-2">Variáveis:</span>
        {AVAILABLE_VARIABLES.map((v) => (
          <Badge
            key={v.key}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10 transition-colors"
            onClick={() => insertVariable(v.key)}
            title={v.description}
          >
            {v.key}
          </Badge>
        ))}
      </div>

      <Card className="bg-muted/30">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Pré-visualização
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3">
          <div className="whitespace-pre-wrap text-sm bg-background rounded-lg p-3 border">
            {preview}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Se deixar em branco, será usada a mensagem padrão do sistema.
          As variáveis serão substituídas automaticamente no envio.
        </p>
      </div>
    </div>
  );
}
