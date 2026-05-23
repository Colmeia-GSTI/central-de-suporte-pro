import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FormControl } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon } from "lucide-react";

interface DatePickerFieldProps {
  field: { value: string; onChange: (v: string) => void };
  label: string;
  description?: string;
}

export function DatePickerField({ field }: DatePickerFieldProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            className={cn(
              "w-full pl-3 text-left font-normal",
              !field.value && "text-muted-foreground"
            )}
          >
            {field.value ? (
              format(parse(field.value, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
            ) : (
              <span>Selecione a data</span>
            )}
            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown-buttons"
          fromYear={2020}
          toYear={2036}
          fixedWeeks
          selected={field.value ? parse(field.value, "yyyy-MM-dd", new Date()) : undefined}
          onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
          locale={ptBR}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
