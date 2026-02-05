# Plano de Correções - CONCLUÍDO

## ✅ Correções Implementadas

| # | Item | Status |
|---|------|--------|
| 1 | S3StorageConfigForm acessível na UI | ✅ FEITO |
| 2 | Schema storage_config atualizado | ✅ FEITO |
| 3 | Aba Storage adicionada em Integrações | ✅ FEITO |
| 4 | Edge function test-s3-connection | ✅ JÁ EXISTE |
| 5 | Tabela invoice_documents | ✅ JÁ EXISTE |

## ⚠️ Ações do Usuário Pendentes

### 1. Gerar Faturas da QUAZA
- Ir para `/billing` → aba "Faturas"
- Clicar em **"Gerar Faturas Mensais"**
- A fatura da QUAZA será criada automaticamente

### 2. Configurar Storage S3 (Opcional)
- Ir para `/settings` → aba "Integrações" → sub-aba "Storage"
- Configurar conexão S3-compatível (Netskope, Hetzner, etc)

### 3. Habilitar PIX no Banco Inter (se necessário)
- Acessar https://developers.inter.co/
- Habilitar escopos `cob.read` e `cob.write`

## Resumo Técnico

### Migração Executada
```sql
ALTER TABLE storage_config 
ADD COLUMN name text NOT NULL DEFAULT '',
ADD COLUMN description text,
ADD COLUMN path_prefix text DEFAULT '{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf',
ADD COLUMN signed_url_expiry_hours integer DEFAULT 48;

-- Renomeações para compatibilidade:
endpoint_url → endpoint
access_key_encrypted → access_key
secret_key_encrypted → secret_key
```

### Arquivos Modificados
- `src/components/settings/IntegrationsTab.tsx` - Adicionada aba Storage com 7 abas
