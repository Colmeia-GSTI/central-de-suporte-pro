
DROP VIEW IF EXISTS clients_contact_only;

CREATE VIEW clients_contact_only WITH (security_invoker = true) AS
SELECT id, name, trade_name, nickname, email, phone, whatsapp,
       whatsapp_validated, is_active, created_at, updated_at,
       address, city, state, zip_code, notes
FROM clients;
