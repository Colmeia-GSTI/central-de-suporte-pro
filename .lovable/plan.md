## Remover completamente o card "Configurar Hermes Bot (temporário)" e os usuários [E2E]

### 1. Frontend — `src/pages/settings/SettingsPage.tsx`
- Remover o bloco `<Card>` "Configurar Hermes Bot (temporário)" (linhas 212-233).
- Remover o handler `handleSetupHermes`, o state `isSettingUpHermes` e o import `Bot` do lucide-react.
- Remover imports não usados após a limpeza: `Card/CardContent/CardHeader/CardTitle`, `supabase`, `toast` (verificar se ainda são usados em outro lugar do arquivo; remover só os que ficarem órfãos).

### 2. Edge Function — apagar definitivamente
- Deletar `supabase/functions/setup-hermes-bot/` (a função e o diretório). Como o "hermes bot" já foi configurado em produção (usuário `hermes@colmeiagsti.com.br` existe e está em uso pelo relay UniFi), a função de setup não é mais necessária.
- **Não** mexer no usuário `hermes@colmeiagsti.com.br` — ele é o bot real do relay UniFi (ver `relay-unifi/RUNBOOK_HERMES.md`) e continua ativo.

### 3. Banco de dados — remover os 2 usuários E2E
Excluir completamente os dois usuários de teste:
- `e2e-test@colmeiagsti.com.br` (id `a200c343-0a79-444e-a939-0e32f5567606`)
- `e2e-test-2@colmeiagsti.com.br` (id `e5f1264f-a374-4ca6-87b7-459ba4d7be4e`)

Antes de deletar do `auth.users`, checar e limpar referências em tabelas relacionadas (profiles, user_roles, user_clients, audit_logs como ator, tickets criados, etc.). Estratégia:
1. Rodar uma query de auditoria listando todas as referências aos 2 IDs.
2. Para tabelas operacionais sem impacto (profiles, user_roles, user_clients, notification_preferences, push_subscriptions, sessões) → DELETE direto.
3. Para tabelas com histórico financeiro/auditoria (audit_logs, ticket_history) → manter o registro histórico mas, se houver FK, anonimizar o nome (regra do projeto: não apagar registros financeiros). Esses usuários nunca tiveram chamados/faturamento reais, então a expectativa é que não haja nada relevante — confirmar antes.
4. `DELETE FROM auth.users WHERE id IN (...)` (cascata cuidará do resto).
5. Registrar em `audit_logs` a ação `e2e_users_purged` com lista dos IDs removidos.

### 4. Documentação
- `CHANGELOG.md`: nova entrada documentando (a) remoção do card temporário Hermes Bot + função `setup-hermes-bot`, (b) purga dos usuários E2E.

### Verificação final
- Recarregar `/settings` e confirmar que o card amarelo sumiu.
- Recarregar aba "Usuários" e confirmar que `[E2E] Usuario de Teste` e `[E2E] Usuario Teste 2` desapareceram.
- `SELECT count(*) FROM auth.users WHERE email ILIKE 'e2e-test%'` deve retornar 0.

### Pergunta de confirmação
Confirma que devo **manter** o usuário `hermes@colmeiagsti.com.br` (bot real do relay UniFi) e apagar apenas o **card de setup** + os **dois usuários E2E**? Se quiser remover também o bot Hermes, me avise — isso quebra a integração UniFi.
