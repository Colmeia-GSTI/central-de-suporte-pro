import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceValidationResult } from "@/lib/invoice-validation";

interface InvoiceValidationPanelProps {
  validationResult: InvoiceValidationResult | null;
  isValidating?: boolean;
  onRetryValidation?: () => void;
  executionId?: string | null;
}

export function InvoiceValidationPanel({
  validationResult,
  isValidating = false,
  onRetryValidation,
  executionId,
}: InvoiceValidationPanelProps) {
  if (!validationResult) {
    return null;
  }

  const { isValid, errors, warnings } = validationResult;

  return (
    <Card className={isValid ? "border-green-200" : "border-red-200"}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isValid ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span>Fatura Válida</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span>Erros de Validação</span>
              </>
            )}
          </CardTitle>
          {onRetryValidation && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetryValidation}
              disabled={isValidating}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {isValidating ? "Validando..." : "Revalidar"}
            </Button>
          )}
        </div>
        {executionId && (
          <p className="text-xs text-gray-500 mt-2">ID: {executionId}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {errors.length > 0 && (
          <div>
            <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Erros ({errors.length})
            </h4>
            <ul className="space-y-1">
              {errors.map((error, idx) => (
                <li key={idx} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                  <strong>{error.field}</strong>: {error.message}
                  <span className="text-xs text-gray-500 ml-2">({error.code})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div>
            <h4 className="font-semibold text-yellow-600 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Avisos ({warnings.length})
            </h4>
            <ul className="space-y-1">
              {warnings.map((warning, idx) => (
                <li key={idx} className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                  <strong>{warning.field}</strong>: {warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isValid && errors.length === 0 && (
          <p className="text-sm text-green-700">
            ✓ Todos os dados foram validados com sucesso!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
