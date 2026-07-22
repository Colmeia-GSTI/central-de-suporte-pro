# Pendências — Central de Suporte Pro (Colmeia)

**Data:** 2026-07-21 · Consolidado da auditoria (Fase 1) + trabalho desta sessão.
Tags: `[cód]` corrige via Git · `[banco]` via Lovable MCP · `[cfg+deploy]` config.toml + deploy de edge · `[deploy]` precisa redeploy da edge.

---

## 🟩 RESOLUÇÃO (2026-07-22) — Tiers 1–6 trabalhados em paralelo com revisão adversarial

Cada tier foi atacado com workflows **implementador → revisor adversarial** por item (agentes independentes), DB via Lovable MCP com revisor dedicado, **guard tsc+vitest** por tier, e commit + deploy por tier. Fixes de banco registrados em [`docs/agents/_transversais.md §2.1`](../agents/_transversais.md).

- **Tier 1 (10) — ✅ todos resolvidos e no ar.** SLA inoperante (trigger horário-comercial + backfill), inventário licenças, `useDocSync`, unifi param, feature flag rollout=0, webhooks `verify_jwt` (5), hard-delete de cliente, XSS + injeção `.or()` na KB, escalonamento `invite-user`.
- **Tier 2 (7) — ✅ 6 resolvidos · 1 revertido.** RPC atômica de views (#13), race `renegotiate` (#12), role checks em edges (#16), anonimização `delete-user` (#17, bug real: FK SET NULL), clipboard de credenciais (#11), **RLS de segredos (#14)**. **Revertido:** idempotência `batch-process` (#15 — causava regressão e era redundante: `asaas-nfse` já reusa o pagamento). **#14 (2026-07-22):** SELECT de `integration_settings` restrito a admin/manager/financial + RPC `get_integration_active` para os reads técnicos (detalhe no item 14).
- **Tier 3 (13) — ✅ 12 resolvidos · 1 sem-edição (decisão correta).** badgeIcons, `technician_points`, portal financeiro/contato, contratos RLS×UI + consistência + idempotência FIXO, anomalias `warn`/casing, tipos AdditionalCharges, no-contact timestamp, inventário counters/tipos, export escaping. **+ bug real achado na revisão** (`markAsPaid` em `ContractInvoiceActionsMenu` passava só o id). **Sem-edição:** #27 baixa parcial (o "marcar pago rápido" é integral por design).
- **Tier 4 — quase completo.** ✅ Dashboard de certificado (`certificates`). ✅ **Wins menores (2026-07-22):** viewer de auditoria consolidado (removido `AuditLogsTab` legado; menu vai p/ `/settings/audit-logs`), realtime de monitoramento plugado (assina `monitored_devices`+`monitoring_alerts`, re-adicionadas à publicação via MCP, invalida devices/charts/alerts), VAPID via `VITE_VAPID_PUBLIC_KEY`. **Deferidos (projeto grande / risco > benefício → Onda 2):** split do monólito `asaas-nfse`, consolidação de toast (56 arquivos), dedup de gestão de ativos, dedup de multa/juros e geração de pagamento.
- **Tier 5 — parcial.** ✅ Removidos (cód): edge órfã `generate-invoice-payments`, leituras mortas `boleto_status==='processando'` (4 sites), métodos mortos do logger (`getLogs`/`invoiceProcessingLog`). ✅ **Drops de schema (2026-07-22, MCP):** `technician_badges`, RPC `calculate_penalties`, backups `_billing_hotfix_backup_pix_contamination`/`_billing_migration_backup_inter_to_asaas` — verificados sem FK/view/trigger/caller. **Mantidos (uso real / drop arriscado):** enum `billing_reminder` (drop de valor de enum), colunas Google Calendar (`sync_event` em uso), `not_helpful_count` (trigger de feedback o escreve — auditoria errou: era só não-exibido).
- **Tier 6 — ✅.** `IMPLEMENTATION_GUIDE.md` (S3 inexistente), `SECURITY.md` + `SYSTEM_DOCUMENTATION.md` (`useSecureAction`), `TESTING.md` (contagens/mocks).

**Aguardam sua decisão — Onda 2** (refactors grandes, risco > benefício): **consolidação de toast** (56 arquivos `@/hooks/use-toast` → Sonner, hoje há dois caminhos paralelos) e **split do monólito `asaas-nfse`** (~2867 linhas, edge de dinheiro; extração mecânica com revisor). Drops de schema restantes ficam **mantidos** por uso real / risco de drop (ver Tier 5).

---

---

## ✅ Já resolvido nesta sessão (para contexto)
- Código morto: 58 símbolos/blocos removidos (frontend/lib) + 4 arquivos órfãos.
- Edges limpas + deployadas: `asaas-nfse` (4 actions), `google-calendar` (callback/delete_event), `certificate-vault` (decrypt).
- Documentação: hierarquia `AGENTS.md` + `docs/agents/` (CLAUDE.md/MAPA viram ponteiros).
- **Segurança**: guards em 12 funções `SECURITY DEFINER` (relatórios financeiros/operacionais + `get_technician_ranking` + `get_ticket_form_data` etc.); `merge_clients` (reparent dos 39 filhos CASCADE — fim da perda de dados no merge); `apply-contract-adjustment` (auth; deployado).
- Bugs: aba "Rede" quebrada (removida); toast de cobrança em lote no DelinquencyReport.
- Verificados **já corrigidos** antes (achados stale): `batch-collection` payload (ff60498), `suppressed_emails` no send-email-resend (8cc1761).

---

## 🔴 Tier 1 — Bugs abertos, impacto alto (funcional/segurança)
1. **SLA inoperante** (tickets) — `tickets.sla_deadline` nunca é escrito → `notify-sla-breach` processa 0 chamados e a métrica de SLA do Dashboard fica sempre vazia/100%. `[banco: trigger p/ popular sla_deadline OU reescrever a edge com sla-calculator.ts]`
2. **Inventário → aba "Licenças" quebrada** (runtime) — `InventoryPage` seleciona colunas inexistentes na view `software_licenses_safe` (license_key/max_activations/current_activations/status) → erro PostgREST. Corretas: total_licenses/used_licenses/license_key_masked/… `[cód]`
3. **`useDocSync.invalidateAll` não casa queryKeys** — após sync TRMM/UniFi as tabelas de dispositivos/VLANs não re-renderizam sem refresh manual. `[cód]`
4. **`unifi-sync` param `controllerId` vs `controller_id`** — MonitoringPage envia `controllerId`, edge lê `controller_id` → cada chamada por-controller cai no "sincroniza todos" (N execuções redundantes, risco de corrida). `[cód+deploy]`
5. **`useFeatureFlag` rollout=0** — `Boolean(...) ? true : true` (ambos true) → whitelist `enabled_for_user_ids` ignorada (libera p/ todos). `[cód]`
6. **Webhooks de status sem `verify_jwt=false`** (resend/telegram/whatsapp) — herdam `verify_jwt=true` → provedores externos tomam 401 no gateway → status delivered/read/bounce e alimentação de `suppressed_emails` podem nunca ocorrer. `[cfg+deploy]`
7. **Hard-delete de cliente** em `ClientsPage` — sem checar blockers (contratos/faturas) e sem anonimização; contraria regra §7. Unificar no RPC `delete_client_safely`. `[cód]`
8. **XSS na Base de Conhecimento** — `MarkdownPreviewRenderer` (regex caseiro) injeta href/src sem sanitização (permite `javascript:`/`data:`). Trocar por react-markdown+rehype-sanitize/DOMPurify. `[cód]`
9. **Injeção em filtro `.or()`** (KnowledgePage/KBSuggestions) — termo de busca interpolado sem escapar vírgula/parêntese/%. `[cód]`
10. **Escalonamento de privilégio em `invite-user`** — manager/financial conseguem conceder role `admin`. Gate "só admin concede admin". `[cód]`

## 🟠 Tier 2 — Segurança / dados, impacto médio
11. **`doc_credentials` cifra** — senha/MFA em texto plano (nome `_encrypted` enganoso) + cópia crua p/ clipboard. Preventivo (tabela vazia hoje): encrypt-on-write + mascarar. `[cód+banco]`
12. **`renegotiate-invoice` race** — `MAX(invoice_number)+1` gera número duplicado sob concorrência. `[banco: sequence]`
13. **`increment_article_views` race** — RPC inexistente → fallback UPDATE não-atômico perde incrementos. Criar RPC atômica OU assumir o UPDATE. `[banco/cód]`
14. **RLS de segredos em `integration_settings`** — se SELECT for `is_staff`, um technician lê bot_token/api_key/client_secret/certificados no JSONB. Confirmar policy. `[banco: confirmar/ajustar]` — **✅ RESOLVIDO (2026-07-22):** confirmado que era `is_staff` (technician incluído). SELECT restrito a `admin OR manager OR financial` via `has_role`; reads técnicos (monitoramento/doc-sync) migrados para RPC SECDEF `get_integration_active` (só `is_active`, sem segredos) **antes** do ALTER. Edges usam service_role (bypassam RLS). Residual: writes seguem `is_staff` (integridade, não era o leak auditado). Ver `_transversais.md §2.1`.
15. **`batch-process-invoices` sem idempotência** — reprocessar pode duplicar cobrança no Asaas (não checa `asaas_payment_id`). `[cód]`
16. **Edges sem checagem de role** — `batch-collection-notification`, `notify-due-invoices`, `generate-invoice-payments` não re-validam papel. `[cód]`
17. **`delete-user` hard-delete** vs regra de anonimização; FKs por user_id podem ficar órfãs. `[cód/banco]`

## 🟡 Tier 3 — Correções funcionais menores
18. **`badgeIcons` mapa quebrado** (gamification) — chaves (slugs de nome) não casam com `badge.icon` do seed → todos caem no fallback `<Star>`. `[cód]`
19. **`TicketRatingDialog` insere em `technician_points` sem checar erro** — falha de premiação passa silenciosa. `[cód]`
20. **`ClientPortalFinancialTab` visual errado** — faturas `renegotiated`/`lost` caem no fallback "pendente". `[cód]`
21. **Portal: `client_contacts.maybeSingle()`** — usuário com >1 contato lança PGRST116 (a RPC resolve com ORDER BY). `[cód]`
22. **Contratos: RLS × UI** — botões Aplicar/Renegociar sem `PermissionGate` → staff comum vê e toma erro de RLS. `[cód]`
23. **Contratos: reajuste duplicado** (edge vs client-side) — fonte dupla; a edge não grava `applied_by`/`adjustment_percentage`. Unificar. `[cód]`
24. **Contratos: FIXO D-0 sem idempotência** + timezone off-by-one nos buckets D-30/D-7/D-0. `[cód]`
25. **`AdditionalChargesReportTab` tipos não declarados** — passa só por não haver `tsc` no build. `[cód]`
26. **detect-auth-anomalies `level='warning'` vs `'warn'`** + casing `module='auth'` vs `'Auth'` → logs mal exibidos e filtro não casa. `[cód]`
27. **`markAsPaidMutation` assume pagamento integral** — risco de baixa incorreta em pagamento parcial via "Marcar como Pago (rápido)". `[cód]`
28. **`check-no-contact-tickets` usa `updated_at`** — qualquer edição reseta o relógio de 24h/48h. `[cód]`
29. **Inventário: forms não invalidam `inventory-counters`** (cards defasados); AssetForm não oferece tipos software/license. `[cód]`
30. **Export CSV/Excel sem escaping** (TSV cru, formula injection `=+-@`). `[cód]`

## ⚪ Tier 4 — Duplicações / dívida técnica (baixo)
- Multa/juros duplicada em 3 lugares + geração de pagamento em 3-4 lugares (billing) → extrair p/ `src/lib`.
- Dois sistemas de toast (shadcn `use-toast` + Sonner) montados juntos → consolidar em Sonner.
- `formatPhone` duplicado (utils.ts vs phone.ts vs inline em CompanyTab/RequesterContactCard).
- Certificado com fonte dupla: `CertificateManager`→`certificates` vs `CertificateDashboardPage`→`company_settings.certificado_*` (dashboard sempre "Não Configurado").
- `asaas-nfse` monólito (3010 linhas, NFS-e + cobrança) → split.
- Dois viewers de auditoria (`AuditLogsTab` legado vs `AuditLogsList`) → consolidar.
- Gestão de ativos duplicada (`AssetForm` vs `ClientAssetsList`); `BusinessHoursForm` em 2 abas.
- VAPID pública hardcoded em 2 arquivos; `corsHeaders` duplicado no `_shared`.
- Convenção `logic.ts` (§6.6) quase não aplicada nas edges; componentes grandes (ClientForm, logger 469 linhas, DocSectionSecurity…).
- Realtime prometido mas não plugado em `/monitoring`; sync UniFi 'direct' duplicado (edge vs relay).

## 🔵 Tier 5 — Itens "revisar-com-usuário" (decisões de schema/banco)
- `generate-invoice-payments` (edge órfã — confirmar se algum `pg_cron` a chama antes de remover).
- Leituras mortas `boleto_status === 'processando'` (4 sites) — enum não tem o valor.
- Órfãos de schema em `types.ts`/migrations: enum `billing_reminder`, colunas `calendar_events.invoice_id`, `google_event_id`/`sync_enabled`/`last_sync_at`, tabela `technician_badges`, `badges.description` (over-select), `not_helpful_count`.
- `calculate_penalties` (RPC órfã — confirmar uso interno em SQL); `Logger.invoiceProcessingLog`/`getLogs` (métodos mortos); 5 skeletons mortos em `loading-skeleton.tsx`.
- Backups residuais no schema (`_billing_hotfix_backup_*`, `_billing_migration_backup_*`); funções SECURITY DEFINER sem `SET search_path` (várias — checar quais ainda faltam).
- `action 'delete_record'` (asaas-nfse) e `'sync_event'` (google-calendar) — mortas por design; decidir.

## 📄 Tier 6 — Documentação stale
- `IMPLEMENTATION_GUIDE.md` documenta feature S3 (`s3-storage.ts`, `test-s3-connection`) **inexistente** → arquivar/corrigir (ainda indexado no AGENTS.md).
- `README.md` boilerplate Lovable; `SYSTEM_DOCUMENTATION`/`DEPLOYMENT_PLAYBOOK`/`SECURITY`/`TESTING` com refs stale.
- Sobreposição billing/NFS-e/crons em 4 docs (já mitigada com AGENTS.md como índice); CHANGELOG com entradas sem data.

## Riscos transversais (ver `docs/agents/_transversais.md §7`)
- `pg_cron` não versionado em migrations (confirmado ativo no banco via snapshot); `config.toml` incompleto (várias edges herdam `verify_jwt=true` — ver Tier 1.6, tickets, monitoring, nfse webhook, mcp).
