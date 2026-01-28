import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, AlertTriangle, CheckCircle, Timer } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { calculateSLAStatus, formatMinutesToDisplay, getSLAColorClass } from "@/lib/sla-calculator";
import type { Enums } from "@/integrations/supabase/types";

interface SLAIndicatorProps {
  ticket: {
    id: string;
    created_at: string;
    first_response_at: string | null;
    resolved_at: string | null;
    priority: Enums<"ticket_priority">;
    client_id: string | null;
    category_id: string | null;
  };
  compact?: boolean;
}

interface BusinessHours {
  timezone: string;
  shifts: { name: string; start: string; end: string }[];
  days: Record<string, boolean>;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "America/Sao_Paulo",
  shifts: [
    { name: "Manhã", start: "08:30", end: "11:45" },
    { name: "Tarde", start: "13:30", end: "18:00" },
  ],
  days: { "0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false },
};

export function SLAIndicator({ ticket, compact = false }: SLAIndicatorProps) {
  // Estado para forçar atualização a cada minuto
  const [, setTick] = useState(0);

  // Atualizar a cada minuto para manter o tempo restante atualizado
  useEffect(() => {
    const isCompleted = ticket.resolved_at !== null;
    if (isCompleted) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000); // Atualiza a cada 1 minuto

    return () => clearInterval(interval);
  }, [ticket.resolved_at]);

