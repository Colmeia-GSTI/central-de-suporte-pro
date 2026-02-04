import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { ServiceCodeForm, type ServiceCode } from "./ServiceCodeForm";

interface ServiceCodeSelectProps {
  value?: string;
  onSelect: (code: ServiceCode | null) => void;
  disabled?: boolean;
}

const categoryLabels: Record<string, string> = {
  informatica: "Informática",
  consultoria: "Consultoria",
  manutencao: "Manutenção",
  treinamento: "Treinamento",
};

export function ServiceCodeSelect({ value, onSelect, disabled }: ServiceCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadServiceCodes();
  }, []);

  const loadServiceCodes = async () => {
    try {
      const { data, error } = await supabase
        .from("nfse_service_codes")
        .select("id, codigo_tributacao, descricao, cnae_principal, aliquota_sugerida, categoria")
        .eq("ativo", true)
        .order("codigo_tributacao");

      if (error) throw error;
      setServiceCodes(data || []);
    } catch (error) {
      logger.error("Erro ao carregar códigos de serviço", "NFSe", { error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const selectedCode = serviceCodes.find((c) => c.codigo_tributacao === value);

  const filteredCodes = selectedCategory
    ? serviceCodes.filter((c) => c.categoria === selectedCategory)
    : serviceCodes;

  const categories = Array.from(new Set(serviceCodes.map((c) => c.categoria).filter(Boolean)));

  const handleNewCodeSuccess = (newCode: ServiceCode) => {
    setServiceCodes((prev) => [...prev, newCode].sort((a, b) => 
      a.codigo_tributacao.localeCompare(b.codigo_tributacao)
    ));
    onSelect(newCode);
    setIsFormOpen(false);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
            disabled={disabled}
          >
            {selectedCode ? (
              <span className="truncate">
                <span className="font-mono text-primary">{selectedCode.codigo_tributacao}</span>
                <span className="mx-2">-</span>
                <span className="text-muted-foreground">
                  {selectedCode.descricao.substring(0, 40)}...
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Selecione o código de serviço...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar código ou descrição..." />
            
            {/* Category filters */}
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
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                >
                  {categoryLabels[cat || ""] || cat}
                </Badge>
              ))}
            </div>

            <CommandList>
              <CommandEmpty>
                {loading ? (
                  "Carregando..."
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-muted-foreground mb-3">Nenhum código encontrado.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsFormOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Cadastrar novo código
                    </Button>
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredCodes.map((code) => (
                  <CommandItem
                    key={code.id}
                    value={`${code.codigo_tributacao} ${code.descricao}`}
                    onSelect={() => {
                      onSelect(code);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start py-3"
                  >
                    <div className="flex items-center w-full">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === code.codigo_tributacao ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-primary">
                            {code.codigo_tributacao}
                          </span>
                          {code.aliquota_sugerida && (
                            <Badge variant="secondary" className="text-xs">
                              {code.aliquota_sugerida}%
                            </Badge>
                          )}
                          {code.categoria && (
                            <Badge variant="outline" className="text-xs">
                              {categoryLabels[code.categoria] || code.categoria}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {code.descricao}
                        </p>
                        {code.cnae_principal && (
                          <span className="text-xs text-muted-foreground">
                            CNAE: {code.cnae_principal}
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>

            {/* Footer with add button */}
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setIsFormOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar novo código de serviço
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Sheet for new service code - avoids nested dialog portal issues */}
      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Novo Código de Serviço</SheetTitle>
            <SheetDescription>
              Cadastre um código tributário conforme LC 116/2003
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ServiceCodeForm
              onSuccess={handleNewCodeSuccess}
              onCancel={() => setIsFormOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
