-- Add new status values to ticket_status enum
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'waiting_third_party';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'no_contact';

-- Create ticket pauses table for tracking pause history
CREATE TABLE IF NOT EXISTS public.ticket_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  paused_by UUID NOT NULL REFERENCES auth.users(id),
  pause_reason TEXT NOT NULL,
  pause_type TEXT NOT NULL CHECK (pause_type IN ('manual', 'no_contact', 'third_party')),
  third_party_name TEXT,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_at TIMESTAMPTZ,
  auto_resume_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_pauses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view ticket pauses" ON public.ticket_pauses
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create ticket pauses" ON public.ticket_pauses
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update ticket pauses" ON public.ticket_pauses
  FOR UPDATE USING (is_staff(auth.uid()));

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_pauses_ticket_id ON public.ticket_pauses(ticket_id);