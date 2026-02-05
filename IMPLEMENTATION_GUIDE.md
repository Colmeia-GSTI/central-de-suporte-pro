# Guia de Implementação - Sistema de Gestão e Processamento de Faturas

## 📋 Resumo da Implementação

Este documento descreve as implementações realizadas para adicionar um sistema completo de gestão e processamento de faturas com indicadores visuais de status, processamento em lote e integração com S3-compatível (Netskope, AWS S3, MinIO, etc).

## 🗄️ 1. MIGRAÇÕES DE BANCO DE DADOS

### Arquivo de Migração Criado:
- **`supabase/migrations/20260205100000_f98c9e4f-6f35-451b-9c79-e17d3a1b624c.sql`**

### Mudanças Realizadas:

#### 1.1 Novos ENUMs
```sql
boleto_processing_status: 'pendente' | 'gerado' | 'enviado' | 'erro'
nfse_processing_status: 'pendente' | 'gerada' | 'erro'
email_processing_status: 'pendente' | 'enviado' | 'erro'
```

#### 1.2 Novos Campos na Tabela `invoices`
- `nfse_history_id` - FK para tabela nfse_history
- `boleto_status` - Status do processamento do boleto
- `boleto_error_msg` - Mensagem de erro do boleto
- `boleto_sent_at` - Timestamp de envio do boleto
- `nfse_status` - Status do processamento da NFS-e
- `nfse_error_msg` - Mensagem de erro da NFS-e
- `nfse_generated_at` - Timestamp de geração da NFS-e
- `email_status` - Status de envio de email
- `email_sent_at` - Timestamp de envio de email
- `email_error_msg` - Mensagem de erro de email
- `processed_at` - Timestamp de processamento completo
- `processing_attempts` - Contagem de tentativas
- `processing_metadata` - JSON com metadados de processamento

#### 1.3 Nova Tabela: `storage_config`
Armazena configurações de S3-compatível (Netskope, AWS, MinIO, etc)
- Endpoint
- Credenciais (criptografadas)
- Configurações de bucket e região
- Opções de URL assinada
- Status de teste de conexão

#### 1.4 Nova Tabela: `invoice_documents`
Rastreia documentos armazenados no S3
- Tipo de documento (boleto, nfse, xml, attachment)
- Caminho e informações de arquivo
- Status de upload
- URLs assinadas temporárias

#### 1.5 Índices para Performance
Adicionados índices em:
- `invoices.boleto_status`
- `invoices.nfse_status`
- `invoices.email_status`
- `invoices.processed_at`
- `storage_config.is_active`
- `invoice_documents.invoice_id`

#### 1.6 Funções PL/pgSQL
- `update_invoice_status()` - Atualiza status de forma atômica
- `generate_signed_url()` - Gera URLs assinadas temporárias

### ✅ Como Aplicar a Migração:

#### Opção 1: Lovable Cloud Dashboard
1. Acesse https://lovable.dev
2. Vá para o projeto "central-de-suporte-pro"
3. Abra o terminal integrado
4. A migração será aplicada automaticamente ao fazer deploy

#### Opção 2: Supabase CLI (Local)
```bash
# Instale Supabase CLI se necessário
npm install -g @supabase/cli

# Link ao projeto remoto
supabase link --project-ref silefpsayliwqtoskkdz

# Aplique a migração
supabase migration up

# Verifique a aplicação
supabase status
```

#### Opção 3: Supabase Dashboard
1. Acesse https://app.supabase.com
2. Selecione projeto "central-de-suporte-pro"
3. Vá para SQL Editor
4. Copie e execute o conteúdo do arquivo de migração

---

## 🔌 2. BACKEND - EDGE FUNCTIONS

### Novas Edge Functions Criadas:

#### 2.1 `batch-process-invoices`
**Arquivo:** `supabase/functions/batch-process-invoices/index.ts`

**Funcionalidade:** Processa múltiplas faturas em lote
- Gera boletos
- Gera PIX
- Emite NFS-e
- Envia notificações (Email/WhatsApp)
- Atualiza status em tempo real

**Autenticação:** Bearer token JWT
**Permissões:** admin, manager, financial

