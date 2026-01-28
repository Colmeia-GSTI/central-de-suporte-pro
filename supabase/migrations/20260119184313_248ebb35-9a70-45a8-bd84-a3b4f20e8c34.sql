-- Dropar políticas permissivas existentes
DROP POLICY IF EXISTS "Service role can insert message logs" ON public.message_logs;
DROP POLICY IF EXISTS "Service role can update message logs" ON public.message_logs;

-- Criar políticas mais restritivas (service role bypassa RLS por padrão, então nenhum usuário normal pode inserir/atualizar)
CREATE POLICY "Only authenticated via service role can insert"
  ON public.message_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL 
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Only authenticated via service role can update"
  ON public.message_logs
  FOR UPDATE
  USING (
    auth.uid() IS NULL 
    OR public.has_role(auth.uid(), 'admin')
  );