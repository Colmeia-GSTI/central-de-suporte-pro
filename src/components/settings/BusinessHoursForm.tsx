import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

interface Shift {
  name: string;
  start: string;
  end: string;
}

interface BusinessHours {
  timezone: string;
  shifts: Shift[];
  days: Record<string, boolean>;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "America/Sao_Paulo",
  shifts: [
    { name: "Manhã", start: "08:30", end: "11:45" },
    { name: "Tarde", start: "13:30", end: "18:00" },
  ],
  days: {
    "0": false,
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": false,
  },
};

const DAY_LABELS: Record<string, string> = {
  "0": "Domingo",
  "1": "Segunda",
  "2": "Terça",
  "3": "Quarta",
  "4": "Quinta",
  "5": "Sexta",
  "6": "Sábado",
};

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
];

export function BusinessHoursForm() {
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companySettings, isLoading } = useQuery({
    queryKey: ["company-settings-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, business_hours")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (companySettings) {
      setCompanyId(companySettings.id);
      if (companySettings.business_hours) {
        const hours = companySettings.business_hours as unknown as BusinessHours;
        setBusinessHours({
          timezone: hours.timezone || DEFAULT_BUSINESS_HOURS.timezone,
          shifts: hours.shifts || DEFAULT_BUSINESS_HOURS.shifts,
          days: hours.days || DEFAULT_BUSINESS_HOURS.days,
        });
      }
    }
  }, [companySettings]);

  const saveMutation = useMutation({
    mutationFn: async (hours: BusinessHours) => {
      const hoursJson = hours as unknown as Json;
      if (companyId) {
        const { error } = await supabase
          .from("company_settings")
          .update({ business_hours: hoursJson })
          .eq("id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ 
            razao_social: "Empresa",
            cnpj: "",
            business_hours: hoursJson 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings-hours"] });
      toast({ title: "Horário comercial salvo com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar horário comercial", variant: "destructive" });
    },
  });

  const handleAddShift = () => {
    setBusinessHours((prev) => ({
      ...prev,
      shifts: [...prev.shifts, { name: `Turno ${prev.shifts.length + 1}`, start: "08:00", end: "12:00" }],
    }));
  };

  const handleRemoveShift = (index: number) => {
    if (businessHours.shifts.length <= 1) {
      toast({ title: "Pelo menos um turno é obrigatório", variant: "destructive" });
      return;
    }
    setBusinessHours((prev) => ({
      ...prev,
      shifts: prev.shifts.filter((_, i) => i !== index),
    }));
  };

  const handleShiftChange = (index: number, field: keyof Shift, value: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      shifts: prev.shifts.map((shift, i) =>
        i === index ? { ...shift, [field]: value } : shift
      ),
    }));
  };

  const handleDayChange = (day: string, checked: boolean) => {
    setBusinessHours((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: checked },
    }));
  };

  const handleSave = () => {
    // Validate shifts
    for (const shift of businessHours.shifts) {
      if (shift.start >= shift.end) {
        toast({
          title: `Horário inválido no turno "${shift.name}"`,
          description: "O horário de início deve ser anterior ao horário de término",
          variant: "destructive",
        });
        return;
      }
    }
    saveMutation.mutate(businessHours);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Horário Comercial
        </CardTitle>
        <CardDescription>
          Defina os turnos de atendimento da empresa para cálculo de SLA
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timezone */}
        <div className="space-y-2">
          <Label>Fuso Horário</Label>
          <Select
            value={businessHours.timezone}
            onValueChange={(value) => setBusinessHours((prev) => ({ ...prev, timezone: value }))}
          >
            <SelectTrigger className="w-full md:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Shifts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Turnos de Atendimento</Label>
            <Button variant="outline" size="sm" onClick={handleAddShift}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Turno
            </Button>
          </div>

          <div className="space-y-3">
            {businessHours.shifts.map((shift, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
              >
                <Input
                  className="w-32"
                  value={shift.name}
                  onChange={(e) => handleShiftChange(index, "name", e.target.value)}
                  placeholder="Nome do turno"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-32"
                    value={shift.start}
                    onChange={(e) => handleShiftChange(index, "start", e.target.value)}
                  />
                  <span className="text-muted-foreground">às</span>
                  <Input
                    type="time"
                    className="w-32"
                    value={shift.end}
                    onChange={(e) => handleShiftChange(index, "end", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveShift(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Days */}
        <div className="space-y-3">
          <Label>Dias de Atendimento</Label>
          <div className="flex flex-wrap gap-4">
            {Object.entries(DAY_LABELS).map(([day, label]) => (
              <div key={day} className="flex items-center gap-2">
                <Checkbox
                  id={`day-${day}`}
                  checked={businessHours.days[day] || false}
                  onCheckedChange={(checked) => handleDayChange(day, checked as boolean)}
                />
                <Label htmlFor={`day-${day}`} className="cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Resumo do Horário:</p>
          <div className="text-sm text-muted-foreground space-y-1">
            {businessHours.shifts.map((shift, i) => (
              <p key={i}>
                {shift.name}: {shift.start} - {shift.end}
              </p>
            ))}
            <p className="mt-2">
              Dias ativos:{" "}
              {Object.entries(businessHours.days)
                .filter(([_, active]) => active)
                .map(([day]) => DAY_LABELS[day])
                .join(", ") || "Nenhum"}
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Horário Comercial"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
