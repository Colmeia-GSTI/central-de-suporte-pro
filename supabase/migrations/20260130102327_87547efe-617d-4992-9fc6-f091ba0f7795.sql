-- Adicionar campo para descrição de ativo personalizado
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS asset_description TEXT;

-- Comentário explicativo
COMMENT ON COLUMN public.tickets.asset_description IS 
  'Descrição do dispositivo quando opção "Outro" é selecionada ao iniciar atendimento';