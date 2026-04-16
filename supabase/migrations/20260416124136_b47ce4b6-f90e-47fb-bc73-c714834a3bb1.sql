
-- Add key activation tracking columns
ALTER TABLE doc_licenses ADD COLUMN IF NOT EXISTS key_activated boolean DEFAULT true;
ALTER TABLE doc_licenses ADD COLUMN IF NOT EXISTS key_activated_at date;

-- Migrate legacy linked_email to linked_emails array
UPDATE doc_licenses
SET linked_emails = ARRAY[linked_email],
    linked_email = null
WHERE linked_email IS NOT NULL
  AND (linked_emails IS NULL OR linked_emails = '{}');
