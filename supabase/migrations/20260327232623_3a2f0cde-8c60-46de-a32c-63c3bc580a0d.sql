CREATE POLICY "Financial can manage contracts"
ON public.contracts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'financial'))
WITH CHECK (public.has_role(auth.uid(), 'financial'));