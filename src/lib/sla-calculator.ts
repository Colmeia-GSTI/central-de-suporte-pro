import { differenceInMinutes, addMinutes, isAfter, isBefore, setHours, setMinutes, getDay, startOfDay } from "date-fns";

interface Shift {
  name: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

interface BusinessHours {
  timezone: string;
  shifts: Shift[];
  days: Record<string, boolean>; // "0"-"6" for Sunday-Saturday
}

interface SLAConfig {
  response_hours: number;
  resolution_hours: number;
}

interface PauseEntry {
  paused_at: string;
  resumed_at: string | null;
}

/**
 * Calcula os minutos de trabalho em um único dia, considerando os turnos
 */
function getWorkMinutesForDay(
  date: Date,
  shifts: Shift[],
  startTime?: Date,
  endTime?: Date
): number {
  let totalMinutes = 0;

  for (const shift of shifts) {
    const parts = shift.start.split(":");
    const endParts = shift.end.split(":");
    const startH = parseInt(parts[0], 10);
    const startM = parseInt(parts[1], 10);
    const endH = parseInt(endParts[0], 10);
    const endM = parseInt(endParts[1], 10);

    // Validate parsed time values
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
      continue; // Skip invalid shift definitions
    }

    let shiftStart = setMinutes(setHours(startOfDay(date), startH), startM);
    let shiftEnd = setMinutes(setHours(startOfDay(date), endH), endM);

    // Ajustar início se necessário
    if (startTime && isAfter(startTime, shiftStart)) {
      if (isAfter(startTime, shiftEnd)) continue; // Já passou do turno
      shiftStart = startTime;
    }

    // Ajustar fim se necessário
    if (endTime && isBefore(endTime, shiftEnd)) {
      if (isBefore(endTime, shiftStart)) continue; // Ainda não chegou no turno
      shiftEnd = endTime;
    }

    if (isBefore(shiftStart, shiftEnd)) {
      totalMinutes += differenceInMinutes(shiftEnd, shiftStart);
    }
  }

  return totalMinutes;
}

/**
 * Calcula o tempo útil transcorrido entre duas datas considerando horário comercial
 */
export function calculateElapsedBusinessMinutes(
  startDate: Date,
  endDate: Date,
  businessHours: BusinessHours
): number {
  if (!businessHours?.shifts?.length || !businessHours?.days) {
    // Fallback: tempo total em minutos (24/7)
    return differenceInMinutes(endDate, startDate);
  }

  let totalMinutes = 0;
  let currentDate = new Date(startDate);

  while (isBefore(currentDate, endDate)) {
    const dayOfWeek = getDay(currentDate).toString();

    if (businessHours.days[dayOfWeek]) {
      const dayEnd = addMinutes(startOfDay(currentDate), 24 * 60);
      const effectiveEnd = isBefore(dayEnd, endDate) ? dayEnd : endDate;

      totalMinutes += getWorkMinutesForDay(
        currentDate,
        businessHours.shifts,
        isBefore(currentDate, startDate) ? startDate : undefined,
        effectiveEnd
      );
    }

    // Avançar para o próximo dia
    currentDate = addMinutes(startOfDay(currentDate), 24 * 60);
  }

  return totalMinutes;
}

/**
 * Calcula o tempo útil restante para cumprir o SLA
 */
export function calculateRemainingBusinessMinutes(
  ticketCreatedAt: Date,
  slaHours: number,
  businessHours: BusinessHours,
  pauses?: PauseEntry[]
): number {
  const now = new Date();
  const slaMinutes = slaHours * 60;

  // Calcular tempo útil transcorrido
  let elapsedMinutes = calculateElapsedBusinessMinutes(
    ticketCreatedAt,
    now,
    businessHours
  );

  // Descontar tempo de pausas
  if (pauses?.length) {
    let totalPauseMinutes = 0;
    for (const pause of pauses) {
      const pauseStart = new Date(pause.paused_at);
      const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : now;

      // Validate that pause start is before pause end
      if (pauseStart >= pauseEnd) continue;

      const pauseMinutes = calculateElapsedBusinessMinutes(
        pauseStart,
        pauseEnd,
        businessHours
      );

      totalPauseMinutes += pauseMinutes;
    }
    // Ensure pause time never exceeds elapsed time
    elapsedMinutes = Math.max(0, elapsedMinutes - totalPauseMinutes);
  }

  return Math.max(0, slaMinutes - elapsedMinutes);
}

