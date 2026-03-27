

## Diagnóstico: Financeiro sem acesso completo

### Problemas encontrados

**1. Permissões Frontend (`src/lib/permissions.ts`) — `clients` module**
- `create`: Permite apenas `["admin", "manager", "technician"]` — **falta `"financial"`**
- `edit`: Permite apenas `["admin", "manager", "technician"]` — **falta `"financial"`**
- O financeiro pode **ver** clientes mas não pode **criar nem editar**

**2. Permissões Frontend — `contracts` module**
- `create`: Apenas `["admin", "manager"]` — **falta `"financial"`**
- `edit`: Apenas `["admin", "manager"]` — **falta `"financial"`**
- O financeiro precisa criar/editar contratos para gestão de faturamento

**3. RLS (Backend) — tabela `contracts`**
- A política `ALL` para contracts permite apenas `admin` e `manager`
- **Falta policy para financial** poder inserir/atualizar contratos

**4. RLS (Backend) — tabela `clients`**
- INSERT policy (`Staff can insert clients`) usa `is_staff()` — **OK, financial já é staff**
- UPDATE policy (`Financial staff can update clients`) usa `is_financial_admin()` — **OK**
- Então o backend já permite, mas o **frontend bloqueia** o botão de criar/editar

### Plano de correção

#### Arquivo 1: `src/lib/permissions.ts`
Adicionar `"financial"` nas seguintes permissões:
- `clients.create` → adicionar `"financial"`
- `clients.edit` → adicionar `"financial"`
- `contracts.create` → adicionar `"financial"`
- `contracts.edit` → adicionar `"financial"`

#### Migração SQL: RLS para `contracts`
Criar nova policy para que o financeiro possa inserir e atualizar contratos:
```sql
CREATE POLICY "Financial can manage contracts"
ON public.contracts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'financial'))
WITH CHECK (has_role(auth.uid(), 'financial'));
```

### Resumo do impacto
- **Clientes**: Financeiro poderá cadastrar e editar clientes (botão "Novo Cliente" ficará visível)
- **Contratos**: Financeiro poderá criar e editar contratos
- **Faturas, boletos, NFS-e**: Já funcionam — RLS e frontend já permitem para `financial`
- **Conciliação bancária, lançamentos financeiros**: Já funcionam
- **Relatórios**: Já funcionam (view + export permitidos)

Estas são as únicas lacunas encontradas na varredura completa.

