import { useEffect, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { validateInvoiceItems, InvoiceItemData } from "@/lib/invoice-validation";

interface InvoiceItemsValidatorProps {
  items: InvoiceItemData[];
  totalAmount: number;
  onItemsChange: (items: InvoiceItemData[]) => void;
  onValidChange?: (isValid: boolean) => void;
}

export function InvoiceItemsValidator({
  items,
  totalAmount,
  onItemsChange,
  onValidChange,
}: InvoiceItemsValidatorProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate items whenever they change
  useEffect(() => {
    const validationErrors = validateInvoiceItems(items, totalAmount);
    const errorMap: Record<string, string> = {};

    validationErrors.forEach((error) => {
      errorMap[error.field] = error.message;
    });

    setErrors(errorMap);
    onValidChange?.(validationErrors.length === 0);
  }, [items, totalAmount, onValidChange]);

  const handleAddItem = () => {
    const newItem: InvoiceItemData = {
      description: "",
      quantity: 1,
      unit_value: 0,
      total_value: 0,
    };
    onItemsChange([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItemData,
    value: unknown
  ) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === "quantity" || field === "unit_value") {
      const numValue = Number(value);
      item[field] = numValue;
      // Auto-calculate total_value
      if ("quantity" in item && "unit_value" in item) {
        item.total_value = item.quantity * item.unit_value;
      }
    } else if (field === "description") {
      item[field] = String(value);
    } else {
      item[field] = value;
    }

    onItemsChange(newItems);
  };

  const itemsSum = items.reduce((sum, item) => sum + item.total_value, 0);
  const isValidSum = Math.abs(itemsSum - totalAmount) <= 0.01;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Itens da Fatura</h3>
        <Button size="sm" onClick={handleAddItem}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Item
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 italic">Nenhum item adicionado</p>
      ) : (
        <>
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Descrição</TableHead>
                <TableHead className="w-20">Qtd</TableHead>
                <TableHead className="w-24">Valor Unit.</TableHead>
                <TableHead className="w-24">Total</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      size="sm"
                      className="h-8"
                      placeholder="Descrição"
                      value={item.description}
                      onChange={(e) =>
                        handleItemChange(idx, "description", e.target.value)
                      }
                    />
                    {errors[`items[${idx}].description`] && (
                      <p className="text-xs text-red-600 mt-1">
                        {errors[`items[${idx}].description`]}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      size="sm"
                      type="number"
                      className="h-8"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, "quantity", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      size="sm"
                      type="number"
                      className="h-8"
                      min="0"
                      step="0.01"
                      value={item.unit_value.toFixed(2)}
                      onChange={(e) =>
                        handleItemChange(idx, "unit_value", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {item.total_value.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Summary and validation */}
          <div className="bg-gray-50 p-3 rounded-lg space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Soma dos Itens:</span>
              <span>R$ {itemsSum.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Valor Total da Fatura:</span>
              <span>R$ {totalAmount.toFixed(2)}</span>
            </div>

            {!isValidSum && items.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle className="h-4 w-4" />
                <span>
                  A soma dos itens ({itemsSum.toFixed(2)}) não corresponde ao
                  valor total ({totalAmount.toFixed(2)})
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
