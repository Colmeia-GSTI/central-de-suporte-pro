CREATE POLICY "Financial can manage contract services"
ON public.contract_services FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'financial'))
WITH CHECK (public.has_role(auth.uid(), 'financial'));