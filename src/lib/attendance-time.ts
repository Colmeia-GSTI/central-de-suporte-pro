/**
 * Pure functions for calculating ticket attendance time.
 * All timestamps come from the database — no in-memory state dependency.
 */

export interface AttendanceSession {
  started_at: string;
  ended_at: string | null;
}

export interface AttendancePause {
  paused_at: string;
  resumed_at: string | null;
}

export interface AttendanceData {
  created_at: string;
  started_at: string | null;
  resolved_at: string | null;
  status?: string;
  sessions: AttendanceSession[];
  pauses: AttendancePause[];
}

/** Total worked time in ms — sum of all sessions (excludes paused time).
 *  Caps open sessions at resolved_at to prevent time inflation on closed tickets. */
export function calcWorkedTimeMs(data: AttendanceData, now: Date = new Date()): number {
  const cap = data.resolved_at ? new Date(data.resolved_at).getTime() : now.getTime();

  // Fallback: no sessions but ticket has started_at (legacy data or silent insert failure)
  if (data.sessions.length === 0 && data.started_at) {
    const activeStatuses = ["in_progress", "paused", "waiting_third_party", "no_contact"];
    if (data.status && activeStatuses.includes(data.status)) {
      const start = new Date(data.started_at).getTime();
      const pausedMs = calcPausedTimeMs(data, now);
      return Math.max(0, cap - start - pausedMs);
    }
  }

  let total = 0;
  for (const s of data.sessions) {
    const start = new Date(s.started_at).getTime();
    const end = s.ended_at ? Math.min(new Date(s.ended_at).getTime(), cap) : cap;
    total += Math.max(0, end - start);
  }
  return total;
}

/** Total elapsed time since creation in ms */
export function calcElapsedTimeMs(data: AttendanceData, now: Date = new Date()): number {
  return Math.max(0, now.getTime() - new Date(data.created_at).getTime());
}

/** Time waiting before first attendance start in ms */
export function calcWaitTimeMs(data: AttendanceData, now: Date = new Date()): number {
  if (!data.started_at) return now.getTime() - new Date(data.created_at).getTime();
  return Math.max(0, new Date(data.started_at).getTime() - new Date(data.created_at).getTime());
}

/** Total paused time in ms.
 *  Caps open pauses at resolved_at to prevent inflation on closed tickets. */
export function calcPausedTimeMs(data: AttendanceData, now: Date = new Date()): number {
  const cap = data.resolved_at ? new Date(data.resolved_at).getTime() : now.getTime();
  let total = 0;
  for (const p of data.pauses) {
    const start = new Date(p.paused_at).getTime();
    const end = p.resumed_at ? Math.min(new Date(p.resumed_at).getTime(), cap) : cap;
    total += Math.max(0, end - start);
  }
  return total;
}

/** Format ms to HH:MM:SS */
export function formatTimeHMS(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/** Format ms to friendly string like "2h 15min" */
export function formatTimeFriendly(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "< 1min";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h`;
  return `${mins}min`;
}
