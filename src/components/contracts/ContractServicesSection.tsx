import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Package, History, PlusCircle } from "lucide-react";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ServiceForm } from "@/components/services/ServiceForm";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Service {
  id: string;
  name: string;
  base_value: number;
  multiplier: number;
}

export interface ContractService {
  service_id: string;
  service_name: string;
  quantity: number;
  unit_value: number;
  subtotal: number;
}

interface ServiceHistoryEntry {
  id: string;
  action: string;
  service_name: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

interface ContractServicesSectionProps {
  contractId?: string;
  initialServices?: ContractService[];
  onChange: (services: ContractService[], total: number) => void;
}

export function ContractServicesSection({
  contractId,
  initialServices = [],
  onChange,
}: ContractServicesSectionProps) {
  const queryClient = useQueryClient();
  const [services, setServices] = useState<ContractService[]>(initialServices);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitValue, setUnitValue] = useState<number>(0);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNewServiceOpen, setIsNewServiceOpen] = useState(false);

  // Keep track of original services for comparison
  const [originalServices, setOriginalServices] = useState<ContractService[]>(initialServices);

  useEffect(() => {
    if (initialServices.length > 0 && originalServices.length === 0) {
      setOriginalServices(initialServices);
    }
  }, [initialServices, originalServices.length]);

  // Sincronizar services quando initialServices carregar assincronamente
  useEffect(() => {
    if (initialServices.length > 0 && services.length === 0) {
      setServices(initialServices);
    }
  }, [initialServices]);

  // Fetch available services
  const { data: availableServices = [] } = useQuery({
    queryKey: ["services-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, base_value, multiplier")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Service[];
    },
  });

  // Fetch service history if contract exists
  const { data: serviceHistory = [] } = useQuery({
    queryKey: ["contract-service-history", contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_service_history")
        .select("id, action, service_name, old_value, new_value, created_at")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ServiceHistoryEntry[];
    },
    enabled: !!contractId,
  });

  // Stable ref for onChange to avoid stale closure
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  
  useEffect(() => {
    const total = services.reduce((acc, s) => acc + s.subtotal, 0);
    onChangeRef.current(services, total);
  }, [services]);

  const handleAddService = () => {
    if (!selectedServiceId) return;

    const service = availableServices.find((s) => s.id === selectedServiceId);
    if (!service) return;

    const finalUnitValue = unitValue > 0 ? unitValue : service.base_value * service.multiplier;

    // Check if service already exists
    const existingIndex = services.findIndex((s) => s.service_id === selectedServiceId);
    if (existingIndex >= 0) {
      const updated = [...services];
      updated[existingIndex].quantity += quantity;
      updated[existingIndex].unit_value = finalUnitValue;
      updated[existingIndex].subtotal = updated[existingIndex].quantity * finalUnitValue;
      setServices(updated);
    } else {
      const newService: ContractService = {
        service_id: service.id,
        service_name: service.name,
        quantity: quantity,
        unit_value: finalUnitValue,
        subtotal: finalUnitValue * quantity,
      };
      setServices([...services, newService]);
    }

    setSelectedServiceId("");
    setQuantity(1);
    setUnitValue(0);
  };

  const handleRemoveService = (serviceId: string) => {
    setServices(services.filter((s) => s.service_id !== serviceId));
  };

  const handleQuantityChange = (serviceId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setServices(
      services.map((s) =>
        s.service_id === serviceId
          ? { ...s, quantity: newQuantity, subtotal: s.unit_value * newQuantity }
          : s
      )
    );
  };

  const handleUnitValueChange = (serviceId: string, newValue: number) => {
    setServices(
      services.map((s) =>
        s.service_id === serviceId
          ? { ...s, unit_value: newValue, subtotal: newValue * s.quantity }
          : s
      )
    );
  };

  const total = services.reduce((acc, s) => acc + s.subtotal, 0);

  const getActionLabel = (action: string) => {
    switch (action) {
      case "added": return "Adicionado";
      case "removed": return "Removido";
      case "updated": return "Atualizado";
      default: return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "added": return "text-green-600 dark:text-green-400";
      case "removed": return "text-red-600 dark:text-red-400";
      case "updated": return "text-blue-600 dark:text-blue-400";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Package className="h-5 w-5 text-primary" />
          Serviços do Contrato
        </div>
        {contractId && serviceHistory.length > 0 && (
          <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen} modal={true}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="h-4 w-4 mr-1" />
                Histórico
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Alterações
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {serviceHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-b pb-3 last:border-0"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`font-medium ${getActionColor(entry.action)}`}>
                            {getActionLabel(entry.action)}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {entry.service_name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {entry.action === "updated" && entry.old_value && entry.new_value && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          <span>Qtd: {(entry.old_value as any).quantity || 0}</span>
                          <span className="mx-1">→</span>
                          <span>{(entry.new_value as any).quantity || 0}</span>
                          {" | "}
                          <span>Valor: {formatCurrencyBRLWithSymbol((entry.old_value as any).value || 0)}</span>
                          <span className="mx-1">→</span>
                          <span>{formatCurrencyBRLWithSymbol((entry.new_value as any).value || 0)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Add Service Form */}
      <div className="flex items-end gap-2 p-4 rounded-lg border bg-muted/30 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-1 block">Serviço</label>
          <div className="flex gap-2">
            <Select value={selectedServiceId || undefined} onValueChange={(val) => {
              setSelectedServiceId(val);
              const svc = availableServices.find((s) => s.id === val);
              if (svc) setUnitValue(svc.base_value * svc.multiplier);
            }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione um serviço" />
              </SelectTrigger>
              <SelectContent>
                {availableServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} - {formatCurrencyBRLWithSymbol(service.base_value * service.multiplier)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsNewServiceOpen(true)}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cadastrar novo serviço</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="w-24">
          <label className="text-sm font-medium mb-1 block">Quantidade</label>
          <Input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          />
        </div>
        <div className="w-36">
          <label className="text-sm font-medium mb-1 block">Valor Unit.</label>
          <CurrencyInput
            value={unitValue}
            onChange={setUnitValue}
            disabled={!selectedServiceId}
          />
        </div>
        <Button
          type="button"
          onClick={handleAddService}
          disabled={!selectedServiceId}
        >
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {/* Services List */}
      {services.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="w-24 text-center">Qtd</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.service_id}>
                  <TableCell className="font-medium">{service.service_name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      value={service.quantity}
                      onChange={(e) =>
                        handleQuantityChange(service.service_id, parseInt(e.target.value) || 1)
                      }
                      className="w-20 text-center"
                    />
                  </TableCell>
                  <TableCell>
                    <CurrencyInput
                      value={service.unit_value}
                      onChange={(val) => handleUnitValueChange(service.service_id, val)}
                      className="w-28 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrencyBRLWithSymbol(service.subtotal)}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveService(service.service_id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remover serviço</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-primary/5">
                <TableCell colSpan={3} className="font-semibold">
                  Total Mensal
                </TableCell>
                <TableCell className="text-right font-mono text-lg font-bold text-primary">
                  {formatCurrencyBRLWithSymbol(total)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
          <Package className="mx-auto h-12 w-12 opacity-50 mb-2" />
          <p>Nenhum serviço adicionado</p>
          <p className="text-sm">Selecione um serviço acima para adicionar ao contrato</p>
        </div>
      )}

      {/* Inline New Service Sheet */}
      <Sheet open={isNewServiceOpen} onOpenChange={setIsNewServiceOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Cadastrar Novo Serviço</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ServiceForm
              onSuccess={() => {
                setIsNewServiceOpen(false);
                queryClient.invalidateQueries({ queryKey: ["services-active"] });
              }}
              onCancel={() => setIsNewServiceOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
