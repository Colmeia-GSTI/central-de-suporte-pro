-- Criar tabela de histórico de contratos
CREATE TABLE public.contract_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  changes JSONB,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar tabela de histórico de clientes
CREATE TABLE public.client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  changes JSONB,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar campo whatsapp e preferência de notificação em client_contacts
ALTER TABLE public.client_contacts 
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT true;

-- Índices para performance
CREATE INDEX idx_contract_history_contract_id ON public.contract_history(contract_id);
CREATE INDEX idx_contract_history_created_at ON public.contract_history(created_at DESC);
CREATE INDEX idx_client_history_client_id ON public.client_history(client_id);
CREATE INDEX idx_client_history_created_at ON public.client_history(created_at DESC);

-- RLS para contract_history
ALTER TABLE public.contract_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view contract history" ON public.contract_history
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert contract history" ON public.contract_history
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

-- RLS para client_history
ALTER TABLE public.client_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view client history" ON public.client_history
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert client history" ON public.client_history
  FOR INSERT WITH CHECK (is_staff(auth.uid()));