import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ClientOption = {
  id: string;
  name: string;
  document?: string | null;
  nickname?: string | null;
};

interface ClientSearchComboboxProps {
  /** Lista completa de clientes (filtro é client-side) */
  clients: ClientOption[];
  /** ID do cliente selecionado (controlled) */
  value: string;
  /** Callback quando seleciona */
  onChange: (clientId: string) => void;
  /** Mostra estado de loading */
  loading?: boolean;
  /** Desabilita o combobox */
  disabled?: boolean;
  /** Texto exibido quando nada selecionado */
  placeholder?: string;
  /** Texto do empty state quando filtro não bate nada */
  emptyMessage?: string;
}

/**
 * Combobox de busca de cliente com filtro por nome, documento e apelido.
 * Substitui Select tradicional quando a lista é grande (>10 clientes) — o usuário
 * digita parte do nome (ex: "INS" para "COMERCIAL INSUMEDI") em vez de fazer scroll.
 *
 * Filtro é case-insensitive e busca **substring** (não só prefixo) em:
 * - name (razão social)
 * - document (CNPJ/CPF, com ou sem formatação)
 * - nickname (apelido interno)
 *
 * @example
 * <ClientSearchCombobox
 *   clients={clients}
 *   value={clientId}
 *   onChange={setClientId}
 *   loading={isLoading}
 * />
 */
export function ClientSearchCombobox({
  clients,
  value,
  onChange,
  loading = false,
  disabled = false,
  placeholder = "Selecione o cliente",
  emptyMessage = "Nenhum cliente encontrado",
}: ClientSearchComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === value),
    [clients, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {loading
              ? "Carregando..."
              : selectedClient
                ? (
                  <>
                    {selectedClient.name}
                    {selectedClient.document && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({selectedClient.document})
                      </span>
                    )}
                  </>
                )
                : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command
          // Filter customizado: busca em name + document + nickname (substring case-insensitive)
          filter={(itemValue, search) => {
            // itemValue contém os termos buscáveis concatenados (montado em CommandItem.value)
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase().replace(/[^\w]/g, ""); // remove pontuação do CNPJ
            const haystackNormalized = haystack.replace(/[^\w]/g, "");
            return haystackNormalized.includes(needle) ? 1 : 0;
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Digite nome, CNPJ ou apelido..."
              className="h-9 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => {
                // value contém todos os termos buscáveis (filter custom acima usa esse string)
                const searchValue = [c.name, c.document ?? "", c.nickname ?? ""].join(" ");
                return (
                  <CommandItem
                    key={c.id}
                    value={searchValue}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{c.name}</span>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {c.document && <span>{c.document}</span>}
                        {c.nickname && <span>· {c.nickname}</span>}
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
