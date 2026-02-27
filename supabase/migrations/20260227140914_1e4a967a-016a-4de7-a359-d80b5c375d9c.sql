ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS nfse_aliquota numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nfse_iss_retido boolean DEFAULT false;

COMMENT ON COLUMN contracts.nfse_aliquota IS 'Aliquota ISS (%) para emissao automatica de NFS-e';
COMMENT ON COLUMN contracts.nfse_iss_retido IS 'Se o ISS e retido pelo tomador do servico';