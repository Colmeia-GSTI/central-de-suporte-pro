-- Migration: ticket_macros (respostas rápidas / macros de atendimento)
-- Fase 1 Quick Win: FALHA-12

CREATE TABLE IF NOT EXISTS ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shortcut text,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_internal boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para busca por nome e shortcut
CREATE INDEX IF NOT EXISTS idx_ticket_macros_name ON ticket_macros USING gin(to_tsvector('portuguese', name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_macros_shortcut ON ticket_macros (shortcut) WHERE shortcut IS NOT NULL;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_ticket_macros_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_macros_updated_at ON ticket_macros;
CREATE TRIGGER trg_ticket_macros_updated_at
  BEFORE UPDATE ON ticket_macros
  FOR EACH ROW EXECUTE FUNCTION update_ticket_macros_updated_at();

-- RLS: apenas staff pode ver e gerenciar macros
ALTER TABLE ticket_macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view macros"
  ON ticket_macros FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'technician')
    )
  );

CREATE POLICY "Admins and managers can manage macros"
  ON ticket_macros FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Macros de exemplo para facilitar onboarding
INSERT INTO ticket_macros (name, shortcut, content, is_internal) VALUES
(
  'Saudação Inicial',
  '/ola',
  'Olá! Obrigado por entrar em contato com nosso suporte. Estou analisando sua solicitação e retorno em breve com mais informações.',
  false
),
(
  'Aguardando Informações do Cliente',
  '/aguardando',
  'Precisamos de algumas informações adicionais para continuar com o atendimento. Poderia nos fornecer os seguintes dados?'||E'\n\n'||'1. [Informação necessária 1]'||E'\n'||'2. [Informação necessária 2]'||E'\n\n'||'Aguardamos seu retorno.',
  false
),
(
  'Chamado Resolvido',
  '/resolvido',
  'Informamos que o chamado foi resolvido. Caso o problema persista ou tenha dúvidas adicionais, não hesite em nos contatar novamente.'||E'\n\n'||'Agradecemos a confiança em nosso suporte!',
  false
),
(
  'Nota Interna - Investigando',
  '/investigando',
  'Verificando logs do sistema e coletando informações para diagnóstico. Retorno em breve.',
  true
),
(
  'Escalonando para Nível 2',
  '/escalar',
  'Escalonando para equipe de nível 2 devido à complexidade técnica. Notificado o responsável.',
  true
)
ON CONFLICT DO NOTHING;
