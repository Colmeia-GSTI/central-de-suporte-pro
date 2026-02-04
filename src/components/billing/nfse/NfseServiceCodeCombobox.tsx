import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useServiceCodeUsageStats, useSortedServiceCodes, getUsageBadgeInfo } from "@/hooks/useServiceCodeUsageStats";

export type NfseServiceCode = {
  id: string;
  codigo_tributacao: string;
  descricao: string;
  cnae_principal: string | null;
  aliquota_sugerida: number | null;
  categoria: string | null;
};

const categoryLabels: Record<string, string> = {
  informatica: "Informática",
  consultoria: "Consultoria",
  manutencao: "Manutenção",
  treinamento: "Treinamento",
};

export function NfseServiceCodeCombobox(props: {
  value?: string;
  onChange: (code: NfseServiceCode | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["nfse-service-codes-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_service_codes")
        .select("id, codigo_tributacao, descricao, cnae_principal, aliquota_sugerida, categoria")
        .eq("ativo", true)
        .order("codigo_tributacao");
      if (error) throw error;
      return (data ?? []) as NfseServiceCode[];
    },
  });

  const { usageStats } = useServiceCodeUsageStats();

  const selected = codes.find((c) => c.codigo_tributacao === props.value) ?? null;

  const categories = useMemo(
    () => Array.from(new Set(codes.map((c) => c.categoria).filter(Boolean))) as string[],
    [codes]
  );

  // Apply category filter first
  const categoryFiltered = useMemo(() => {
    if (!selectedCategory) return codes;
    return codes.filter((c) => c.categoria === selectedCategory);
  }, [codes, selectedCategory]);

  // Then sort by usage
  const sortedAndFiltered = useSortedServiceCodes(categoryFiltered, usageStats);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal h-9"
          disabled={props.disabled}
        >
          {selected ? (
            <span className="font-mono font-semibold">{selected.codigo_tributacao}</span>
          ) : (
            <span className="text-muted-foreground">Selecione o código de serviço...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar código ou descrição..." />

          {/* Filtros de categoria */}
          <div className="flex flex-wrap gap-1 p-2 border-b">
            <Badge
              variant={selectedCategory === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              Todos
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedCategory((prev) => (prev === cat ? null : cat))}
              >
                {categoryLabels[cat] || cat}
              </Badge>
            ))}
          </div>

          <CommandList>
            <CommandEmpty>{isLoading ? "Carregando..." : "Nenhum código encontrado."}</CommandEmpty>
            <CommandGroup>
              {sortedAndFiltered.map((code) => {
                const isSelected = selected?.codigo_tributacao === code.codigo_tributacao;
                const { isRecent, isFrequent } = getUsageBadgeInfo(code.codigo_tributacao, usageStats);

                return (
                  <CommandItem
                    key={code.id}
                    value={`${code.codigo_tributacao} ${code.descricao}`}
                    onSelect={() => {
                      props.onChange(code);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start py-3 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    <div className="flex items-center w-full">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold">{code.codigo_tributacao}</span>
                          {code.aliquota_sugerida !== null && code.aliquota_sugerida !== undefined && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {code.aliquota_sugerida}%
                            </Badge>
                          )}
                          {code.categoria && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {categoryLabels[code.categoria] || code.categoria}
                            </Badge>
                          )}
                          {isRecent && (
                            <Badge variant="secondary" className="text-xs shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Recente
                            </Badge>
                          )}
                          {isFrequent && !isRecent && (
                            <Badge variant="secondary" className="text-xs shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Frequente
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm opacity-80 mt-1 line-clamp-2">{code.descricao}</p>
                        {code.cnae_principal && (
                          <span className="text-xs opacity-60">CNAE: {code.cnae_principal}</span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