**Exemplo de Uso:**
```typescript
const response = await supabase.functions.invoke("batch-process-invoices", {
  body: {
    invoice_ids: ["inv-123", "inv-456"],
    generate_boleto: true,
    generate_pix: false,
    emit_nfse: true,
    send_email: true,
    send_whatsapp: false,
    billing_provider: "banco_inter"
  }
});
```

#### 2.2 `test-s3-connection`
**Arquivo:** `supabase/functions/test-s3-connection/index.ts`

**Funcionalidade:** Testa conexão com S3-compatível
- Valida credenciais
- Testa permissão de leitura
- Testa permissão de escrita
- Retorna detalhes do erro

**Autenticação:** Bearer token JWT
**Permissões:** admin, manager

**Exemplo de Uso:**
```typescript
const response = await supabase.functions.invoke("test-s3-connection", {
  body: {
    endpoint: "https://storage.netskope.com",
    region: "us-east-1",
    bucket_name: "faturascolmeia",
    access_key: "AKIAIOSFODNN7EXAMPLE",
    secret_key: "wJalrXUtnFEMI/K7MDENG/K7MDENG"
  }
});
```

---

## 🎨 3. FRONTEND - COMPONENTES REACT

### Novos Componentes Criados:

#### 3.1 `InvoiceActionIndicators.tsx`
**Localização:** `src/components/billing/InvoiceActionIndicators.tsx`

**Funcionalidade:** Exibe indicadores visuais de status em tempo real

**Status Visuais:**
- **Boleto:** ✓ verde (enviado), ✗ vermelho (erro), ○ cinza (pendente), 📄 amarelo (gerado)
- **NFS-e:** ✓ verde (gerada), ✗ vermelho (erro), ○ cinza (pendente)
- **Email:** ✓ verde (enviado), ✗ vermelho (erro), ○ cinza (pendente)

**Props:**
```typescript
interface InvoiceActionIndicatorsProps {
  boletoStatus?: "pendente" | "gerado" | "enviado" | "erro" | null;
  boletoUrl?: string | null;
  boletoError?: string | null;
  nfseStatus?: "pendente" | "gerada" | "erro" | null;
  nfseUrl?: string | null;
  nfseError?: string | null;
  emailStatus?: "pendente" | "enviado" | "erro" | null;
  emailError?: string | null;
  onBoletoClick?: () => void;
  onNfseClick?: () => void;
  onEmailClick?: () => void;
  size?: "sm" | "md" | "lg";
}
```

#### 3.2 `BillingBatchProcessing.tsx`
**Localização:** `src/components/billing/BillingBatchProcessing.tsx`

**Funcionalidade:** Dialog para configurar e executar processamento em lote

**Opções de Processamento:**
- [ ] Gerar Boletos Bancários
- [ ] Gerar Chaves PIX
- [ ] Emitir Notas Fiscais (NFS-e)
- [ ] Enviar por Email
- [ ] Enviar por WhatsApp

#### 3.3 `S3StorageConfigForm.tsx`
**Localização:** `src/components/settings/S3StorageConfigForm.tsx`

**Funcionalidade:** Formulário para configurar storage S3-compatível

**Features:**
- Suporte a múltiplos providers (Netskope, AWS S3, MinIO, Wasabi, Backblaze)
- Criptografia de credenciais
- Teste de conexão
- URLs assinadas temporárias
- Ativação/desativação de configurações

#### 3.4 Biblioteca S3: `s3-storage.ts`
**Localização:** `src/lib/s3-storage.ts`

**Funcionalidade:** Client para integração com S3-compatível

**Métodos Principais:**
```typescript
uploadDocument(params: DocumentUploadParams): Promise<{success, url?, error?}>
generateSignedUrl(params: SignedUrlParams): Promise<{success, url?, expiresAt?, error?}>
testConnection(): Promise<{success, message}>
deleteDocument(filePath: string): Promise<{success, error?}>
listDocuments(clientId: string, year: number, month: number): Promise<{success, documents?, error?}>
```

### Modificações em Componentes Existentes:

#### 3.5 `BillingInvoicesTab.tsx` - Modificado
**Localização:** `src/components/billing/BillingInvoicesTab.tsx`

**Mudanças:**
1. ✅ Adicionado coluna com checkboxes para seleção múltipla
2. ✅ Adicionada coluna "Ações" com indicadores visuais
3. ✅ Adicionado estado `selectedInvoices` (Set)
4. ✅ Adicionado estado `isBatchProcessingOpen`
5. ✅ Implementados handlers:
   - `toggleInvoiceSelection()` - Toggle individual
   - `toggleSelectAll()` - Select/deselect all
