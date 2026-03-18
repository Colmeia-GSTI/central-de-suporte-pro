import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import type { AttendanceData } from "@/lib/attendance-time";
import {
  calcWorkedTimeMs,
  calcElapsedTimeMs,
  calcPausedTimeMs,
  calcWaitTimeMs,
} from "@/lib/attendance-time";
import type { Enums } from "@/integrations/supabase/types";

type TicketStatus = Enums<"ticket_status">;

interface UseTicketAttendanceOptions {
  ticketId: string;
  status: TicketStatus;
  createdAt: string;
  startedAt: string | null;
  resolvedAt: string | null;
}

export function useTicketAttendance({
  ticketId,
  status,
  createdAt,
  startedAt,
  resolvedAt,
}: UseTicketAttendanceOptions) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());

  // Only tick when actively working — not when paused or closed
  const isRunning = status === "in_progress";
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Fetch sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["ticket-attendance-sessions", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_attendance_sessions")
        .select("started_at, ended_at")
        .eq("ticket_id", ticketId)
        .order("started_at");
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });

  // Fetch pauses
  const { data: pauses = [] } = useQuery({
    queryKey: ["ticket-attendance-pauses", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_pauses")
        .select("paused_at, resumed_at")
        .eq("ticket_id", ticketId)
        .order("paused_at");
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });

  const attendanceData: AttendanceData = useMemo(
    () => ({
      created_at: createdAt,
      started_at: startedAt,
      resolved_at: resolvedAt,
      status,
      sessions,
      pauses,
    }),
    [createdAt, startedAt, resolvedAt, status, sessions, pauses]
  );

  const workedMs = calcWorkedTimeMs(attendanceData, now);
  const elapsedMs = calcElapsedTimeMs(attendanceData, now);
  const pausedMs = calcPausedTimeMs(attendanceData, now);
  const waitMs = calcWaitTimeMs(attendanceData, now);
  const pauseCount = pauses.length;
  const sessionCount = sessions.length;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["ticket-attendance-sessions", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["ticket-attendance-pauses", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["ticket-recent-history", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["ticket-stats-bar"] });
  }, [queryClient, ticketId]);

  // Start attendance: open → in_progress
  const startMutation = useMutation({
    mutationFn: async () => {
      const nowIso = new Date().toISOString();

      // Close any orphan open sessions first (prevent duplicates)
      await supabase
        .from("ticket_attendance_sessions")
        .update({ ended_at: nowIso })
        .eq("ticket_id", ticketId)
        .is("ended_at", null);

      // Create new session
      const { error: sessErr } = await supabase
        .from("ticket_attendance_sessions")
        .insert({ ticket_id: ticketId, started_by: user!.id, started_at: nowIso });
      if (sessErr) throw sessErr;

      // Update ticket
      const updates: Record<string, unknown> = {
        status: "in_progress" as TicketStatus,
        assigned_to: user!.id,
      };
      if (!startedAt) {
        updates.started_at = nowIso;
        updates.first_response_at = nowIso;
      }
      const { error: tErr } = await supabase.from("tickets").update(updates).eq("id", ticketId);
      if (tErr) throw tErr;

      // Insert history (trigger was removed to avoid duplicates)
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        user_id: user!.id,
        old_status: "open",
        new_status: "in_progress",
        comment: "Atendimento iniciado",
      });
    },
    onSuccess: () => {
      toast({ title: "Atendimento iniciado" });
      invalidateAll();
    },
    onError: (e) => {
      logger.error("Start attendance failed", "Tickets", { error: String(e) });
      toast({ title: "Erro ao iniciar atendimento", variant: "destructive" });
    },
  });

  // Resume: paused → in_progress
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const nowIso = new Date().toISOString();

      // Close active pause
      await supabase
        .from("ticket_pauses")
        .update({ resumed_at: nowIso })
        .eq("ticket_id", ticketId)
        .is("resumed_at", null);

      // Close any orphan open sessions first
      await supabase
        .from("ticket_attendance_sessions")
        .update({ ended_at: nowIso })
        .eq("ticket_id", ticketId)
        .is("ended_at", null);

      // New session
      const { error: sessErr } = await supabase
        .from("ticket_attendance_sessions")
        .insert({ ticket_id: ticketId, started_by: user!.id, started_at: nowIso });
      if (sessErr) throw sessErr;

      // Update ticket — trigger handles history automatically
      const { error: tErr } = await supabase
        .from("tickets")
        .update({ status: "in_progress" as TicketStatus })
        .eq("id", ticketId);
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      toast({ title: "Atendimento retomado" });
      invalidateAll();
    },
    onError: (e) => {
      logger.error("Resume attendance failed", "Tickets", { error: String(e) });
      toast({ title: "Erro ao retomar atendimento", variant: "destructive" });
    },
  });

  return {
    workedMs,
    elapsedMs,
    pausedMs,
    waitMs,
    pauseCount,
    sessionCount,
    attendanceData,
    now,
    startAttendance: () => startMutation.mutate(),
    resumeAttendance: () => resumeMutation.mutate(),
    isStarting: startMutation.isPending,
    isResuming: resumeMutation.isPending,
    invalidateAll,
  };
}
