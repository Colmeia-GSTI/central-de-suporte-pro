# 🏗️ PROJECT_REFACTOR_PLAN — Plano Mestre de Refatoração

**Última atualização:** 2026-05-07 (após pausa pós-PR-D)
**Mantenedor:** Claude (atualizado a cada PR fechado)
**Escopo:** Projeto inteiro Colmeia HD Pro

> **Documento guarda-chuva.** Para detalhes:
> - **Histórico de mudanças** → `CHANGELOG.md` (raiz)
> - **Auditoria do módulo Billing** → `docs/BILLING_AUDIT.md`
> - **Documentos arquivados** → `docs/_archive/README.md`

---

## 1. Estado atual (snapshot 2026-05-07)

### 1.1 Métricas

| Métrica | Antes da sessão (manhã) | Agora | Δ |
|---|--:|--:|--:|
| Tamanho do repo | 11 MB | **~7 MB** | **-36%** |
| Arquivos `.ts/.tsx` | 436 | 419 | -17 |
| Linhas de código | 108.653 | ~104.275 | **-4.378** |
| Lock files | 4 (lixo) | **1 (Bun)** | -3 |
| Deps `package.json` | 99 | 89 | -10 |
| Boletos com erro em produção | 8 | 0–4 | -50%+ |
| Provedor de cobrança | Inter (broken) + Asaas (NFSe só) | **Asaas (tudo)** | unificado |
| Testes vitest | 18 | **59** | +41 |

### 1.2 Top 10 arquivos maiores (candidatos a refator futuro)

| Linhas | Arquivo | Plano |
|--:|---|---|
| 7200 | `src/integrations/supabase/types.ts` | gerado, intocável |
| 2150 | `supabase/functions/asaas-nfse/index.ts` | refatorar (PR-K) |
| 1201 | `src/components/contracts/ContractForm.tsx` | refatorar (PR-K) |
| 1173 | `src/components/billing/nfse/NfseDetailsSheet.tsx` | refatorar (PR-K) |
| 1134 | `src/components/billing/BillingInvoicesTab.tsx` | refatorar (PR-K) |
| 1129 | `supabase/functions/generate-monthly-invoices/index.ts` | OK (PR-C aplicado) |
| 1107 | `supabase/functions/unifi-sync/index.ts` | candidato consolidar com sync-* |
| 1059 | `src/pages/client-portal/ClientPortalPage.tsx` | quebrar (PR futuro) |
| 931 | `src/components/billing/BillingNfseTab.tsx` | consolidar c/ BillingBoletosTab (PR-K) |
| 880 | `supabase/functions/banco-inter/index.ts` | **DELETAR no PR-DECOM (~60d)** |

---

## 2. Sessão 2026-05-07 — o que foi feito

7 PRs em sequência, todos com TS 0 erros e 59/59 testes verdes:

| PR | Branch | Status |
|---|---|---|
| Hotfix PIX×Boleto | `hotfix/billing-pix-contamination` | ✅ MERGED |
| PR-A.5 (Migração Asaas) | `feat/billing-asaas-migration` | ✅ MERGED |
| PR-CLEAN (Lixo) | `chore/cleanup-dead-code` | ✅ MERGED |
| PR-CLEAN-2 (Bun + PWA) | `chore/cleanup-pwa-icons-and-lockfiles` | ✅ MERGED |
| PR-C (Frequência) | `feat/billing-frequency-pr-c` | ✅ MERGED |
| PR-D (Unificar reenvio) | `feat/billing-unify-actions-pr-d` | ⏳ aguardando merge |
| chore/docs-consolidation (este) | `chore/docs-consolidation` | ⏳ EM CURSO |

---

## 3. Lista CONSOLIDADA do que ainda falta

### 3.1 Aguardando ação do usuário (curto prazo)

| # | Ação | Onde |
|--:|---|---|
| 1 | Mesclar PR-D | https://github.com/Colmeia-GSTI/central-de-suporte-pro/pull/new/feat/billing-unify-actions-pr-d |
| 2 | Mesclar este PR de docs | (será publicado ao fim deste commit) |

### 3.2 PRs de Billing pendentes (ordem do BILLING_AUDIT)

