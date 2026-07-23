---
paths:
  - "supabase/migrations/**"
  - "src/integrations/supabase/**"
---

# Banco de dados

Carregado automaticamente ao tocar em migrations ou nos tipos gerados do Supabase.

## 🚫 Nunca escreva no banco fora do MCP do Lovable
Qualquer alteração — **schema E dados** (DDL, DML, correção de registro, qualquer SQL que grava) —
é feita **exclusivamente** por `mcp__…_Lovable__query_database`. **Nunca** use o MCP do Supabase,
nem `psql`, nem conexão direta. Leitura (SELECT) também pelo MCP do Lovable.

Adicionar um arquivo em `supabase/migrations/` **não aplica nada** — é registro histórico.
A fonte da verdade do schema vivo é o banco.

Toda alteração aplicada deve ser registrada em
[`docs/agents/_transversais.md`](../../docs/agents/_transversais.md) §2.1 (data, SQL, motivo, categoria).
Use a skill `/alterar-banco`.

## Arquivos gerados — não editar à mão
`src/integrations/supabase/client.ts` e `types.ts` são **gerados**. Depois de mudar o schema,
regenere pelo Lovable. Editar à mão gera drift silencioso.

## Regras de integridade
- **Não apague registro financeiro nem de auditoria.** Para remover usuário/cliente referenciado
  nesses registros, **anonimize**. `audit_logs` é append-only por RLS.
- Toda tabela nova precisa de política RLS. Sem RLS = tabela aberta.
- Funções `SECURITY DEFINER` devem ter `SET search_path` e checar role no corpo quando expõem
  dado sensível — o frontend não é proteção.

## Crons (pg_cron)
Não estão em migrations **por design**: são geridos via MCP do Lovable, fonte da verdade = banco.
Ao mudar um agendamento, atualize o snapshot em `_transversais.md` §crons.
Todo cron deve passar `Authorization: Bearer <service-role key do Vault>` — chave `anon` faz a
edge responder 401 e o job falha em silêncio.
