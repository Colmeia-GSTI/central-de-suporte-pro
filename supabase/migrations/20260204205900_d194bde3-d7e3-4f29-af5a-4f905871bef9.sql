-- =====================================================
-- GRANULAR SECURITY FOR CLIENTS TABLE
-- =====================================================

-- 1. HELPER FUNCTIONS
-- =====================================================

-- Check if user is admin, manager, or financial
CREATE OR REPLACE FUNCTION public.is_financial_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'financial', 'manager')
  )
$$;

-- Check if user is technician ONLY (no higher roles)
CREATE OR REPLACE FUNCTION public.is_technician_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'technician'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'financial', 'manager')
  )
$$;

-- Check if client user owns a specific client record
CREATE OR REPLACE FUNCTION public.client_owns_record(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_contacts
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- 2. SECURE VIEW FOR TECHNICIANS (contact info only)
-- =====================================================
CREATE OR REPLACE VIEW public.clients_contact_only
WITH (security_invoker = on) AS
SELECT 
  id,
  name,
  trade_name,
  email,
  phone,
  whatsapp,
  whatsapp_validated,
  address,
  city,
  state,
  zip_code,
  notes,
  is_active,
  created_at,
  updated_at
FROM public.clients;

-- 3. UPDATE RLS POLICIES ON CLIENTS TABLE
-- =====================================================

-- Remove old permissive policies
DROP POLICY IF EXISTS "Staff can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;

-- SELECT: Admin/Manager/Financial see all fields
CREATE POLICY "Financial staff can view all clients"
ON public.clients FOR SELECT
USING (is_financial_admin(auth.uid()));

-- SELECT: Technicians can view contact info only (via VIEW, but also need base table access for JOINs)
CREATE POLICY "Technicians can view contact info"
ON public.clients FOR SELECT
USING (is_technician_only(auth.uid()));

-- SELECT: Clients can view their own data
CREATE POLICY "Clients can view own data"
ON public.clients FOR SELECT
USING (
  (has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master'))
  AND client_owns_record(auth.uid(), id)
);

-- INSERT: All staff can create clients
CREATE POLICY "Staff can insert clients"
ON public.clients FOR INSERT
WITH CHECK (is_staff(auth.uid()));

-- UPDATE: Admin/Manager/Financial can update all fields
CREATE POLICY "Financial staff can update clients"
ON public.clients FOR UPDATE
USING (is_financial_admin(auth.uid()));

-- UPDATE: Clients can update their own basic data
CREATE POLICY "Clients can update own basic data"
ON public.clients FOR UPDATE
USING (
  (has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master'))
  AND client_owns_record(auth.uid(), id)
);

-- DELETE: Only admin can delete
CREATE POLICY "Only admin can delete clients"
ON public.clients FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- 4. TRIGGER TO RESTRICT CLIENT UPDATES
-- =====================================================
-- Prevents clients from modifying sensitive fields even if they have UPDATE permission

CREATE OR REPLACE FUNCTION public.restrict_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict for client/client_master roles
  IF has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master') THEN
    -- Preserve fields that clients cannot modify
    NEW.document := OLD.document;
    NEW.asaas_customer_id := OLD.asaas_customer_id;
    NEW.name := OLD.name;
    NEW.documentation := OLD.documentation;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS tr_restrict_client_update ON public.clients;
CREATE TRIGGER tr_restrict_client_update
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.restrict_client_update();