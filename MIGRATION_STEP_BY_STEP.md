# 🚀 Guia de Migração - Passo a Passo

## ⚠️ **O Erro que Você Recebeu**

```
Query failed
Failed to run sql query: ERROR: 42601: syntax error at or near "supabase"
LINE 1: supabase migration up
        ^
```

**Problema:** Você tentou executar `supabase migration up` como SQL, mas é um comando CLI.

**Solução:** Copiar o arquivo SQL e executar diretamente.

---

## ✅ **SOLUÇÃO RÁPIDA (5 minutos)**

### **Passo 1: Copiar SQL**
Arquivo a usar: `MIGRATION_MANUAL.sql` (já criado no projeto)

**Conteúdo:** 196 linhas de SQL puro

### **Passo 2: Ir para Supabase**
1. Abra https://app.supabase.com
2. **Selecione** seu projeto: `central-de-suporte-pro`
3. No menu esquerdo, clique em **SQL editor**

```
┌─ Supabase Dashboard ─────────────────────┐
│                                          │
│  Projects > central-de-suporte-pro      │
│                                          │
│  Menu (esquerda):                        │
│  ├─ Overview                             │
│  ├─ Database                             │
│  ├─ SQL editor  ← CLIQUE AQUI            │
│  ├─ Users                                │
│  ├─ Storage                              │
│  ├─ Edge functions                       │
│  ├─ AI                                   │
│  ├─ Secrets                              │
│  └─ Logs                                 │
│                                          │
└──────────────────────────────────────────┘
```

### **Passo 3: Colar SQL**

Na tela do SQL editor:
1. Você verá um editor em branco
2. **Cole TODO o conteúdo** do arquivo `MIGRATION_MANUAL.sql`
3. Selecione tudo (Ctrl+A)

```
┌─────────────────────────────────────────────────────────┐
│  SQL editor                                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  -- ==========================================           │
│  -- EXECUTE THIS DIRECTLY IN SUPABASE SQL EDITOR        │
│  -- ==========================================           │
│                                                         │
│  -- 1. CREATE ENUMS FOR STATUS TRACKING                 │
│  -- ==========================================           │
│                                                         │
│  CREATE TYPE public.boleto_processing_status AS ENUM   │
│  ('pendente', 'gerado', 'enviado', 'erro');            │
│                                                         │
│  CREATE TYPE public.nfse_processing_status AS ENUM     │
│  ('pendente', 'gerada', 'erro');                       │
│                                                         │
│  [... muito mais SQL aqui ...]                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Format SQL] [Clear]              [Run] ← CLIQUE AQUI  │
└─────────────────────────────────────────────────────────┘
```

### **Passo 4: Executar**
1. Clique no botão azul **Run** (canto inferior direito)
2. **Aguarde 10-30 segundos**

### **Passo 5: Verificar Resultado**

Se bem-sucedido, você verá:
```
✅ Query successful
   Rows affected: 0
   (Isso é normal - são DDL statements)
```

Se houver erro, você verá algo como:
```
❌ Query failed
   ERROR: 42710: type "public.boleto_processing_status" already exists
   (Isso é OK - tipo já existe. Pode ignorar)
```

---

## 📋 **CHECKLIST PÓS-MIGRAÇÃO**

Após executar com sucesso, verifique:

### 1. Verificar Tabelas Criadas
```sql
SELECT * FROM information_schema.tables
WHERE table_name IN ('storage_config', 'invoice_documents')
AND table_schema = 'public';
```

Resultado esperado:
```
storage_config      | public
invoice_documents   | public
```

### 2. Verificar Colunas em Invoices
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'invoices'
AND column_name IN (
  'boleto_status', 'nfse_status', 'email_status',
  'processed_at', 'processing_metadata'
);
```

Resultado esperado:
```
boleto_status              | user-defined
nfse_status                | user-defined
email_status               | user-defined
processed_at               | timestamp with time zone
processing_metadata        | jsonb
```

### 3. Verificar ENUMs
```sql
SELECT enumname, enumlabel
FROM pg_enum
WHERE enumname IN (
  'boleto_processing_status',
  'nfse_processing_status',
  'email_processing_status'
);
```

Resultado esperado:
```
boleto_processing_status   | pendente
boleto_processing_status   | gerado
boleto_processing_status   | enviado
boleto_processing_status   | erro
(... mais 6 linhas para outros ENUMs)
```

---

## 🔧 **TROUBLESHOOTING**

### **Erro: "type already exists"**
```
ERROR: 42710: type "public.boleto_processing_status" already exists
```
**Causa:** Você já executou a migração antes (ou existe parcialmente)
**Solução:** Ignore este erro - é seguro. A migração foi parcialmente aplicada.

### **Erro: "column already exists"**
```
ERROR: 42701: column "boleto_status" of relation "invoices" already exists
```
**Causa:** Coluna já existe
**Solução:** Ignore - foram adicionados `IF NOT EXISTS` para evitar isto

### **Erro: "permission denied"**
```
ERROR: 42501: permission denied for schema public
```
**Causa:** Usuário não tem permissão
**Solução:** Use conta de projeto Supabase ou admin

### **Timeout (>5 minutos)**
```
Request timeout
```
**Causa:** Banco de dados está sobrecarregado ou com muitos dados
**Solução:**
1. Aguarde 5 minutos e tente novamente
2. Se continuar, tente via CLI local (veja abaixo)

---

## 🖥️ **ALTERNATIVA: Via CLI Local**

Se não conseguir via Dashboard:

### **Passo 1: Instalar CLI**
```bash
npm install -g @supabase/cli
```

### **Passo 2: Link ao Projeto**
```bash
cd /home/user/central-de-suporte-pro

supabase link --project-ref silefpsayliwqtoskkdz
# (Você será solicitado a fazer login no Supabase)
```

### **Passo 3: Executar Migração**
```bash
supabase migration up
```

Resultado esperado:
```
Applying migration 20260205100000_f98c9e4f-6f35-451b-9c79-e17d3a1b624c.sql
✓ Migration completed successfully
```

### **Passo 4: Verificar**
```bash
supabase status
```

---

## ✨ **SUCESSO!**

Após a migração completar:

1. ✅ Novas tabelas criadas
2. ✅ Novos campos em `invoices`
3. ✅ ENUMs registrados
4. ✅ Índices criados
5. ✅ Funções PL/pgSQL compiladas

### **Próximos Passos:**

1. Fazer deploy do código (Lovable)
2. Configurar storage S3
3. Usar as novas funcionalidades

---

## 📞 **PRECISA DE AJUDA?**

Se algo não funcionar:

1. **Verifique o erro exato** (copie a mensagem)
2. **Procure na seção TROUBLESHOOTING acima**
3. **Se for "already exists"** = Migração foi parcial, é seguro continuar
4. **Se for "permission denied"** = Problema de autenticação, tente CLI

---

**Data:** 05 de Fevereiro de 2026
**Status:** Pronto para executar
