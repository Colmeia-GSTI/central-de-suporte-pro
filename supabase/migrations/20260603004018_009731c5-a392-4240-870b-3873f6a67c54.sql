-- Add soft-delete/archive columns to nfse_history for fiscal compliance
ALTER TABLE public.nfse_history
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Partial index to speed up listings of active NFS-e
CREATE INDEX IF NOT EXISTS idx_nfse_history_is_active
  ON public.nfse_history (created_at DESC)
  WHERE is_active = true;