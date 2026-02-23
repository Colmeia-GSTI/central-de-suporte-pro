-- Drop the restrictive policy for client users
DROP POLICY "Client users can view own contact" ON public.client_contacts;

-- Recreate as PERMISSIVE so clients can view their own contact
-- without needing to also satisfy the staff-only restrictive policies
CREATE POLICY "Client users can view own contact"
  ON public.client_contacts
  FOR SELECT
  USING (user_id = auth.uid());