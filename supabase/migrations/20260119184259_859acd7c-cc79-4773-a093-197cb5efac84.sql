-- 1. Adicionar preferências de notificação no perfil do usuário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_telegram BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- 2. Criar tabela de histórico de mensagens
CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'telegram')),
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  related_type TEXT,
  related_id UUID,
  external_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS: usuário vê próprias mensagens, admin/manager veem tudo
CREATE POLICY "Users can view own message logs"
  ON public.message_logs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Service role can insert message logs"
  ON public.message_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update message logs"
  ON public.message_logs
  FOR UPDATE
  USING (true);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_message_logs_user_id ON public.message_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_channel ON public.message_logs(channel);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON public.message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON public.message_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_external_id ON public.message_logs(external_message_id);

-- 6. Habilitar realtime para message_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;