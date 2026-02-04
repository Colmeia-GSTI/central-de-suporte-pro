import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const formSchema = z.object({
  codigo_tributacao: z
    .string()
    .min(1, "Código tributário é obrigatório")
    .regex(/^[\d.]+$/, "Formato inválido. Use números e pontos (ex: 1.04)"),
  descricao: z
    .string()
    .min(10, "Descrição deve ter pelo menos 10 caracteres")
    .max(2000, "Descrição muito longa"),
  item_lista: z.string().optional(),
  subitem_lista: z.string().optional(),
  cnae_principal: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{7}$/.test(val),
      "CNAE deve ter 7 dígitos"
    ),
  aliquota_sugerida: z
    .string()
    .optional()
    .refine(
      (val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 5),
      "Alíquota deve estar entre 0 e 5%"
    ),
  categoria: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export interface ServiceCode {
  id: string;
  codigo_tributacao: string;
  descricao: string;
  cnae_principal: string | null;
  aliquota_sugerida: number | null;
  categoria: string | null;
}

interface ServiceCodeFormProps {
  onSuccess: (code: ServiceCode) => void;
  onCancel: () => void;
}

const categories = [
  { value: "informatica", label: "Informática" },
  { value: "consultoria", label: "Consultoria" },
  { value: "manutencao", label: "Manutenção" },
  { value: "treinamento", label: "Treinamento" },
];

export function ServiceCodeForm({ onSuccess, onCancel }: ServiceCodeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_tributacao: "",
      descricao: "",
      item_lista: "",
      subitem_lista: "",
      cnae_principal: "",
      aliquota_sugerida: "",
      categoria: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        codigo_tributacao: data.codigo_tributacao,
        descricao: data.descricao,
        item_lista: data.item_lista || null,
        subitem_lista: data.subitem_lista || null,
        cnae_principal: data.cnae_principal || null,
        aliquota_sugerida: data.aliquota_sugerida
          ? parseFloat(data.aliquota_sugerida)
          : null,
        categoria: data.categoria || null,
        ativo: true,
      };

      const { data: newCode, error } = await supabase
        .from("nfse_service_codes")
        .insert(payload)
        .select("id, codigo_tributacao, descricao, cnae_principal, aliquota_sugerida, categoria")
        .single();

      if (error) {
        if (error.code === "23505") {
          toast.error("Este código tributário já está cadastrado");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Código de serviço cadastrado com sucesso!");
      onSuccess(newCode);
    } catch (error) {
      logger.error("Erro ao cadastrar código", "NFSe", { error: String(error) });
      toast.error("Erro ao cadastrar código de serviço");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="codigo_tributacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código Tributação *</FormLabel>
                <FormControl>
                  <Input placeholder="1.04" {...field} />
                </FormControl>
                <FormDescription>Código conforme LC 116</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="item_lista"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Item Lista</FormLabel>
                <FormControl>
                  <Input placeholder="1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="subitem_lista"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subitem Lista</FormLabel>
                <FormControl>
                  <Input placeholder="04" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cnae_principal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNAE Principal</FormLabel>
                <FormControl>
                  <Input placeholder="6201501" maxLength={7} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="aliquota_sugerida"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Alíquota ISS (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    placeholder="2.5"
                    {...field}
                  />
                </FormControl>
                <FormDescription>Entre 0 e 5%</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição do Serviço *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Descrição detalhada do serviço conforme LC 116..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </div>
      </form>
    </Form>
  );
}
