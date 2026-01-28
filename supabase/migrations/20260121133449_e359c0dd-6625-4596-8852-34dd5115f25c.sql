-- Corrigir a vulnerabilidade crítica de TV Dashboard
-- A política "Anyone can view TV config by token" precisa ser removida/substituída

DROP POLICY IF EXISTS "Anyone can view TV config by token" ON public.tv_dashboard_config;

-- Criar política que permite acesso público APENAS com token válido via RPC ou requer staff
-- Como o TV Dashboard precisa de acesso público, criamos uma verificação de token
CREATE OR REPLACE FUNCTION public.verify_tv_dashboard_token(token_param text)
RETURNS SETOF tv_dashboard_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM tv_dashboard_config
  WHERE access_token = token_param;
END;
$$;

-- Garantir que apenas staff autenticado pode ver via SELECT normal
-- A TV deve usar a função verify_tv_dashboard_token