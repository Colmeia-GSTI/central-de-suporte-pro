-- Criar tabela de overrides de permissões
CREATE TABLE public.role_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (role, module, action)
);

-- RLS
ALTER TABLE public.role_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permission overrides"
ON public.role_permission_overrides FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view permission overrides"
ON public.role_permission_overrides FOR SELECT
USING (is_staff(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_role_permission_overrides_updated_at
BEFORE UPDATE ON public.role_permission_overrides
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Atualizar política RLS de assets para incluir clientes
DROP POLICY IF EXISTS "Staff can view assets" ON public.assets;

CREATE POLICY "Users can view assets" ON public.assets
FOR SELECT TO authenticated
USING (
  is_staff(auth.uid())
  OR (
    (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role))
    AND EXISTS (
      SELECT 1 FROM client_contacts
      WHERE client_contacts.user_id = auth.uid()
        AND client_contacts.client_id = assets.client_id
    )
  )
);

-- Atualizar política RLS de software_licenses para incluir clientes
DROP POLICY IF EXISTS "Staff can view software_licenses" ON public.software_licenses;

CREATE POLICY "Users can view software_licenses" ON public.software_licenses
FOR SELECT TO authenticated
USING (
  is_staff(auth.uid())
  OR (
    (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role))
    AND EXISTS (
      SELECT 1 FROM client_contacts
      WHERE client_contacts.user_id = auth.uid()
        AND client_contacts.client_id = software_licenses.client_id
    )
  )
);