| PR | Escopo curto | Tempo | Dependências |
|---|---|---|---|
| **PR-E** | Máquina de estado da fatura (FSM) — `derived state` consolidando `status × boleto_status × email_status × nfse_status`. Helpers `canResendInvoice`, `canRegenerateBoleto`, `canEmitNfse` em 1 lugar | 1-2 dias | nenhuma |
| **PR-F** | Régua de cobrança escalonada — tabela `billing_collection_steps` com `days_relative_due` (-5, -2, 0, +1, +5...). Cron `notify-due-invoices` lê e dispara conforme step | 2 dias | PR-E (FSM ajuda a decidir quando enviar) |
| **PR-G** | Dashboard de saúde + alerta proativo — `/billing/health` com taxa sucesso 7/30d, fila retry, latência. Cron `notify-billing-health-daily` envia email se houve falhas | 1 dia | nenhuma |
| **PR-I** | `payment_errors` estruturado — coluna `invoices.payment_errors jsonb` com histórico tipado de erros. Painel mostra cada erro com tipo + timestamp | 1 dia | nenhuma |
| **PR-J** | Testes E2E billing — 1 fluxo crítico por PR anterior, mocks de Asaas, suite roda no CI | 2 dias | PR-D, PR-E |
| **PR-K** | Quebrar componentes gigantes + consolidar tabs — `BillingBoletosTab` + `BillingNfseTab` → 1 componente parametrizado; quebrar `BillingInvoicesTab` (1134 LOC), `NfseDetailsSheet` (1173 LOC), `ContractForm` (1201 LOC) | 1-2 dias | melhor depois do PR-E |
| **PR-DECOM** | Deletar Banco Inter — arquivar edges `banco-inter` + `webhook-banco-inter`, deletar `BancoInterConfigForm` (769 LOC), remover secrets, encerrar conta. **-2.041 LOC** | 1h | aguardar 60-90 dias até último boleto Inter liquidar |

**Total billing pendente:** ~9-13 dias úteis + PR-DECOM em ~60-90 dias.

### 3.3 Backlog NÃO-billing (vindo de sessões anteriores)

#### 🔴 Monitoring (URGENTE — funcional mas inativo)
- **0 alertas lifetime** apesar de 8 dispositivos monitorados — cliente fica sem aviso quando infra quebra
- Investigar `send-alert-notification` edge (432 LOC) e fix do disparo

#### Section 4.5 — CMDB (próximo módulo grande após billing)
- Expandir tabelas `doc_*` (21 tabelas existem, faltam relações)
- Adicionar `client_branches` (filial/localização) — pré-requisito faltante
- Auto-collection de inventário via TRMM, UniFi, CheckMK
- Manual entry para clientes sem agente
- Inventário (assets, software licenses)

#### Banking (módulo a construir)
- BASE: bank accounts, expenses/accounts payable, cost centers
- CAMADA 2: OFX import, conciliação, DRE, MRR/ARR, aging, margin/cliente, forecast
- CAMADA 3 (deferida): IGPM/IPCA reajuste, overtime billing, commissions, integração contábil

#### Calendar
- Secretária cria appointments → sync para Google Calendar do técnico no mobile

#### Tickets
- Ticket creation deve permitir linkar device/computer (dropdown filtrado por cliente, hostname + last_user de TRMM) — habilita análise longitudinal de problemas por máquina

### 3.4 Limpezas técnicas pendentes (não urgentes)

- **Migrations duplicadas** detectadas: `20260205100000` + `20260205130319` adicionam mesmas colunas. Idempotente, baixa prioridade.
- **`handleReprocessNfse`, `handleRetryNfse`, `handleClearFailedNfse`** em `BillingErrorsPanel` ainda têm duplicação leve (PR-D.5 se virar problema).
- **`unifi-sync/index.ts` 1107 LOC** — candidato consolidar pattern com `tactical-rmm-sync` e `checkmk-sync`.
- **Quebrar `ClientPortalPage.tsx` 1059 LOC** em sub-seções.

---

## 4. Princípios mantidos

Os princípios do projeto continuam guiando todo PR:

