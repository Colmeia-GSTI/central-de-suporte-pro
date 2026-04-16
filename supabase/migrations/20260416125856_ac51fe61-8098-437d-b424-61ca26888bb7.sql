-- Add is_internal column
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- Add enum values
ALTER TYPE ticket_origin ADD VALUE IF NOT EXISTS 'internal';
ALTER TYPE ticket_origin ADD VALUE IF NOT EXISTS 'task';

-- Partial index for fast filtering
CREATE INDEX IF NOT EXISTS idx_tickets_is_internal 
ON tickets(is_internal) WHERE is_internal = true;