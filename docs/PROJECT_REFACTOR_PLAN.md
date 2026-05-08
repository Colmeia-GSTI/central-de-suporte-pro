# 🏗️ PROJECT_REFACTOR_PLAN — Plano Mestre de Refatoração

**Última atualização:** 2026-05-08 (pós PRs E + UX-Combobox + PROTECTION + auditoria profunda do financeiro)
**Mantenedor:** Claude (atualizado a cada PR fechado)
**Escopo:** Projeto inteiro Colmeia HD Pro

> **Documento guarda-chuva.** Para detalhes:
> - **Auditoria profunda do financeiro** → `docs/FINANCIAL_DEEP_AUDIT.md` ⭐ FONTE PRIMÁRIA do plano abaixo
> - **Auditoria do módulo Billing** (PRs A-K) → `docs/BILLING_AUDIT.md`
> - **Histórico de mudanças** → `CHANGELOG.md` (raiz)
> - **Documentos arquivados** → `docs/_archive/README.md`

---

## 1. Snapshot atual (2026-05-08)

### 1.1 Métricas

| Métrica | Antes da série de PRs | Agora | Δ |
|---|--:|--:|--:|
| Tamanho do repo | 11 MB | **~7 MB** | **-36%** |
| Linhas de código | 108.653 | ~104.275 | **-4.378** |
| Lock files | 4 (lixo) | **1 (Bun)** | -3 |
| Deps `package.json` | 99 | 89 | -10 |
| Provedor de cobrança | Inter (broken) + Asaas | **Asaas único** | unificado |
| Testes vitest | 18 | **100** | **+82** |
| Boletos com erro em produção | 8 | 0–4 | -50%+ |
| Helpers reusáveis (lib/) | 12 | **15** | +3 (FSM, edgeFunctionError, ClientSearchCombobox) |

### 1.2 PRs mesclados na sessão atual

7 PRs entregues, todos com TS 0 erros + vitest 100/100:

| PR | Branch | Status |
|---|---|---|
| Hotfix PIX×Boleto | `hotfix/billing-pix-contamination` | ✅ MERGED |
| PR-A.5 (Migração Asaas) | `feat/billing-asaas-migration` | ✅ MERGED |
| PR-CLEAN (Lixo) | `chore/cleanup-dead-code` | ✅ MERGED |
| PR-CLEAN-2 (Bun + PWA) | `chore/cleanup-pwa-icons-and-lockfiles` | ✅ MERGED |
| PR-C (Frequência) | `feat/billing-frequency-pr-c` | ✅ MERGED |
| PR-D (Unificar reenvio) | `feat/billing-unify-actions-pr-d` | ✅ MERGED |
| PR-FIX (manual-payment error msg) | `fix/manual-payment-error-message` | ✅ MERGED |
| PR-FIX-2 (clients sem cobrança + bug NfseAvulsa) | `feat/clients-without-billing-warning` | ✅ MERGED |
| **PR-E** (FSM da fatura + 41 testes) | `feat/billing-fsm-pr-e` | ✅ MERGED |
| **PR-UX-Combobox** (busca em dropdown cliente) | `feat/searchable-client-dropdown` | ✅ MERGED |
| **PR-PROTECTION** (contratos vencidos) | `feat/contracts-end-date-protection` | ✅ MERGED |
| **chore/financial-deep-audit** (este) | `chore/financial-deep-audit` | ⏳ EM CURSO |

---

## 2. Próximos passos — 5 FASES (vindas do FINANCIAL_DEEP_AUDIT)

A auditoria profunda do módulo financeiro identificou que o caminho ótimo é **5 fases incrementais**, cada uma independente e com risco controlado. Detalhes completos em `docs/FINANCIAL_DEEP_AUDIT.md` seção 5.

### 🟡 Fase 1 — Helpers + Status Unificado (1-2 dias) — **risco ZERO**

Resolve dor: status visual inconsistente (4 mapeamentos espalhados), `format(new Date(...))` 19x sem helper.

**Entregáveis:**
- `src/lib/date.ts` com `formatDate(value, variant)` + `formatRelative()`
- `<InvoiceStatusBadge>` + `<BoletoStatusBadge>` + `<NfseStatusBadge>` reutilizando `getDerivedStateDisplay` da FSM
- Substituir 4 mapeamentos espalhados pelos novos componentes
- Migrar 19 ocorrências de date format