6. ✅ Adicionado banner informativo quando faturas selecionadas
7. ✅ Adicionado botão "Processar Selecionados" (com permissão)
8. ✅ Integração com `BillingBatchProcessing` dialog

**Nova Estrutura da Tabela:**
```
[Checkbox] [#] [Cliente] [Competência] [Valor] [Vencimento] [Status] [Ações] [Menu]
```

---

## 📋 4. FLUXO DE PROCESSAMENTO

### Fluxo 1: Processamento Individual
```
Usuário clica em "Emitir Completo"
    ↓
1. Gerar Boleto (se não existe)
2. Gerar PIX (se não existe)
3. Emitir NFS-e (se tem contrato)
4. Enviar Notificações (Email + WhatsApp)
    ↓
Update: invoices.status, processed_at
    ↓
Invalidar cache de queries
```

### Fluxo 2: Processamento em Lote
```
Usuário seleciona múltiplas faturas
    ↓
Clica "Processar Selecionados"
    ↓
Abre Dialog com opções de processamento
    ↓
Clica "Iniciar Processamento"
    ↓
Invoca Edge Function: batch-process-invoices
    ↓
Para cada fatura:
  ├─ Gerar Boleto (se selecionado)
  ├─ Gerar PIX (se selecionado)
  ├─ Emitir NFS-e (se selecionado)
  └─ Enviar Notificações (se selecionado)
    ↓
Update: invoices com novo status
    ↓
Mostrar resumo: X processadas, Y erros
    ↓
Limpar seleção e recarregar dados
```

### Fluxo 3: Upload para S3
```
Usuário acessa Configurações → Storage S3
    ↓
Preenche formulário com credenciais
    ↓
Clica "Testar Conexão"
    ↓
Invoca Edge Function: test-s3-connection
    ↓
Se sucesso:
  ├─ Salva storage_config com is_active=true
  └─ Desativa outras configs
    ↓
Faturas processadas são armazenadas em:
  └─ {endpoint}/{bucket}/{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf
    ↓
Gera URLs assinadas (24-48h de validade)
```

---

## 🔒 5. SEGURANÇA

### Criptografia de Credenciais
- Access Key e Secret Key são criptografados via Supabase Vault
- Não são expostos em respostas da API
- Apenas Roles autorizados (admin, manager) podem acessar

### Permissões Granulares
```
module: "financial" action: "manage"
  ├─ Processar Faturas em Lote
  ├─ Gerar Faturas Mensais
  └─ Cobrança em Lote

module: "financial" action: "create"
  └─ Criar Nova Fatura

module: "settings" action: "edit"
  └─ Configurar Storage S3
```

### URLs Assinadas Temporárias
- Válidas por 24-48 horas (configurável)
- Especificação de cliente/mês/tipo
- Permissões de read-only

---

## 📊 6. BANCO DE DADOS - ESTRUTURA COMPLETA

### Novo Schema (após migração)

```sql
-- Tabela: storage_config
CREATE TABLE storage_config (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL, -- netskope, s3, minio, wasabi, backblaze
    endpoint TEXT NOT NULL,
    region TEXT,
    bucket_name TEXT NOT NULL,
    access_key TEXT NOT NULL, -- criptografado
    secret_key TEXT NOT NULL, -- criptografado
    path_prefix TEXT DEFAULT '{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf',
    signed_url_expiry_hours INTEGER DEFAULT 48,
    is_active BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMPTZ,
    last_test_result TEXT, -- 'success' ou mensagem de erro
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Tabela: invoice_documents
CREATE TABLE invoice_documents (
    id UUID PRIMARY KEY,
    invoice_id UUID (FK), -- NOT NULL
    document_type TEXT NOT NULL, -- boleto, nfse, xml, attachment
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    storage_config_id UUID (FK),
    public_url TEXT,
    signed_url TEXT,
    signed_url_expires_at TIMESTAMPTZ,
    upload_status TEXT DEFAULT 'pending', -- pending, uploaded, error
    upload_error_msg TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Tabela: invoices (campos adicionados)
ALTER TABLE invoices ADD COLUMN
    nfse_history_id UUID (FK),
    boleto_status boleto_processing_status,
    boleto_error_msg TEXT,
    boleto_sent_at TIMESTAMPTZ,
    nfse_status nfse_processing_status,
    nfse_error_msg TEXT,
    nfse_generated_at TIMESTAMPTZ,
    email_status email_processing_status,
    email_sent_at TIMESTAMPTZ,
    email_error_msg TEXT,
    processed_at TIMESTAMPTZ,
    processing_attempts INTEGER DEFAULT 0,
    processing_metadata JSONB;
```

