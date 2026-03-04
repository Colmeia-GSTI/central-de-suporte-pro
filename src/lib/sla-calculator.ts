import { differenceInMinutes, addMinutes, isAfter, isBefore, setHours, setMinutes, getDay, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

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

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Converte uma data UTC para o timezone configurado
 */
function toBusinessTimezone(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone || DEFAULT_TIMEZONE);
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

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
      continue;
    }

    let shiftStart = setMinutes(setHours(startOfDay(date), startH), startM);
    let shiftEnd = setMinutes(setHours(startOfDay(date), endH), endM);

    if (startTime && isAfter(startTime, shiftStart)) {
      if (isAfter(startTime, shiftEnd)) continue;
      shiftStart = startTime;
    }

    if (endTime && isBefore(endTime, shiftEnd)) {
      if (isBefore(endTime, shiftStart)) continue;
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
 * Todas as datas são convertidas para o timezone configurado antes do cálculo
 */
export function calculateElapsedBusinessMinutes(
  startDate: Date,
  endDate: Date,
  businessHours: BusinessHours
): number {
  if (!businessHours?.shifts?.length || !businessHours?.days) {
    return differenceInMinutes(endDate, startDate);
  }

  const tz = businessHours.timezone || DEFAULT_TIMEZONE;

  // Converter para o timezone do negócio
  const zonedStart = toBusinessTimezone(startDate, tz);
  const zonedEnd = toBusinessTimezone(endDate, tz);

  let totalMinutes = 0;
  let currentDate = new Date(zonedStart);

  while (isBefore(currentDate, zonedEnd)) {
    const dayOfWeek = getDay(currentDate).toString();

    if (businessHours.days[dayOfWeek]) {
      const dayEnd = addMinutes(startOfDay(currentDate), 24 * 60);
      const effectiveEnd = isBefore(dayEnd, zonedEnd) ? dayEnd : zonedEnd;

      totalMinutes += getWorkMinutesForDay(
        currentDate,
        businessHours.shifts,
        isBefore(currentDate, zonedStart) ? zonedStart : undefined,
        effectiveEnd
      );
    }

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

  let elapsedMinutes = calculateElapsedBusinessMinutes(
    ticketCreatedAt,
    now,
    businessHours
  );

  if (pauses?.length) {
    let totalPauseMinutes = 0;
    for (const pause of pauses) {
      const pauseStart = new Date(pause.paused_at);
      const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : now;

      if (pauseStart >= pauseEnd) continue;

      const pauseMinutes = calculateElapsedBusinessMinutes(
        pauseStart,
        pauseEnd,
        businessHours
      );

      totalPauseMinutes += pauseMinutes;
    }
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
