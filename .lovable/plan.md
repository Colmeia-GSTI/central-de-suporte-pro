

# Correção: Comentários e Macros - Tabelas/Colunas Ausentes no Banco

## Causa Raiz

O código frontend referencia estruturas de banco de dados que nunca foram criadas:

1. **Coluna `attachments`** na tabela `ticket_comments` -- o código faz SELECT e INSERT com essa coluna, mas ela não existe. Isso causa erro 400 tanto ao carregar quanto ao enviar comentários.
2. **Tabela `ticket_macros`** -- o código busca macros para respostas rápidas, mas a tabela não existe. Isso causa erro 404 (não-crítico, mas gera ruído).

## Correções

### 1. Migration: Adicionar coluna `attachments` e criar tabela `ticket_macros`

Uma única migration SQL para:

**a) Adicionar coluna `attachments` em `ticket_comments`:**
```sql
ALTER TABLE public.ticket_comments 
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
```

**b) Criar tabela `ticket_macros`:**
```sql
CREATE TABLE IF NOT EXISTS public.ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shortcut text,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**c) RLS para `ticket_macros`:**
- Staff pode ler macros ativas
- Admins/managers podem criar/editar/deletar

### 2. Criar bucket de storage `ticket-attachments`

O código faz upload para o bucket `ticket-attachments`, que também não existe. Precisa ser criado para que anexos funcionem.

### 3. Nenhuma alteração no frontend

O código frontend já está correto -- apenas as estruturas de banco estavam faltando. Após a migration, tudo funcionará sem mudanças no código.

## Arquivos/Recursos Modificados

| Recurso | Alteração |
|---|---|
| Migration SQL | Adicionar coluna `attachments`, criar tabela `ticket_macros` com RLS |
| Storage bucket | Criar `ticket-attachments` |

## Impacto

| Cenário | Antes | Depois |
|---|---|---|
| Carregar comentários | Erro 400 (coluna não existe) | Carrega normalmente |
| Enviar comentário | Erro 400 (coluna não existe) | Salva com sucesso |
| Anexar arquivo | Falha (bucket não existe) | Upload funciona |
| Respostas rápidas | Erro 404 (tabela não existe) | Lista vazia (sem macros cadastradas ainda) |

