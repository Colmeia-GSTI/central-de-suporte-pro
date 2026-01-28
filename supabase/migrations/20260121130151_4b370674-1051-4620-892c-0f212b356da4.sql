-- Create ticket time entries table
CREATE TABLE IF NOT EXISTS public.ticket_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_billable BOOLEAN DEFAULT true,
  entry_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'stopwatch'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_time_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view time entries" ON public.ticket_time_entries
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create time entries" ON public.ticket_time_entries
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Users can update own time entries" ON public.ticket_time_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own time entries" ON public.ticket_time_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ticket_time_entries_ticket_id ON public.ticket_time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_time_entries_user_id ON public.ticket_time_entries(user_id);