# Roadmap de Refatoração

Documento mestre do processo de refatoração do colmeiahdpro. Cada seção é executada **uma de cada vez**, item por item, sem antecipar detalhes que ainda não foram acordados.

---

## Princípios globais

Estes princípios guiam toda decisão dentro deste roadmap. Em caso de conflito, o princípio listado primeiro prevalece.

1. **Raiz > Sintoma** — sempre tratar a causa raiz antes do sintoma; band-aids só com justificativa explícita.
2. **Ferramenta antes de ação** — antes de qualquer mudança, garantir que existe instrumento para auditar, medir e reverter.
3. **Prevenção** — preferir mudanças que evitem reincidência do problema (constraints, triggers, validações) a correções pontuais.
4. **Auditoria** — toda alteração relevante precisa deixar rastro (CHANGELOG, audit_logs, logs de função).
5. **Lente SaaS-ready** — avaliar cada mudança pensando em multi-tenant futuro, mas sem implementar agora o que está no Backlog Fase 2.
6. **Rollback possível** — nenhuma mudança entra sem caminho claro de reversão (backup + script reverso ou migration de rollback).
7. **Uma seção por vez** — não pular nem paralelizar seções; concluir, validar e marcar antes de iniciar a próxima.

---

## Já concluído (sessões anteriores)

Itens executados antes da formalização deste roadmap, mantidos aqui para rastreabilidade.

- ✅ Rastreabilidade de e-mails de cobrança (envio, abertura, falha)
- ✅ Edge Function `resend-confirmation` criada e deployada (rate-limit 3/h)
- ✅ Helpers de e-mail consolidados em `supabase/functions/_shared/email-helpers.ts`
- ✅ Painel `InvoiceNotificationHistory` para auditoria de envios
- ✅ Limpeza de 2 usuários órfãos em `auth.users`

---

## Seções do roadmap

### Seção 0 — Fundação

- **Objetivo:** Estabelecer instrumentos básicos (backup, changelog, roadmap) antes de qualquer mudança de código.
- **Status:** 🟡 em andamento
- **Início:** 2026-04-24
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 1 — Correções críticas com ferramentas admin

- **Objetivo:** Corrigir bugs críticos que já têm ferramenta administrativa disponível para validação e rollback.
- **Status:** ◐ em andamento
- **Início:** 2026-04-25
- **Conclusão:** —

#### Itens

- ✅ **1.1 — `/billing/delinquency` quebrada** (concluído 2026-04-25)
  - Causa raiz: embed `clients(...)` do supabase-js retornado como ARRAY em runtime, código acessava como objeto → `TypeError`.
  - Fix: `unwrapEmbed` (`src/lib/supabase-helpers.ts`) + tipagem `ClientRow` + guard descartando faturas órfãs.
  - Ferramenta: `PageErrorBoundary` (`src/components/common/PageErrorBoundary.tsx`) loga crashes em `application_logs` e oferece UI de retry/voltar.
  - Prevenção: 3 testes de regressão (`delinquency-page.test.tsx`) cobrindo embed array/objeto/null.
  - Movido `src/pages/financial/DelinquencyReportPage.tsx → src/pages/billing/`. Pasta `financial/` removida.

- ✅ **1.2 — Cliente duplicado AIRDUTO LTDA + VIZU EDITORA** (concluído 2026-04-25)
  - Causa raiz: ausência de `UNIQUE` constraint / validação no campo `clients.document` permitiu cadastros repetidos do mesmo CNPJ (AIRDUTO em fev e abr/26; VIZU em fev e abr/26).
  - Ferramentas criadas (1.2b): coluna gerada `clients.normalized_document`, RPCs admin-only `detect_duplicate_clients()` / `merge_clients()` / `delete_client_safely()`, UI completa (`DuplicatesBanner`, `MergeClientsDialog` com wizard 3-steps híbrido B+A, `DeleteClientButton` com pré-check), pré-check de CNPJ no `ClientForm`, lib pura `client-merge.ts` com 9 testes.
  - Aplicação (1.2c): AIRDUTO consolidado em `60ba285e...` (1 contrato/1 ticket/2 contatos preservados); VIZU consolidado em `c9bab9b7...` (2 contratos ativos + 1 contato migrado). 32 clientes restantes (era 34). Auditoria registrada em `audit_logs` (action=`MERGE`) e `client_history` (action=`merged`).
  - Prevenção ativa: índice único parcial `uq_clients_normalized_document` (`WHERE normalized_document <> ''`) impede recorrência. `ClientForm` trata erro Postgres `23505` com toast amigável.