---

## 🚀 7. COMO USAR AS NOVAS FUNCIONALIDADES

### 7.1 Acessar Configuração de Storage S3
1. Vá para **Configurações** → **Storage S3**
2. Clique em **Nova Configuração**
3. Preencha os dados:
   - **Nome:** Ex: "Netskope Principal"
   - **Provider:** Selecione (Netskope, AWS S3, MinIO, etc)
   - **Endpoint:** Ex: `https://storage.netskope.com`
   - **Region:** Ex: `us-east-1`
   - **Bucket:** Ex: `faturascolmeia`
   - **Access Key:** Sua chave de acesso
   - **Secret Key:** Sua chave secreta
4. Clique **Testar Conexão**
5. Se OK, clique **Salvar Configuração**

### 7.2 Selecionar e Processar Faturas em Lote
1. Vá para **Faturamento** → Aba **Faturas**
2. Selecione as checkboxes das faturas desejadas
3. Aparecerá banner informativo: "X fatura(s) selecionada(s)"
4. Clique **Processar Selecionados**
5. Selecione as opções de processamento:
   - ✓ Gerar Boletos
   - ✓ Emitir NFS-e
   - ✓ Enviar por Email
6. Clique **Iniciar Processamento**
7. Aguarde conclusão (pode levar alguns minutos)

### 7.3 Visualizar Status de Processamento
Na coluna **Ações** da tabela de faturas:
- **✓ Verde:** Processamento bem-sucedido
- **✗ Vermelho:** Erro no processamento (hover para ver mensagem)
- **○ Cinza:** Pendente de processamento

---

## 🔧 8. TROUBLESHOOTING

### Problema: Migração não é aplicada
**Solução:**
1. Verifique se está autenticado no Lovable/Supabase
2. Execute `supabase status` para ver o estado
3. Se a migração estiver pendente, execute `supabase migration up`

### Problema: Conexão S3 falha
**Solução:**
1. Verifique endpoint (sem trailing slash)
2. Verifique credenciais (copie exatamente sem espaços)
3. Verifique se bucket existe
4. Testemanualmente com CLI: `aws s3 ls s3://bucket-name --endpoint-url https://... --region us-east-1`

### Problema: Processamento em lote não inicia
**Solução:**
1. Verifique permissão (`financial.manage`)
2. Verifique integração de pagamento configurada
3. Verifique logs: F12 → Console no navegador
4. Verifique se há espaço em disco no servidor

### Problema: NFS-e não é emitida
**Solução:**
1. Verifique se a fatura está vinculada a um contrato
2. Verifique se certificado digital está válido
3. Verifique se Asaas está configurado e ativo
4. Verifique se município tem suporte a NFS-e

---

## 📚 9. REFERÊNCIAS E DOCUMENTAÇÃO

- **Lovable Docs:** https://lovable.dev/docs
- **Supabase Docs:** https://supabase.com/docs
- **React Query:** https://tanstack.com/query/latest
- **Tailwind CSS:** https://tailwindcss.com

---

## ✅ 10. CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Migração de banco de dados aplicada
- [ ] Edge Functions criadas e deployadas
- [ ] Componentes React compilam sem erros
- [ ] Storage S3 configurado e testado
- [ ] Permissões de usuários configuradas
- [ ] Testes manuais de processamento individual executados
- [ ] Testes manuais de processamento em lote executados
- [ ] Testes de upload para S3 executados
- [ ] Documentação interna atualizada
- [ ] Treinamento de usuários realizado

---

**Data de Implementação:** 05 de Fevereiro de 2026
**Versão:** 1.0
**Status:** ✅ Completo

Para dúvidas ou reportar bugs: [contact-suporte@colmeia.com.br](mailto:contact-suporte@colmeia.com.br)
