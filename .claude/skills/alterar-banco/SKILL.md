---
name: alterar-banco
description: Aplica alteração de schema ou de dados no Lovable Cloud pelo caminho correto (MCP do Lovable) e registra no log de alterações. Use para qualquer DDL/DML, correção de dado, RLS, RPC, trigger ou cron.
disable-model-invocation: true
---

# Alterar o banco (Lovable Cloud)

Argumento: o que precisa mudar. Sem argumento, pergunte antes de agir.

## Regra inviolável
O banco é alterado **exclusivamente** por `mcp__…_Lovable__query_database`.
Nunca pelo MCP do Supabase, nunca por conexão direta, nunca "aplicando" uma migration
(arquivos em `supabase/migrations/` são registro histórico — não executam nada).

## Passos

1. **Audite antes.** Leia o estado atual antes de escrever. SELECT no MCP do Lovable:
   ```sql
   -- colunas reais (não confie em types.ts, que pode estar stale)
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns WHERE table_name = '<tabela>';

   -- dependências antes de qualquer DROP
   SELECT * FROM information_schema.table_constraints WHERE table_name = '<tabela>';
   ```

2. **Cheque o impacto.** Quem lê/escreve isso? Frontend, edge, trigger, view, RPC, cron?
   Não altere no escuro. Em dúvida sobre intenção ou dado, **pergunte**.

3. **Nunca destrutivo em registro financeiro ou de auditoria.** Para "remover" um usuário ou
   cliente referenciado nesses registros, **anonimize**. Se a operação apaga linha,
   confirme com o usuário antes.

4. **Aplique** via `query_database`. Uma operação por vez, verificando o resultado de cada uma.

5. **Verifique o efeito** com um SELECT que prove que ficou como esperado — não confie no
   "0 rows affected" sem ler.

6. **Registre** em [`docs/agents/_transversais.md`](../../../docs/agents/_transversais.md) §2.1:
   `| data | SQL aplicado | motivo/contexto | categoria |`.
   Esse log é a única memória das mudanças, já que as migrations não refletem o banco vivo.

7. **Se mexeu em schema**, os tipos gerados (`src/integrations/supabase/types.ts`) ficam stale.
   Regenere pelo Lovable ou registre a pendência.

## Crons
Mudança de agendamento usa `cron.schedule` / `cron.alter_job` via MCP. Depois atualize o
snapshot de crons em `_transversais.md`. Todo cron precisa passar
`Authorization: Bearer` com a **service-role key do Vault** — com `anon` a edge devolve 401 e
o job falha silenciosamente.