**Critério de pronto:** Mesma fatura mostra mesmo badge em qualquer tela. TS 0 erros + vitest verde.

---

### 🟡 Fase 2 — Hooks centralizados (2-3 dias) — **risco BAIXO**

Resolve dor: 9 lugares fazem `from("invoices")` direto. Race conditions, cache desincronizado.

**Entregáveis:**
- `useInvoices(filters)` + `useInvoice(id)`
- `useContracts(filters)` + `useContract(id)`
- `useNfse(invoiceId)`
- `useBillingMutations()` consolidando markAsPaid, cancel, regenerate
- Migrar 9 ocorrências de query direta para hooks
- Cache compartilhado (mesma invoice em 2 telas = 1 fetch)

**Critério de pronto:** Após qualquer mutation, TODAS as telas atualizam.

---

### 🟢 Fase 3 — Consolidação de Tabs (3-4 dias) — **MAIOR ganho de UX**

Resolve dor: BillingPage tem 11 abas, "Faturas"/"Boletos"/"A Receber" sobrepõem (3.000 LOC duplicadas).

**Entregáveis:**
- `<InvoiceListTable>` parametrizada (substitui Faturas + Boletos)
- `<InvoiceFiltersBar>` reutilizada
- Tab unificada **"Cobranças"** (Faturas + Boletos + A Receber → 1 tab + filtros)
- Tab "Erros" vira chip de filtro
- BillingPage: **11 → ~7 abas**
- Saldo estimado: **-2.000 LOC líquidas**

**Critério de pronto:** Operador encontra qualquer fatura em <5s. Mesma ação aparece com mesmo nome em qualquer estado.

---

### 🟢 Fase 4 — Régua de Cobrança + Dashboard Saúde (3-4 dias) — **risco BAIXO**

Resolve gaps G4, G8, G11, G13 do BILLING_AUDIT. Funcionalidades novas, não tocam fluxo crítico.

**Entregáveis:**
- Tabela `billing_collection_steps` (PR-F do BILLING_AUDIT)
- Cron `notify-due-invoices` lê tabela em vez de hardcoded
- Tab "Saúde" funcional (taxa sucesso 7/30d, fila retry, latência)
- Cron `notify-billing-health-daily` envia email se falhas
- Coluna `payment_errors jsonb` (PR-I) — histórico tipado de erros

**Critério de pronto:** Admin altera régua sem mexer em código. Email automático quando billing quebra.

---

### 🔵 Fase 5 — Schema Sane (5-7 dias) — **risco ALTO** — fazer por último

Resolve dor estrutural: `invoices` tem 48 colunas (tabela-deus). Quebrar em agregado normalizado.

**Entregáveis (3 PRs sequenciais com dual-write):**
- **PR-S1**: Criar `payments`, `payment_attempts`, `notifications_sent` + dual-write
- **PR-S2**: Migrar leitura para tabelas novas (UI mantém compatibilidade)
- **PR-S3**: Drop colunas redundantes de `invoices` (16 colunas finais)

**Critério de pronto:** invoices ≤20 colunas. Nenhuma regressão. +20 testes novos.

**Pré-requisito:** Fases 1-4 concluídas + testes E2E (PR-J) cobrindo fluxos críticos.

---

## 3. Backlog NÃO-financeiro (paralelo às fases)

### 🔴 URGENTE
- **Monitoring fix**: 0 alertas lifetime apesar de 8 dispositivos monitorados — cliente fica sem aviso quando infra quebra. Investigar `send-alert-notification` edge (432 LOC). **~1 dia, pode ir em paralelo a qualquer fase.**

### Backlog médio prazo
- **Section 4.5 — CMDB**: expandir `doc_*` (21 tabelas), adicionar `client_branches`, auto-collection TRMM/UniFi/CheckMK
- **Banking BASE + CAMADA 2**: contas, contas a pagar, OFX, conciliação, DRE, MRR/ARR
- **Calendar**: secretária → Google Calendar do técnico mobile
- **Tickets**: linkar device/computer no ticket (dropdown filtrado por cliente)

### Decommission planejado (~60-90 dias)
- **PR-DECOM**: Deletar Banco Inter quando todos boletos legados liquidarem (`SELECT count(*) FROM invoices WHERE billing_provider='banco_inter' AND status IN ('pending','overdue')` = 0)