/**
 * Formata minutos em string legível
 */
export function formatMinutesToDisplay(minutes: number): string {
  if (minutes <= 0) return "Expirado";
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

/**
 * Retorna a classe de cor baseada na porcentagem restante
 */
export function getSLAColorClass(remainingMinutes: number, totalMinutes: number): string {
  if (remainingMinutes <= 0) return "text-destructive";
  
  const percentRemaining = (remainingMinutes / totalMinutes) * 100;
  
  if (percentRemaining <= 25) return "text-destructive";
  if (percentRemaining <= 50) return "text-orange-500";
  if (percentRemaining <= 75) return "text-yellow-500";
  return "text-green-600";
}

/**
 * Calcula o status completo do SLA para um ticket
 */
export function calculateSLAStatus(
  ticketCreatedAt: string,
  firstResponseAt: string | null,
  resolvedAt: string | null,
  slaConfig: SLAConfig,
  businessHours: BusinessHours,
  pauses?: PauseEntry[]
) {
  const createdDate = new Date(ticketCreatedAt);
  
  // SLA de Resposta
  const responseTarget = slaConfig.response_hours * 60;
  let responseElapsed = 0;
  let responseRemaining = responseTarget;
  let responseBreached = false;

  if (firstResponseAt) {
    responseElapsed = calculateElapsedBusinessMinutes(
      createdDate,
      new Date(firstResponseAt),
      businessHours
    );
    responseBreached = responseElapsed > responseTarget;
  } else {
    responseElapsed = calculateElapsedBusinessMinutes(
      createdDate,
      new Date(),
      businessHours
    );
    responseRemaining = Math.max(0, responseTarget - responseElapsed);
    responseBreached = responseRemaining <= 0;
  }

  // SLA de Resolução
  const resolutionTarget = slaConfig.resolution_hours * 60;
  let resolutionElapsed = 0;
  let resolutionRemaining = resolutionTarget;
  let resolutionBreached = false;

  if (resolvedAt) {
    resolutionElapsed = calculateElapsedBusinessMinutes(
      createdDate,
      new Date(resolvedAt),
      businessHours
    );
    // Descontar pausas
    if (pauses?.length) {
      let totalPauseMinutes = 0;
      for (const pause of pauses) {
        const pauseStart = new Date(pause.paused_at);
        const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : new Date(resolvedAt);
        if (pauseStart >= pauseEnd) continue;
        totalPauseMinutes += calculateElapsedBusinessMinutes(pauseStart, pauseEnd, businessHours);
      }
      resolutionElapsed = Math.max(0, resolutionElapsed - totalPauseMinutes);
    }
    resolutionBreached = resolutionElapsed > resolutionTarget;
  } else {
    resolutionRemaining = calculateRemainingBusinessMinutes(
      createdDate,
      slaConfig.resolution_hours,
      businessHours,
      pauses
    );
    resolutionBreached = resolutionRemaining <= 0;
  }

  return {
    response: {
      targetMinutes: responseTarget,
      elapsedMinutes: responseElapsed,
      remainingMinutes: firstResponseAt ? 0 : responseRemaining,
      breached: responseBreached,
      completed: !!firstResponseAt,
    },
    resolution: {
      targetMinutes: resolutionTarget,
      elapsedMinutes: resolutionElapsed,
      remainingMinutes: resolvedAt ? 0 : resolutionRemaining,
      breached: resolutionBreached,
      completed: !!resolvedAt,
    },
  };
}
