
# Plano de Seguranca Granular para Tabela Clients

## Resumo Executivo

Implementar controle de acesso granular para a tabela `clients`, onde:
- **Clientes** podem visualizar/editar apenas seus proprios dados
- **Tecnicos** veem apenas informacoes de contato (sem dados fiscais/financeiros)
- **Financeiro/Admin** tem acesso completo a todos os campos

---

## Situacao Atual

### Politicas RLS Existentes
| Politica | Comando | Regra |
|----------|---------|-------|
| Staff can manage clients | ALL | `is_staff(auth.uid())` |
| Staff can view clients | SELECT | `is_staff(auth.uid())` |

### Problemas Identificados
1. **Tecnicos veem dados sensiveis**: CPF/CNPJ, `asaas_customer_id`, `financial_email`
2. **Clientes nao tem acesso**: Nenhuma politica permite que clientes vejam/editem seus dados
3. **Sem separacao de campos**: Todos os staff veem todos os campos

---

## Arquitetura da Solucao

### Camada 1: VIEW Segura para Tecnicos

Criar uma VIEW que expoe apenas campos de contato, ocultando dados fiscais.

```
┌─────────────────────────────────────────────────────────────┐
│  VIEW: clients_contact_only                                  │
├─────────────────────────────────────────────────────────────┤
│  EXPOE:                    OCULTA:                          │
│  - id                      - document (CPF/CNPJ)            │
│  - name                    - asaas_customer_id              │
│  - trade_name              - financial_email                │
│  - email                   - documentation                  │
│  - phone                                                    │
│  - whatsapp                                                 │
│  - address, city, state,                                    │
│    zip_code                                                 │
│  - is_active                                                │
│  - notes                                                    │
└─────────────────────────────────────────────────────────────┘
```

### Camada 2: Politicas RLS Granulares