  // Buscar configuração de SLA aplicável
  const { data: slaConfig } = useQuery({
    queryKey: ["sla-config", ticket.priority, ticket.client_id, ticket.category_id],
    queryFn: async () => {
      // Tentar encontrar SLA específico (cliente + categoria > cliente > categoria > prioridade)
      const { data, error } = await supabase
        .from("sla_configs")
        .select("id, priority, response_hours, resolution_hours, client_id, category_id")
        .or(
          `and(priority.eq.${ticket.priority},client_id.is.null,category_id.is.null),` +
          `and(priority.eq.${ticket.priority},client_id.eq.${ticket.client_id},category_id.is.null),` +
          `and(priority.eq.${ticket.priority},category_id.eq.${ticket.category_id},client_id.is.null),` +
          `and(priority.eq.${ticket.priority},client_id.eq.${ticket.client_id},category_id.eq.${ticket.category_id})`
        )
        .order("client_id", { nullsFirst: false })
        .order("category_id", { nullsFirst: false })
        .limit(1);

      if (error || !data?.length) {
        // Fallback: buscar apenas por prioridade
        const { data: fallback } = await supabase
          .from("sla_configs")
          .select("id, priority, response_hours, resolution_hours, client_id, category_id")
          .eq("priority", ticket.priority)
          .is("client_id", null)
          .is("category_id", null)
          .limit(1);

        return fallback?.[0] || null;
      }
      return data[0];
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Buscar horário comercial
  const { data: businessHoursData } = useQuery({
    queryKey: ["company-business-hours"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("business_hours")
        .limit(1)
        .maybeSingle();
      return (data?.business_hours as unknown as BusinessHours) || DEFAULT_BUSINESS_HOURS;
    },
    staleTime: 10 * 60 * 1000, // Cache por 10 minutos
  });

  // Buscar pausas do ticket
  const { data: pauses = [] } = useQuery({
    queryKey: ["ticket-pauses", ticket.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_pauses")
        .select("paused_at, resumed_at")
        .eq("ticket_id", ticket.id);
      return data || [];
    },
  });

  // Se não há SLA configurado
  if (!slaConfig) {
    if (compact) return null;
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Clock className="h-3 w-3 mr-1" />
        SLA não configurado
      </Badge>
    );
  }

  const businessHours = businessHoursData || DEFAULT_BUSINESS_HOURS;

  const slaStatus = calculateSLAStatus(
    ticket.created_at,
    ticket.first_response_at,
    ticket.resolved_at,
    slaConfig,
    businessHours,
    pauses.map(p => ({ paused_at: p.paused_at, resumed_at: p.resumed_at }))
  );

  // Verificar se está dentro do horário comercial
  const now = new Date();
  const dayOfWeek = now.getDay().toString();
  const isBusinessDay = businessHours.days[dayOfWeek];
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const isInShift = isBusinessDay && businessHours.shifts.some(
    (shift) => currentTime >= shift.start && currentTime <= shift.end
  );

  if (compact) {
    // Mostrar apenas o indicador mais crítico
    const showResolution = !slaStatus.resolution.completed;
    const showResponse = !slaStatus.response.completed && !ticket.first_response_at;
    
    if (!showResolution && !showResponse) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          SLA OK
        </Badge>
      );
    }

    const critical = slaStatus.resolution.breached || slaStatus.response.breached;
    const remaining = showResponse 
      ? slaStatus.response.remainingMinutes 
      : slaStatus.resolution.remainingMinutes;
    const target = showResponse 
      ? slaStatus.response.targetMinutes 
      : slaStatus.resolution.targetMinutes;

    const colorClass = getSLAColorClass(remaining, target);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={`${colorClass} border-current cursor-help`}
            >
              {critical ? (
                <AlertTriangle className="h-3 w-3 mr-1" />
              ) : (
                <Clock className="h-3 w-3 mr-1" />
              )}
              {formatMinutesToDisplay(remaining)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-1 text-muted-foreground mb-2">
                <Timer className="h-3 w-3" />
                <span className="text-xs">
                  {isInShift ? "Em horário comercial" : "Fora do horário comercial"}
                </span>
              </div>
              <p>
                <strong>Resposta:</strong>{" "}
                {slaStatus.response.completed
                  ? "✓ Respondido"
                  : formatMinutesToDisplay(slaStatus.response.remainingMinutes) + " úteis restantes"}
              </p>
              <p>
                <strong>Resolução:</strong>{" "}
                {slaStatus.resolution.completed
                  ? "✓ Resolvido"
                  : formatMinutesToDisplay(slaStatus.resolution.remainingMinutes) + " úteis restantes"}
              </p>
              {pauses.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {pauses.filter(p => !p.resumed_at).length > 0 ? "⏸ SLA pausado" : `${pauses.length} pausa(s) registrada(s)`}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Versão completa
  return (
    <TooltipProvider>
      <div className="flex gap-2 flex-wrap items-center">
        {/* Indicador de horário comercial */}
        {!isInShift && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-muted-foreground border-dashed">
                <Timer className="h-3 w-3 mr-1" />
                Fora do expediente
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">SLA conta apenas em horário comercial</p>
              <p className="text-xs text-muted-foreground">
                {businessHours.shifts.map(s => `${s.start}-${s.end}`).join(" / ")}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* SLA de Resposta */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`cursor-help ${
                slaStatus.response.completed
                  ? "text-green-600 border-green-600"
                  : getSLAColorClass(slaStatus.response.remainingMinutes, slaStatus.response.targetMinutes) + " border-current"
              }`}
            >
              {slaStatus.response.completed ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : slaStatus.response.breached ? (
                <AlertTriangle className="h-3 w-3 mr-1" />
              ) : (
                <Clock className="h-3 w-3 mr-1" />
              )}
              Resposta:{" "}
              {slaStatus.response.completed
                ? "OK"
                : formatMinutesToDisplay(slaStatus.response.remainingMinutes)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              Meta: {Math.round(slaStatus.response.targetMinutes / 60)}h úteis
            </p>
            {!slaStatus.response.completed && (
              <p className="text-xs text-muted-foreground">
                Tempo útil restante para primeira resposta
              </p>
            )}
          </TooltipContent>
        </Tooltip>

        {/* SLA de Resolução */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`cursor-help ${
                slaStatus.resolution.completed
                  ? "text-green-600 border-green-600"
                  : getSLAColorClass(slaStatus.resolution.remainingMinutes, slaStatus.resolution.targetMinutes) + " border-current"
              }`}
            >
              {slaStatus.resolution.completed ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : slaStatus.resolution.breached ? (
                <AlertTriangle className="h-3 w-3 mr-1" />
              ) : (
                <Clock className="h-3 w-3 mr-1" />
              )}
              Resolução:{" "}
              {slaStatus.resolution.completed
                ? "OK"
                : formatMinutesToDisplay(slaStatus.resolution.remainingMinutes)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              Meta: {Math.round(slaStatus.resolution.targetMinutes / 60)}h úteis
            </p>
            {pauses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {pauses.filter(p => !p.resumed_at).length > 0 
                  ? "⏸ SLA atualmente pausado" 
                  : `Descontadas ${pauses.length} pausa(s)`}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
