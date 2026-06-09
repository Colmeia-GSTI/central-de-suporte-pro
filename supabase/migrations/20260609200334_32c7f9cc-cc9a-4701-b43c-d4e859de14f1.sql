-- Permite técnicos editarem dados de clientes (exceto CNPJ/IE/normalized_document)
CREATE POLICY "Technicians can update clients (except fiscal fields)"
ON public.clients
FOR UPDATE
TO authenticated
USING (public.is_technician_only(auth.uid()))
WITH CHECK (
  public.is_technician_only(auth.uid())
  AND document IS NOT DISTINCT FROM (SELECT c.document FROM public.clients c WHERE c.id = clients.id)
  AND state_registration IS NOT DISTINCT FROM (SELECT c.state_registration FROM public.clients c WHERE c.id = clients.id)
);