-- Adicionar campos para autenticação na tabela client_contacts
ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Índice único para username (apenas onde não é null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_username 
ON client_contacts(username) WHERE username IS NOT NULL;

-- Índice para busca por user_id
CREATE INDEX IF NOT EXISTS idx_client_contacts_user_id 
ON client_contacts(user_id) WHERE user_id IS NOT NULL;

-- Adicionar campo requester_contact_id na tabela tickets
ALTER TABLE tickets 
  ADD COLUMN IF NOT EXISTS requester_contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL;

-- Índice para busca de tickets por requester
CREATE INDEX IF NOT EXISTS idx_tickets_requester_contact_id 
ON tickets(requester_contact_id) WHERE requester_contact_id IS NOT NULL;

-- Comentários descritivos
COMMENT ON COLUMN client_contacts.username IS 'Username para login (opcional se tiver email real)';
COMMENT ON COLUMN client_contacts.user_id IS 'Vínculo com auth.users para autenticação';
COMMENT ON COLUMN client_contacts.is_active IS 'Se o usuário pode fazer login';
COMMENT ON COLUMN tickets.requester_contact_id IS 'Contato do cliente que abriu o chamado';

-- RLS: Usuários de cliente podem ver apenas seus próprios chamados
CREATE POLICY "Client users can view own tickets"
ON tickets
FOR SELECT
TO authenticated
USING (
  -- Staff vê todos (já coberto por outras políticas)
  is_staff(auth.uid())
  OR
  -- Usuário cliente vê apenas os próprios
  (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role IN ('client', 'client_master')
    )
    AND EXISTS (
      SELECT 1 FROM client_contacts
      WHERE client_contacts.user_id = auth.uid()
      AND client_contacts.id = tickets.requester_contact_id
    )
  )
);

-- RLS: Usuários de cliente podem criar chamados
CREATE POLICY "Client users can create tickets"
ON tickets
FOR INSERT
TO authenticated
WITH CHECK (
  is_staff(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('client', 'client_master')
  )
);

-- RLS: Usuários de cliente podem ver seus próprios contatos
CREATE POLICY "Client users can view own contact"
ON client_contacts
FOR SELECT
TO authenticated
USING (
  is_staff(auth.uid())
  OR
  user_id = auth.uid()
);