1. **REUTILIZAR** componentes/hooks/utilitários antes de criar novos
2. **OTIMIZAR** o existente antes de propor nova implementação
3. **LIMPAR** código morto, imports não usados e lógica redundante ao tocar em arquivos
4. **ORGANIZAR** seguindo estrutura de pastas e padrões já adotados
5. **COMPACTAR** sem sacrificar legibilidade — sem verbosidade, sem duplicação
6. **NUNCA gerar código descartável** — cada linha entregue tem propósito e está pronta para produção
7. **Validação obrigatória**: TS 0 erros + vitest 59/59 antes de qualquer push
8. **Backup tático** em migrations destrutivas: snapshot table com nome `_NOME_PR_backup_DESCRIPTION` antes de UPDATE/DELETE
9. **Coexistência durante migrações** críticas: nunca quebrar caminhos legados sem decommission planejado
10. **PR review obrigatório** para mudanças em produção: nunca merge direto na main quando muda comportamento de runtime

---

## 5. Próximos passos sugeridos (após pausa)

Quando voltar, ordem recomendada:

1. **Mesclar PR-D + este PR de docs** (10 min)
2. **PR-E (FSM da fatura)** — desbloqueia PR-F e PR-J. ~1-2 dias.
3. **PR-G (Saúde + alertas)** — benefício imediato (você é avisado quando billing quebra). ~1 dia.
4. **Pause billing, vai para Monitoring** — fix urgente do "0 alertas lifetime". ~1 dia.
5. **PR-F + PR-I + PR-J** — fechar billing
6. **PR-DECOM** — quando todos boletos Inter de maio/2026 estiverem liquidados

Alternativa **se quiser priorizar produto sobre técnica**:
- Pula PR-E/F/G/I/J/K
- Vai direto para Monitoring (urgente)
- Depois CMDB Section 4.5 (módulo novo, alto valor)
- Banking depois

---

## 6. Saúde dos documentos

**Documentos atuais (mantidos):**

| Doc | Status | Tamanho |
|---|---|--:|
| `CHANGELOG.md` | ✅ atualizado pós-PR-D | ~245 LOC |
| `docs/BILLING_AUDIT.md` | ✅ PR-D marcado, PR-E em diante planejado | 624 LOC |
| `docs/PROJECT_REFACTOR_PLAN.md` (este) | ✅ consolidado nesta sessão | (este) |
| `docs/_archive/README.md` | ✅ criado para explicar arquivamento | (novo) |
| `README.md`, `AI_RULES.md` | OK — princípios estáveis | 73 + 51 |
| `SECURITY.md`, `BACKUP_PROCEDURE.md`, `ADMIN_TOOLS.md`, `DEPLOYMENT_PLAYBOOK.md`, `FEATURE_FLAGS.md`, `TESTING.md` | OK — operacionais | — |
| `PRODUCT_IDEAS.md` | OK — backlog de ideias | 43 LOC |

**Arquivados em `docs/_archive/` nesta sessão:**
- `SYSTEM_DOCUMENTATION_2026-02-13.md` (1590 LOC, 3 meses desatualizado)
- `RELATORIO_OTIMIZACAO_2026-02-27.md` (853 LOC, análise de outro agente)
- `IMPLEMENTATION_GUIDE_2026-02-05.md` (496 LOC, conhecimento absorvido)
- `REFACTORING_ROADMAP_2026-04-29.md` (410 LOC, substituído por este doc + BILLING_AUDIT)

**Total reduzido na raiz:** -3.349 LOC de docs antigos (movidos para arquivo, não deletados).

---

## 7. Comandos úteis para auditoria contínua

```bash
# Tamanho atual do repo
du -sh . --exclude=node_modules --exclude=.git

# Top 20 arquivos maiores
find src supabase/functions -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | sort -rn | head -20

# Detectar componentes não importados (NUNCA usar para *.test.*)
for f in $(find src/components -name "*.tsx" -not -path "*/ui/*"); do
  name=$(basename "$f" .tsx)
  count=$(grep -rln "${name}" src/ supabase/ 2>/dev/null | grep -v "$f" | wc -l)
  [ "$count" = "0" ] && echo "DEAD: $f"
done

# Validar antes de qualquer push
bunx tsc --noEmit && bunx vitest run

# Verificar gatilho do PR-DECOM (rodar no SQL Editor)
SELECT count(*) FROM invoices
WHERE billing_provider='banco_inter' AND status IN ('pending','overdue');
-- Se = 0: pode rodar PR-DECOM
```

---

**FIM DO DOCUMENTO** — atualizar a cada PR fechado, revisar a cada pausa longa.
