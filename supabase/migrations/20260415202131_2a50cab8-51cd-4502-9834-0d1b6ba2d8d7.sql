CREATE TABLE public.doc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  reference_table text NOT NULL,
  reference_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  expiry_date date NOT NULL,
  days_remaining int NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  status text NOT NULL DEFAULT 'active',
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_doc_alerts_client_status ON public.doc_alerts(client_id, status);
CREATE UNIQUE INDEX idx_doc_alerts_ref ON public.doc_alerts(reference_table, reference_id) WHERE status = 'active';

CREATE POLICY "Staff can manage doc_alerts" ON public.doc_alerts
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER update_doc_alerts_updated_at
  BEFORE UPDATE ON public.doc_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();