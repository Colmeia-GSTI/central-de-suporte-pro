
-- Add started_at to tickets for tracking when attendance began
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Create attendance sessions table to track active work periods
CREATE TABLE IF NOT EXISTS public.ticket_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Staff can do everything on sessions
CREATE POLICY "Staff can manage attendance sessions"
  ON public.ticket_attendance_sessions
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Clients can view sessions on their tickets
CREATE POLICY "Clients can view attendance sessions"
  ON public.ticket_attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.client_contacts cc ON cc.client_id = t.client_id
      WHERE t.id = ticket_id AND cc.user_id = auth.uid()
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ticket_attendance_sessions_ticket ON public.ticket_attendance_sessions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attendance_sessions_active ON public.ticket_attendance_sessions(ticket_id) WHERE ended_at IS NULL;

-- Backfill started_at for tickets already in_progress
UPDATE public.tickets 
SET started_at = first_response_at 
WHERE status = 'in_progress' AND started_at IS NULL AND first_response_at IS NOT NULL;
