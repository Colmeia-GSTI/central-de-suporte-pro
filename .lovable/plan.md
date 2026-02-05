
# Plano: Aplicar Migração de Status de Processamento e Configuração S3

## Resumo
Aplicar a migração `20260205100000_f98c9e4f-6f35-451b-9c79-e17d3a1b624c.sql` que adiciona:
- 3 novos tipos ENUM para rastreamento de status (boleto, NFS-e, email)
- 10 novos campos na tabela `invoices` com status e metadados de processamento
- Tabela `storage_config` para configurações de S3/storage compatível
- Tabela `invoice_documents` para rastreamento de documentos
- Índices para performance nas novas colunas
- 2 funções PL/pgSQL: `update_invoice_status()` e `generate_signed_url()`

## O que será criado no banco de dados

### Novos ENUMs
- `boleto_processing_status`: 'pendente', 'gerado', 'enviado', 'erro'
- `nfse_processing_status`: 'pendente', 'gerada', 'erro'
- `email_processing_status`: 'pendente', 'enviado', 'erro'

### Novos campos em `invoices`
- `nfse_history_id` - FK para vincular com NFS-e emitida
- `boleto_status`, `boleto_error_msg`, `boleto_sent_at` - Rastreamento de boleto
- `nfse_status`, `nfse_error_msg`, `nfse_generated_at` - Rastreamento de NFS-e
- `email_status`, `email_sent_at`, `email_error_msg` - Rastreamento de email
- `processed_at` - Data/hora de conclusão do processamento
- `processing_attempts` - Número de tentativas
- `processing_metadata` - JSON com informações adicionais

### Novas tabelas
- **storage_config**: Armazena configurações de S3/Netskope/MinIO com credenciais encriptadas
- **invoice_documents**: Rastreia documentos gerados (boleto, NFS-e, XML, anexos)

### Funções criadas
- `update_invoice_status()` - Atualiza atomicamente os status das faturas
- `generate_signed_url()` - Gera URLs assinadas temporárias para documentos

## Próximos passos após migração
1. Verificar que as tabelas e campos foram criados corretamente
2. Implementar componentes React para UI (já documentados no IMPLEMENTATION_GUIDE.md)
3. Atualizar Edge Functions para usar os novos campos
4. Testar o fluxo completo de processamento em lote

## Impacto
- ✅ Zero impacto em dados existentes (apenas ADD, sem DELETE)
- ✅ Backward compatible (todos os novos campos têm DEFAULT)
- ✅ Sem modificação de tabelas reservadas do Supabase
- ✅ Pronto para implementação dos componentes React

