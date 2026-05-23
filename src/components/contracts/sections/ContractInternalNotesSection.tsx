import { UseFormReturn } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Lock } from "lucide-react";
import type { ContractFormData } from "../ContractForm";

interface ContractInternalNotesSectionProps {
  form: UseFormReturn<ContractFormData>;
}

export function ContractInternalNotesSection({ form }: ContractInternalNotesSectionProps) {
  return (
    <>
      <Separator className="my-6" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Lock className="h-5 w-5 text-muted-foreground" />
          Observações Internas
        </div>

        <FormField
          control={form.control}
          name="internal_notes"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="Anotações visíveis apenas para a equipe..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Estas observações não aparecem para o cliente
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
