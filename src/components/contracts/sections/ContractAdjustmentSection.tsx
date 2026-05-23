import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { DatePickerField } from "./DatePickerField";
import type { ContractFormData } from "../ContractForm";

interface ContractAdjustmentSectionProps {
  form: UseFormReturn<ContractFormData>;
}

export function ContractAdjustmentSection({ form }: ContractAdjustmentSectionProps) {
  return (
    <>
      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" />
          Reajuste Anual
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="adjustment_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data do Próximo Reajuste</FormLabel>
                <DatePickerField field={field} label="Data do Próximo Reajuste" />
                <FormDescription>Geralmente 1 ano após início</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="adjustment_index"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Índice de Reajuste</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent modal={false}>
                    <SelectItem value="IGPM">IGP-M</SelectItem>
                    <SelectItem value="IPCA">IPCA</SelectItem>
                    <SelectItem value="INPC">INPC</SelectItem>
                    <SelectItem value="FIXO">Percentual Fixo</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("adjustment_index") === "FIXO" && (
            <FormField
              control={form.control}
              name="adjustment_percentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Percentual Fixo (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="5.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </>
  );
}
