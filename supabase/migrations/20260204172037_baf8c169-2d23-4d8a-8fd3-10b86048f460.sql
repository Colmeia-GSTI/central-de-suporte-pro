-- Atualizar série padrão para '1' (série em uso no Portal Nacional)
ALTER TABLE nfse_history 
ALTER COLUMN serie SET DEFAULT '1';

-- Atualizar registros existentes que usam série antiga
UPDATE nfse_history 
SET serie = '1' 
WHERE serie = '900';