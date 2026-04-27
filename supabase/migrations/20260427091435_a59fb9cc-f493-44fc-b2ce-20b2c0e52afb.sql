-- 1. Tabela
CREATE TABLE public.client_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  address text,
  city text,
  state text,
  cep text,
  phone text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX idx_client_branches_client_id
  ON public.client_branches(client_id);

CREATE UNIQUE INDEX uniq_client_branches_main_per_client
  ON public.client_branches(client_id) WHERE is_main = true;

CREATE UNIQUE INDEX uniq_client_branches_name_per_client
  ON public.client_branches(client_id, lower(name));

-- 3. Triggers
CREATE TRIGGER client_branches_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.client_branches
  FOR EACH ROW EXECUTE FUNCTION public.audit_changes();

CREATE TRIGGER client_branches_set_updated_at
  BEFORE UPDATE ON public.client_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.client_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage branches"
  ON public.client_branches
  FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Client master select branches"
  ON public.client_branches
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'client_master'::app_role)
    AND public.client_owns_record(auth.uid(), client_id)
  );

CREATE POLICY "Client master insert branches"
  ON public.client_branches
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'client_master'::app_role)
    AND public.client_owns_record(auth.uid(), client_id)
  );

CREATE POLICY "Client master update branches"
  ON public.client_branches
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'client_master'::app_role)
    AND public.client_owns_record(auth.uid(), client_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'client_master'::app_role)
    AND public.client_owns_record(auth.uid(), client_id)
  );

CREATE POLICY "Client view own branches"
  ON public.client_branches
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'client'::app_role)
    AND public.client_owns_record(auth.uid(), client_id)
  );

CREATE POLICY "Only admin deletes branches"
  ON public.client_branches
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Backfill idempotente: 1 "Sede" por cliente existente
INSERT INTO public.client_branches
  (client_id, name, is_main, address, city, state, cep)
SELECT c.id, 'Sede', true, c.address, c.city, c.state, c.zip_code
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_branches b
  WHERE b.client_id = c.id AND b.is_main = true
);