import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FileText } from "lucide-react";
import { ServiceCodeSelect } from "@/components/nfse/ServiceCodeSelect";
import type { ContractFormData } from "../ContractForm";

interface ContractNfseSectionProps {
  form: UseFormReturn<ContractFormData>;
}

export function ContractNfseSection({ form }: ContractNfseSectionProps) {
  const nfseEnabled = form.watch("nfse_enabled");

  return (
    <>
      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5 text-primary" />
          Nota Fiscal de Serviço (NFS-e)
        </div>

        <FormField
          control={form.control}
          name="nfse_enabled"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 space-y-0 rounded-lg border p-4">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-0.5">
                <FormLabel className="cursor-pointer">
                  Emitir NFS-e automaticamente
                </FormLabel>
                <FormDescription>
                  Habilita a geração de nota fiscal para este contrato
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {nfseEnabled && (
          <div className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="nfse_service_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código de Serviço</FormLabel>
                  <ServiceCodeSelect
                    value={field.value}
                    onSelect={(code) => {
                      field.onChange(code?.codigo_tributacao || "");
                      if (code?.cnae_principal) {
                        form.setValue("nfse_cnae", code.cnae_principal);
                      }
                      if (code?.aliquota_sugerida) {
                        form.setValue("nfse_aliquota", code.aliquota_sugerida);
                      }
                    }}
                  />
                  <FormDescription>
                    Código de tributação nacional conforme LC 116/2003
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nfse_aliquota"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alíquota ISS (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={25}
                        step={0.01}
                        placeholder="Ex: 2.00"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Preenchido ao selecionar código de serviço
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_iss_retido"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end">
                    <div className="flex items-center gap-3 rounded-lg border p-3 h-10">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer text-sm font-normal">
                        ISS Retido pelo Tomador
                      </FormLabel>
                    </div>
                    <FormDescription>
                      Quando o cliente retém o ISS na fonte
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nfse_cnae"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNAE</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: 6209100" />
                  </FormControl>
                  <FormDescription>
                    Preenchido automaticamente ao selecionar o código de serviço
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nfse_descricao_customizada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição do Serviço para NFS-e</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descrição detalhada do serviço que aparecerá na nota fiscal..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Se não preenchido, será gerada automaticamente com base nos serviços
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </>
  );
}
