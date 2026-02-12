

# Ajustes: Perfil na Sidebar + Inscricao Estadual no Cadastro de Clientes

## 1. Perfil do Usuario na Sidebar (muito grande)

O bloco do perfil no rodape da sidebar (`SidebarFooter`) ocupa espaco excessivo devido ao padding generoso (`p-4`, `p-3`), o efeito de glow no avatar, e o tamanho do avatar (`h-10 w-10`).

### Alteracoes em `src/components/layout/AppSidebar.tsx`:
- Reduzir padding do footer de `p-4` para `p-3`
- Reduzir padding do link do perfil de `p-3` para `p-2`
- Reduzir margem inferior de `mb-3` para `mb-2`
- Reduzir avatar de `h-10 w-10` para `h-8 w-8`
- Reduzir o efeito de glow (`blur-sm`) para ser mais sutil
- Manter nome, badge de role e botao Sair funcionais

---

## 2. Campo "Inscricao Estadual" no Cadastro de Clientes

Atualmente a tabela `clients` nao possui coluna para Inscricao Estadual. Sera necessario:

### 2a. Migracao de banco de dados
- Adicionar coluna `state_registration` (TEXT, nullable) na tabela `clients`

### 2b. Alteracoes em `src/components/clients/ClientForm.tsx`:
- Adicionar `state_registration` ao schema Zod (string opcional)
- Adicionar valor default no `useForm`
- Adicionar campo no formulario logo abaixo do CNPJ/CPF
- Incluir `state_registration` no payload de submit da mutation
- Preencher automaticamente via consulta CNPJ (se disponivel na API)

### Detalhes tecnicos

**Coluna no banco:**
```sql
ALTER TABLE public.clients ADD COLUMN state_registration TEXT;
```

**Campo no formulario:**
- Label: "Inscricao Estadual"
- Placeholder: "000.000.000.000"
- Posicao: na mesma linha do CNPJ/CPF ou logo abaixo
- Visibilidade: oculto para tecnicos (mesmo comportamento do CNPJ)

