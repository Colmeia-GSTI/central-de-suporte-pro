
-- Fase 1: Recriar índices críticos removidos (Review 1.7)
CREATE INDEX IF NOT EXISTS idx_nfse_history_contract ON nfse_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_nfse_history_invoice ON nfse_history(invoice_id);
CREATE INDEX IF NOT EXISTS idx_nfse_history_client ON nfse_history(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_active ON contracts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoices_reference_month ON invoices(reference_month);
CREATE INDEX IF NOT EXISTS idx_financial_entries_client ON financial_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_created ON financial_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_client_contacts_user_client ON client_contacts(user_id, client_id);

-- Fase 1: Remover FK bidirecional invoice-nfse (Review 1.8)
ALTER TABLE invoices DROP COLUMN IF EXISTS nfse_history_id;
