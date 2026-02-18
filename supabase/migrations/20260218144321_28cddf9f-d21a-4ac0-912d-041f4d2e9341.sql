
ALTER TABLE nfse_history ALTER COLUMN provider SET DEFAULT 'asaas';
UPDATE nfse_history SET provider = 'asaas' WHERE provider = 'nacional';