- ✅ **1.3 — Gestão de usuários e detecção de órfãos** (concluído 2026-04-25)
  - Causa raiz: `handle_new_user` falhava silenciosamente (`RAISE WARNING` sem persistência) gerando órfãos passados; 5 edge functions de gestão (`create-user`, `create-client-user`, `delete-user`, `update-user-email`, `confirm-user-email`) operavam com permissões divergentes, sem rate-limit e sem audit padronizado; admin não tinha página dedicada para gerenciar usuários.
  - Ferramentas criadas (1.3b): página `/settings/users` admin-only com 6 componentes modulares + hook `useUsers` SaaS-ready (`tenantId` opcional); helper compartilhado `_shared/auth-helpers.ts` (`requireRole`, `rateLimit`, `logAudit`, `jsonResponse`); edge function `detect-auth-anomalies` com cron diário 08:00 BRT + banner de invocação manual; trigger `audit_user_roles_trigger` em `user_roles`; refactor das 5 edge functions com permissões alinhadas + rate-limit 5/min + audit; `handle_new_user` agora persiste sucesso/falha em `application_logs`.
  - Prevenção ativa: telemetria contínua via `application_logs` + cron de anomalias; RLS append-only em `audit_logs` (UPDATE/DELETE bloqueados); rate-limit em todas as edges sensíveis.
  - Antecipação: trigger de audit em `user_roles` foi antecipado de 1.4. Outras tabelas sensíveis (`invoices`, `contracts`, `clients`, `bank_accounts`, `integration_settings`) ficam para 1.4 com função genérica reaproveitável.

### Seção 2 — Monitoramento e sync de devices

- **Objetivo:** Estabilizar a sincronização de dispositivos monitorados (UniFi, Tactical RMM, CheckMK) e o pipeline de alertas.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 3 — Navegação e organização

- **Objetivo:** Revisar estrutura de rotas, sidebar, breadcrumbs e padrões de navegação para reduzir fricção.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 4 — Decisão sobre features abandonadas

- **Objetivo:** Decidir manter, completar ou remover módulos parciais (ex.: doc_*, inventário com tabelas vazias).
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 5 — Limpeza de código morto

- **Objetivo:** Remover componentes órfãos, edge functions sem uso, dependências não utilizadas e tabelas legadas.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 6 — Consolidação de código duplicado

- **Objetivo:** Eliminar duplicações (formatadores, validação HMAC, helpers de UI) movendo-as para `_shared/` ou `src/lib/`.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 7 — Hardening operacional

- **Objetivo:** Reforçar observabilidade, alertas, índices, performance e processos operacionais para produção estável.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

---

## Backlog Fase 2 (SaaS) — não fazemos agora

Itens reservados para uma futura fase de evolução do produto. Não entram no escopo deste roadmap.

- Multi-tenancy real (tabela `tenants`, isolamento via RLS)
- Branding customizável por tenant (logo, cores, domínio)
- Onboarding self-service de MSPs
- Integrações por tenant (cada MSP com suas próprias credenciais TRMM/UniFi/CheckMK)
- Faturamento do SaaS (cobrar MSPs clientes)
- Features potencialmente úteis vistas no BomControle (a avaliar depois): fluxo de caixa gráfico, conciliação bancária, régua de cobrança melhorada, dashboard unificado multi-cliente, notificações in-app em tempo real (UI)

---

## Descartados — não fazem sentido para este produto

Decisões já tomadas. Não retomar sem justificativa nova e explícita.

- ❌ **Multi-empresa clássico** (vai ser multi-tenant na Fase 2)
- ❌ **Aprovação financeira** (dono decide sozinho)
- ❌ **CRM completo** (34 clientes, planilha resolve)
- ❌ **Estoque, Vendas, NF-e produto** (MSP não tem estoque)
- ❌ **BPM/modelagem de processos** (escala grande demais)
- ❌ **Comissões de vendedores** (não aplicável)