---

## 4. Métricas-alvo após Fase 5

| Métrica | Hoje | Meta |
|---|--:|--:|
| LOC totais | ~104.000 | ~95.000 |
| Tabelas com >40 colunas | 1 (invoices) | 0 |
| Tabs no BillingPage | 11 | 6-7 |
| `from("invoices")` espalhado | 9 | 0 (só hooks) |
| Mapeamentos de status duplicados | 4 | 0 |
| Componentes >800 LOC | 8 | ≤4 |
| Testes vitest | 100 | 130+ |
| Bugs de inconsistência UI | ~5 | 0 |

---

## 5. Princípios não negociáveis

1. **REUTILIZAR** componentes/hooks/utilitários antes de criar novos. Extrair só quando substitui ≥2 cópias.
2. **OTIMIZAR** o existente antes de propor nova implementação
3. **LIMPAR** código morto, imports não usados e lógica redundante ao tocar em arquivos
4. **ORGANIZAR** seguindo estrutura de pastas e padrões já adotados
5. **COMPACTAR** sem sacrificar legibilidade — sem verbosidade, sem duplicação
6. **NUNCA gerar código descartável** — cada linha entregue tem propósito e está pronta para produção
7. **Validação obrigatória**: TS 0 erros + vitest 100% antes de qualquer push
8. **Backup tático** em migrations destrutivas: snapshot `_FASE_X_backup_DESCRIPTION` antes de UPDATE/DELETE
9. **Coexistência durante migrações** críticas: nunca quebrar caminhos legados sem decommission planejado
10. **PR review obrigatório** para mudanças em produção: nunca merge direto na main quando muda comportamento de runtime

---

## 6. Saúde dos documentos

| Doc | Status | Quando usar |
|---|---|---|
| `docs/FINANCIAL_DEEP_AUDIT.md` ⭐ | ✅ Criado nesta sessão (501 LOC) | Detalhe das 5 fases, problemas, comparação de mercado |
| `docs/BILLING_AUDIT.md` | ✅ Atualizado pós PR-E | PRs A-K específicos do billing |
| `docs/PROJECT_REFACTOR_PLAN.md` (este) | ✅ Reescrito enxuto | Visão geral + ações imediatas |
| `CHANGELOG.md` | ✅ Atualizado a cada PR | Histórico cronológico |
| `docs/_archive/README.md` | ✅ Política de arquivamento | Trilha de auditoria de docs antigos |
| `README.md`, `AI_RULES.md` | OK — princípios estáveis | Sem alterações |
| `SECURITY.md`, `BACKUP_PROCEDURE.md`, `ADMIN_TOOLS.md`, `DEPLOYMENT_PLAYBOOK.md`, `FEATURE_FLAGS.md`, `TESTING.md` | OK — operacionais | Sem alterações |
| `PRODUCT_IDEAS.md` | OK — backlog de ideias | Sem alterações |

---

## 7. Próxima ação concreta recomendada

1. **Mesclar este PR** (`chore/financial-deep-audit`) — 5 min
2. **Começar Fase 1** (helpers + badges unificados) — risco zero, ganho imediato, estabelece padrão para Fases 2-3 reusarem
3. **Em paralelo (se tiver tempo)**: Monitoring fix (0 alertas) — ortogonal ao financeiro

Alternativa **se quiser priorizar produto sobre técnica**:
- Pula Fases 1-5
- Vai direto para Monitoring (urgente)
- Depois CMDB Section 4.5 (módulo novo, alto valor)
- Banking depois

---

## 8. Comandos úteis

```bash
# Tamanho atual
du -sh . --exclude=node_modules --exclude=.git

# Top 20 arquivos maiores
find src supabase/functions -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | sort -rn | head -20

# Validar antes de qualquer push
bunx tsc --noEmit && bunx vitest run

# Verificar gatilho do PR-DECOM (rodar no SQL Editor)
SELECT count(*) FROM invoices
WHERE billing_provider='banco_inter' AND status IN ('pending','overdue');
-- Se = 0: pode rodar PR-DECOM
```

---

**FIM DO DOCUMENTO** — atualizar a cada PR fechado, revisar a cada pausa longa.
