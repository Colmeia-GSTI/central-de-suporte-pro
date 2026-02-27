-- =============================================================
-- Fase 2: Melhorias Estruturais — Múltiplas FAlhas
-- FALHA-04: field_changes em ticket_history
-- FALHA-05: attachments em ticket_comments
-- FALHA-17: ticket_links (vinculação de chamados)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- FALHA-04: Coluna field_changes em ticket_history
-- Permite rastrear quais campos foram alterados com old/new values
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ticket_history
  ADD COLUMN IF NOT EXISTS field_changes jsonb DEFAULT NULL;

COMMENT ON COLUMN ticket_history.field_changes IS
  'Array JSON com alterações de campo: [{field, label, old, new}]';

-- ─────────────────────────────────────────────────────────────
-- FALHA-05: Coluna attachments em ticket_comments
-- Permite anexar arquivos a comentários
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ticket_comments.attachments IS
  'Array JSON com arquivos: [{name, url, size, type, path}]';

-- ─────────────────────────────────────────────────────────────
-- FALHA-17: Tabela ticket_links (vinculação/relação entre chamados)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_links (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  related_ticket_id uuid   NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  link_type    text        NOT NULL DEFAULT 'related',
  -- 'related'      = chamados relacionados
  -- 'duplicates'   = este duplica o outro
  -- 'is_parent_of' = este é pai do outro (chamado mestre)
  -- 'is_child_of'  = este é filho do outro
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_links_no_self_ref  CHECK (ticket_id <> related_ticket_id),
  CONSTRAINT ticket_links_unique_pair  UNIQUE (ticket_id, related_ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_links_ticket_id
  ON ticket_links (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_links_related_id
  ON ticket_links (related_ticket_id);

ALTER TABLE ticket_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can select ticket_links"
  ON ticket_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'technician')
    )
  );

CREATE POLICY "Staff can insert ticket_links"
  ON ticket_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'technician')
    )
  );

CREATE POLICY "Admins and managers can delete ticket_links"
  ON ticket_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Índice GIN para buscas full-text em título e descrição (FALHA-01)
-- Melhora performance de busca futura
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_fts
  ON tickets
  USING gin(to_tsvector('portuguese',
    coalesce(title, '') || ' ' || coalesce(description, '')
  ));
