import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Plus, Trash2, Package } from "lucide-react";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

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

interface ContractServicesSectionProps {
  initialServices?: ContractService[];
  onChange: (services: ContractService[], total: number) => void;
}

export function ContractServicesSection({
  initialServices = [],
  onChange,
}: ContractServicesSectionProps) {
  const [services, setServices] = useState<ContractService[]>(initialServices);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

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

  // Calculate total whenever services change
  useEffect(() => {
    const total = services.reduce((acc, s) => acc + s.subtotal, 0);
    onChange(services, total);
  }, [services, onChange]);

  const handleAddService = () => {
    if (!selectedServiceId) return;

    const service = availableServices.find((s) => s.id === selectedServiceId);
    if (!service) return;

    // Check if service already exists
    const existingIndex = services.findIndex((s) => s.service_id === selectedServiceId);
    if (existingIndex >= 0) {
      // Update quantity instead of adding new
      const updated = [...services];
      updated[existingIndex].quantity += quantity;
      updated[existingIndex].subtotal = updated[existingIndex].quantity * updated[existingIndex].unit_value;
      setServices(updated);
    } else {
      const unitValue = service.base_value * service.multiplier;
      const newService: ContractService = {
        service_id: service.id,
        service_name: service.name,
        quantity: quantity,
        unit_value: unitValue,
        subtotal: unitValue * quantity,
      };
      setServices([...services, newService]);
    }

    // Reset form
    setSelectedServiceId("");
    setQuantity(1);
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

  const total = services.reduce((acc, s) => acc + s.subtotal, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Package className="h-5 w-5 text-primary" />
        Serviços do Contrato
      </div>

      {/* Add Service Form */}
      <div className="flex items-end gap-2 p-4 rounded-lg border bg-muted/30">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Serviço</label>
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger>
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
                  <TableCell className="text-right font-mono">
                    {formatCurrencyBRLWithSymbol(service.unit_value)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrencyBRLWithSymbol(service.subtotal)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveService(service.service_id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
    </div>
  );
}
