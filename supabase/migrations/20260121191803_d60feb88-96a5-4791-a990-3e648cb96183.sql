-- Add resolution_notes column to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

COMMENT ON COLUMN tickets.resolution_notes IS 
  'Descrição da solução aplicada pelo técnico ao resolver o chamado';