```
┌─────────────────────────────────────────────────────────────┐
│  ACESSO A TABELA clients (todos os campos)                  │
├─────────────────────────────────────────────────────────────┤
│  SELECT: admin, manager, financial                          │
│  INSERT: admin, manager, financial, technician              │
│  UPDATE: admin, manager, financial                          │
│  DELETE: admin                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ACESSO VIA VIEW clients_contact_only                       │
├─────────────────────────────────────────────────────────────┤
│  SELECT: technician (via VIEW)                              │
│  Campos visiveis: contato apenas                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ACESSO DE CLIENTES (via client_contacts)                   │
├─────────────────────────────────────────────────────────────┤
│  SELECT: Proprio cliente vinculado                          │
│  UPDATE: Campos basicos (email, phone, whatsapp, address)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementacao Detalhada

### Passo 1: Funcoes Helper no Banco

Criar funcoes SECURITY DEFINER para verificar roles especificas:

```sql
-- Verificar se usuario e admin ou financeiro
CREATE OR REPLACE FUNCTION public.is_financial_admin(_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'financial', 'manager')
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Verificar se usuario e apenas tecnico
CREATE OR REPLACE FUNCTION public.is_technician_only(_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'technician'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'financial', 'manager')
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Verificar se cliente tem vinculo com determinado client_id
CREATE OR REPLACE FUNCTION public.client_owns_record(_user_id uuid, _client_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_contacts
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
```

### Passo 2: VIEW para Tecnicos

```sql
CREATE VIEW public.clients_contact_only
WITH (security_invoker = on) AS
SELECT 
  id,
  name,
  trade_name,
  email,
  phone,
  whatsapp,
  whatsapp_validated,
  address,
  city,
  state,
  zip_code,
  notes,
  is_active,
  created_at,
  updated_at
FROM public.clients;

-- RLS na VIEW para tecnicos
-- (tecnicos usam a VIEW, admin/financeiro usam tabela direta)
```

### Passo 3: Atualizar Politicas RLS da Tabela clients

```sql
-- Remover politicas antigas
DROP POLICY IF EXISTS "Staff can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;

-- NOVA: Admin/Manager/Financial podem ver todos os campos
CREATE POLICY "Financial staff can view all clients"
ON public.clients FOR SELECT
USING (is_financial_admin(auth.uid()));

-- NOVA: Tecnicos podem ver apenas via VIEW (nega acesso direto)
-- (Tecnicos usam clients_contact_only, nao a tabela direta)

-- NOVA: Clientes podem ver seus proprios dados
CREATE POLICY "Clients can view own data"
ON public.clients FOR SELECT
USING (
  (has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master'))
  AND client_owns_record(auth.uid(), id)
);

-- NOVA: Staff pode inserir clientes
CREATE POLICY "Staff can insert clients"
ON public.clients FOR INSERT
WITH CHECK (is_staff(auth.uid()));

-- NOVA: Admin/Manager/Financial podem atualizar
CREATE POLICY "Financial staff can update clients"
ON public.clients FOR UPDATE
USING (is_financial_admin(auth.uid()));

-- NOVA: Clientes podem atualizar campos basicos dos seus dados
CREATE POLICY "Clients can update own basic data"
ON public.clients FOR UPDATE
USING (
  (has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master'))
  AND client_owns_record(auth.uid(), id)
);

-- NOVA: Apenas admin pode deletar
CREATE POLICY "Only admin can delete clients"
ON public.clients FOR DELETE
USING (has_role(auth.uid(), 'admin'));
```

### Passo 4: Politica para VIEW (Tecnicos)

```sql
-- Tecnicos acessam dados via VIEW
CREATE POLICY "Technicians can view contact info"
ON public.clients FOR SELECT
USING (
  is_technician_only(auth.uid())
);
```

### Passo 5: Modificacoes no Frontend

#### Arquivo: `src/pages/clients/ClientDetailPage.tsx`

Adicionar logica para verificar role e ocultar campos sensiveis para tecnicos:

```tsx
// Verificar se usuario e apenas tecnico
const isTechnicianOnly = roles.includes('technician') && 
  !roles.includes('admin') && 
  !roles.includes('manager') && 
  !roles.includes('financial');

// Ocultar campos sensiveis na UI
{!isTechnicianOnly && (
  <>
    <div>CPF/CNPJ: {client.document}</div>
    <div>Email Financeiro: {client.financial_email}</div>
  </>
)}
```

#### Arquivo: `src/components/clients/ClientForm.tsx`

Ocultar campos financeiros para tecnicos no formulario de edicao.

---

## Impacto nas Edge Functions

**Nenhum impacto**: Todas as edge functions usam `SUPABASE_SERVICE_ROLE_KEY` que bypassa RLS.

| Funcao | Status |
|--------|--------|
| banco-inter | OK - usa service role |
| asaas-nfse | OK - usa service role |
| resend-payment-notification | OK - usa service role |
| notify-due-invoices | OK - usa service role |
| batch-collection-notification | OK - usa service role |

---

## Arquivos a Modificar

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| Migracao SQL | Criar | Funcoes helper + VIEW + Politicas RLS |
| `src/pages/clients/ClientDetailPage.tsx` | Modificar | Ocultar campos para tecnicos |
| `src/pages/clients/ClientsPage.tsx` | Modificar | Usar VIEW para tecnicos |
| `src/components/clients/ClientForm.tsx` | Modificar | Ocultar campos financeiros |

---

## Matriz de Acesso Final

| Campo | Admin | Manager | Financial | Technician | Client |
|-------|-------|---------|-----------|------------|--------|
| id | RW | RW | RW | R | R |
| name | RW | RW | RW | R | R |
| trade_name | RW | RW | RW | R | R |
| email | RW | RW | RW | R | RW |
| phone | RW | RW | RW | R | RW |
| whatsapp | RW | RW | RW | R | RW |
| address | RW | RW | RW | R | RW |
| city/state/zip | RW | RW | RW | R | RW |
| **document** | RW | RW | RW | - | R |
| **financial_email** | RW | RW | RW | - | RW |
| **asaas_customer_id** | RW | RW | RW | - | - |
| **documentation** | RW | RW | RW | - | R |
| notes | RW | RW | RW | R | R |

**Legenda**: R = Leitura, W = Escrita, RW = Leitura/Escrita, - = Sem acesso

---

## Secao Tecnica

### SQL Completo da Migracao

```sql
-- 1. Funcoes Helper
CREATE OR REPLACE FUNCTION public.is_financial_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ ... $$;

CREATE OR REPLACE FUNCTION public.is_technician_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ ... $$;

CREATE OR REPLACE FUNCTION public.client_owns_record(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ ... $$;

-- 2. VIEW para tecnicos
CREATE VIEW public.clients_contact_only WITH (security_invoker = on) AS
SELECT id, name, trade_name, email, phone, whatsapp, address, city, state, zip_code, notes, is_active, created_at, updated_at
FROM public.clients;

-- 3. Atualizar RLS
DROP POLICY IF EXISTS "Staff can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;

CREATE POLICY "Financial staff can view all clients" ON public.clients FOR SELECT USING (is_financial_admin(auth.uid()));
CREATE POLICY "Technicians can view contact info" ON public.clients FOR SELECT USING (is_technician_only(auth.uid()));
CREATE POLICY "Clients can view own data" ON public.clients FOR SELECT USING (...);
CREATE POLICY "Staff can insert clients" ON public.clients FOR INSERT WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Financial staff can update clients" ON public.clients FOR UPDATE USING (is_financial_admin(auth.uid()));
CREATE POLICY "Clients can update own basic data" ON public.clients FOR UPDATE USING (...);
CREATE POLICY "Only admin can delete clients" ON public.clients FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- 4. Trigger para limitar campos que cliente pode atualizar
CREATE OR REPLACE FUNCTION public.restrict_client_update()
RETURNS trigger AS $$
BEGIN
  IF has_role(auth.uid(), 'client') OR has_role(auth.uid(), 'client_master') THEN
    -- Preservar campos que cliente nao pode alterar
    NEW.document := OLD.document;
    NEW.asaas_customer_id := OLD.asaas_customer_id;
    NEW.name := OLD.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_restrict_client_update
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION restrict_client_update();
```

### Consideracoes de Performance

- Funcoes `SECURITY DEFINER` sao otimizadas com `STABLE`
- VIEW usa `security_invoker = on` para herdar RLS do usuario
- Indices existentes continuam validos
