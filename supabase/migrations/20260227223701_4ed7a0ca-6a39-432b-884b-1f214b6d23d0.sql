
-- 1. Add missing attachments column to ticket_comments
ALTER TABLE public.ticket_comments 
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- 2. Create ticket_macros table
CREATE TABLE IF NOT EXISTS public.ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shortcut text,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Enable RLS on ticket_macros
ALTER TABLE public.ticket_macros ENABLE ROW LEVEL SECURITY;

-- 4. Staff can read active macros
CREATE POLICY "Staff can read active macros"
  ON public.ticket_macros FOR SELECT
  TO authenticated
  USING (is_active = true AND public.is_staff(auth.uid()));

-- 5. Admins/managers can manage macros
CREATE POLICY "Admins can manage macros"
  ON public.ticket_macros FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 6. Create ticket-attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 7. RLS policies for ticket-attachments bucket
CREATE POLICY "Staff can upload ticket attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can read ticket attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ticket-attachments' AND public.is_staff(auth.uid()));
