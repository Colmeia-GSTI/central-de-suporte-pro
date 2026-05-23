import { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CreditCard } from "lucide-react";
import { DatePickerField } from "./DatePickerField";
import type { ContractFormData } from "../ContractForm";

interface ContractBillingSectionProps {
  form: UseFormReturn<ContractFormData>;
  calculatedTotal: number;
  isNewContract: boolean;
}

export function ContractBillingSection({ form, calculatedTotal, isNewContract }: ContractBillingSectionProps) {
  return (
    <>
      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-primary" />
          Faturamento
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="billing_day"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dia do Vencimento</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="28" {...field} />
                </FormControl>
                <FormDescription>Dia 1 a 28</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="days_before_due"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dias de Antecedência</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="30" {...field} />
                </FormControl>
                <FormDescription>Para geração automática</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormItem>
            <FormLabel>Provedor de Cobrança</FormLabel>
            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
              <span className="font-medium">Asaas</span>
              <span className="text-xs text-muted-foreground">(único provedor ativo)</span>
            </div>
            <FormDescription>Boleto, PIX e NFS-e via Asaas</FormDescription>
          </FormItem>

          <FormField
            control={form.control}
            name="payment_preference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferência de Pagamento</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent modal={false}>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="both">Boleto + PIX</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="billing_frequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Periodicidade da Cobrança</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent modal={false}>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="bimonthly">Bimestral (a cada 2 meses)</SelectItem>
                  <SelectItem value="quarterly">Trimestral (a cada 3 meses)</SelectItem>
                  <SelectItem value="semiannual">Semestral (a cada 6 meses)</SelectItem>
                  <SelectItem value="yearly">Anual (a cada 12 meses)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                O cron de geração de faturas pula meses não-elegíveis. Mudar a periodicidade afeta apenas faturas futuras.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Initial Invoice Generation - Only for new contracts */}
        {/* First Payment Date - always visible */}
        <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-4">
          <FormField
            control={form.control}
            name="first_payment_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>📅 Data do Primeiro Pagamento</FormLabel>
                <DatePickerField field={field} label="Data do Primeiro Pagamento" />
                <FormDescription>
                  Data de vencimento da primeira fatura deste contrato. Se não informada, será calculada pelo dia de vencimento ({form.watch("billing_day") || 10}) do mês atual.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("first_payment_date") && (
            <div className="text-sm text-muted-foreground bg-background/50 rounded p-2">
              <p><strong>Competência:</strong> {form.watch("first_payment_date")!.substring(0, 7)}</p>
              <p><strong>Vencimento:</strong> {form.watch("first_payment_date")}</p>
              <p><strong>Valor:</strong> {calculatedTotal > 0 ? `R$ ${calculatedTotal.toFixed(2)}` : "Será calculado pelos serviços"}</p>
            </div>
          )}

          {isNewContract && (
            <>
              <FormField
                control={form.control}
                name="generate_initial_invoice"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="cursor-pointer font-medium">
                        Gerar primeira cobrança ao criar contrato
                      </FormLabel>
                      <FormDescription>
                        A fatura será gerada com base na data do primeiro pagamento acima
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("generate_initial_invoice") && (
                <div className="ml-6 space-y-3 border-l-2 border-primary/30 pl-4">
                  <FormField
                    control={form.control}
                    name="generate_payment"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer text-sm">
                          Gerar boleto/PIX automaticamente (Asaas)
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="send_notification"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer text-sm">
                          Enviar notificação por email
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
