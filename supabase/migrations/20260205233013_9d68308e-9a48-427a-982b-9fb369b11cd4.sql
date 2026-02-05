
-- RLS Policy: Clientes podem ver suas próprias faturas (via client_contacts)
CREATE POLICY "Clients can view own invoices"
  ON public.invoices
  FOR SELECT
  USING (
    (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role))
    AND client_owns_record(auth.uid(), client_id)
  );

-- RLS Policy: Clientes podem ver NFS-e da sua empresa (via client_contacts)
CREATE POLICY "Clients can view own nfse history"
  ON public.nfse_history
  FOR SELECT
  USING (
    (has_role(auth.uid(), 'client'::app_role) OR has_role(auth.uid(), 'client_master'::app_role))
    AND client_owns_record(auth.uid(), client_id)
  );
