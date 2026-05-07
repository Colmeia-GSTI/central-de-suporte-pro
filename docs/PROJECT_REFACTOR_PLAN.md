# 🏗️ PROJECT_REFACTOR_PLAN — Plano Mestre de Refatoração

**Data inicial:** 2026-05-07
**Autor:** Claude (auditoria automática a partir do código real em `main`)
**Escopo:** Projeto inteiro Colmeia HD Pro (frontend, edges, schema, deps)
**Status:** documento vivo — atualizar a cada PR fechado

> **Documento guarda-chuva.** Para detalhes módulo a módulo:
> - Billing → `docs/BILLING_AUDIT.md`
> - (futuro) Tickets → `docs/TICKETS_AUDIT.md`
> - (futuro) CMDB → `docs/CMDB_AUDIT.md`

---

## 1. Visão geral do projeto

### 1.1 Métricas brutas (2026-05-07 antes do PR-CLEAN)

| Métrica | Valor |
|---|--:|
| Repo total (sem `node_modules`/`.git`) | 11 MB |
| Arquivos `.ts/.tsx` | 436 |
| Linhas de código | 108.653 |
| Edge functions | 53 |
| Migrations | 146 |
| Pages | 32 |
| Componentes shadcn/ui | 56 instalados |
| Dependências `package.json` | 99 |

### 1.2 Pastas top-level por tamanho

```
3.0M  src/components
1.1M  supabase/functions
772K  supabase/migrations
496K  src/pages
232K  src/integrations  (← types.ts gerado, 7200 linhas, intocável)
204K  src/hooks
100K  src/lib
80K   src/test
```

### 1.3 Top 15 arquivos maiores

| Linhas | Arquivo | Categoria |
|--:|---|---|
| 7200 | `src/integrations/supabase/types.ts` | gerado, intocável |
| 2150 | `supabase/functions/asaas-nfse/index.ts` | refatorar (PR-K do BILLING_AUDIT) |
| 1201 | `src/components/contracts/ContractForm.tsx` | refatorar (PR-K) |
| 1173 | `src/components/billing/nfse/NfseDetailsSheet.tsx` | refatorar (PR-K) |
| 1134 | `src/components/billing/BillingInvoicesTab.tsx` | refatorar (PR-D/E) |
| 1129 | `supabase/functions/generate-monthly-invoices/index.ts` | refatorar (PR-C) |
| 1107 | `supabase/functions/unifi-sync/index.ts` | candidato consolidar com sync-* |
| 1059 | `src/pages/client-portal/ClientPortalPage.tsx` | quebrar em sub-componentes |
| 931 | `src/components/billing/BillingNfseTab.tsx` | consolidar com BillingBoletosTab |
| 912 | `src/components/settings/ClientMappingsTab.tsx` | revisar |
| 908 | `src/components/clients/ClientAssetsList.tsx` | revisar |
| 880 | `supabase/functions/banco-inter/index.ts` | DELETAR no PR-DECOM (~60d) |
| 877 | `src/components/billing/BillingErrorsPanel.tsx` | refatorar (PR-D) |
| 875 | `src/pages/tickets/TicketsPage.tsx` | quebrar |
| 864 | `src/components/billing/BillingBoletosTab.tsx` | consolidar com BillingNfseTab |

---

## 2. Plano de Refatoração

### 2.1 Estratégia geral

O projeto evoluiu por acumulação de features. Há **5 fontes de inchaço**:

1. **Componentes shadcn/ui não usados** (instalados via CLI mas nunca importados) → fácil remover
2. **Componentes mortos** (substituídos por versões novas, mas o arquivo antigo nunca foi deletado) → fácil remover
3. **Dependências órfãs** (npm packages cujo único uso era os shadcn da categoria 1) → remover junto
4. **Edges/componentes Inter** (saindo do uso após migração para Asaas) → remover no PR-DECOM
5. **Componentes gigantes** (>800 linhas com responsabilidades múltiplas) → refator estrutural por módulo

### 2.2 Sequência de PRs (atualizada 2026-05-07)

| PR | Escopo | Status |
|---|---|:--:|
| PR-A.5 | Migração Inter → Asaas | ✅ MERGED |
| **PR-CLEAN** | **Limpeza de lixo (este PR)** | ⏳ EM CURSO |
| PR-C | Cobrança bimestral/trimestral via Asaas Subscriptions | ⏳ próximo |
| PR-D | Unificar fluxo de reenvio (4 lugares → 1) | planejado |
| PR-E | Máquina de estado (FSM) da fatura | planejado |
| PR-F | Régua de cobrança escalonada | planejado |
| PR-G | Dashboard de saúde + alerta proativo | planejado |
| PR-I | `payment_errors` estruturado | planejado |
| PR-J | Testes E2E billing | planejado |
| PR-K | Quebrar componentes gigantes + consolidar tabs | planejado |
| PR-DECOM | Deletar Banco Inter (~60-90 dias) | aguarda liquidar boletos legados |

---

## 3. PR-CLEAN — Detalhe (este PR)

### 3.1 Objetivo

Reduzir código morto sem alterar funcionalidade. Pré-requisito para todas as refatorações futuras: começar de uma base limpa.

### 3.2 Mudanças aplicadas

**Categoria 1 — Componentes shadcn/ui não usados (12 arquivos, ~1.108 linhas)**

```
src/components/ui/carousel.tsx        (224)
src/components/ui/menubar.tsx         (207)
src/components/ui/context-menu.tsx    (178)
src/components/ui/navigation-menu.tsx (120)
src/components/ui/breadcrumb.tsx      ( 90)
src/components/ui/drawer.tsx          ( 87)
src/components/ui/input-otp.tsx       ( 61)
src/components/ui/toggle-group.tsx    ( 49)
src/components/ui/resizable.tsx       ( 37)
src/components/ui/hover-card.tsx      ( 27)
src/components/ui/slider.tsx          ( 23)
src/components/ui/aspect-ratio.tsx    (  5)
```

> `chart.tsx` (303 linhas) **NÃO foi deletado** — usado por `MessageMetricsDashboard` e `IntegrationHealthDashboard`.

**Categoria 2 — Componentes mortos (5 arquivos, ~1.332 linhas)**

```
src/components/clients/ClientContactsList.tsx       (367) — substituído
src/components/settings/CertificateUpload.tsx       (343) — substituído por CertificateManager
src/components/billing/BillingBatchProcessing.tsx   (339) — sem rota, sem import
src/components/inventory/DeviceExpandableRow.tsx    (207) — sem import
src/components/calendar/InvoiceDueBadge.tsx         ( 76) — sem import
```

> ⚠️ **NOTA TÉCNICA:** `src/components/auth/ProtectedRoute.test.tsx` (270 linhas) inicialmente identificado como "dead" pelo critério "sem import", mas RESTAURADO porque arquivos `*.test.*` são descobertos pelo vitest por padrão de naming, não por import. Regra para auditorias futuras: **nunca aplicar critério `sem-import` a `*.test.*` ou `*.spec.*`**.

**Categoria 3 — Dependências órfãs no `package.json` (10 deps)**

```
@radix-ui/react-aspect-ratio       (usado só pelo aspect-ratio.tsx)
@radix-ui/react-context-menu       (usado só pelo context-menu.tsx)
@radix-ui/react-hover-card         (usado só pelo hover-card.tsx)
@radix-ui/react-menubar            (usado só pelo menubar.tsx)
@radix-ui/react-navigation-menu    (usado só pelo navigation-menu.tsx)
@radix-ui/react-slider             (usado só pelo slider.tsx)
embla-carousel-react               (usado só pelo carousel.tsx)
input-otp                          (usado só pelo input-otp.tsx)
react-resizable-panels             (usado só pelo resizable.tsx)
vaul                               (usado só pelo drawer.tsx)
```

`package.json` cai de 99 para 89 dependências.

### 3.3 Saldo

| Métrica | Antes | Depois | Δ |
|---|--:|--:|--:|
| Linhas de código | 108.653 | ~106.213 | **-2.440 (-2,2%)** |
| Arquivos `.tsx/.ts` | 436 | 419 | -17 |
| Dependências `package.json` | 99 | 89 | -10 |

### 3.4 Validação

- ✅ `tsc --noEmit` — 0 erros
- ✅ `vitest run` — 59/59 testes passando (mantido após restauração do ProtectedRoute.test.tsx)
- ✅ `npm install` regenerou `package-lock.json`
- ✅ Nenhum arquivo deletado é referenciado em `src/`, `supabase/` ou `package.json`

### 3.5 Risco

**Zero em produção.** Nenhum arquivo deletado é importado em qualquer lugar do código. Build, runtime e testes preservados.

---

## 4. Backlog de limpeza para PRs futuros

### 4.1 Quando PR-DECOM (Inter) rodar (~60-90 dias)

```
src/components/settings/integrations/BancoInterConfigForm.tsx  (769)
supabase/functions/banco-inter/index.ts                        (880)
supabase/functions/webhook-banco-inter/index.ts                (392)
+ secrets BANCO_INTER_* no Lovable Cloud
+ webhook configurado no portal Inter
```

**Ganho:** ~2.041 linhas + redução de superfície de ataque.

### 4.2 Migrations duplicadas detectadas

```
20260205100000_*.sql ─┐
                      ├── adicionam as MESMAS colunas em invoices
20260205130319_*.sql ─┘
```

Idempotente (`IF NOT EXISTS`), não quebra nada. Limpar em PR de schema cleanup futuro (não urgente).

### 4.3 Componentes gigantes a quebrar (refator estrutural — PR-K)

Já listados em `BILLING_AUDIT.md` para o módulo billing. Para outros módulos, candidatos:

- `ClientPortalPage.tsx` (1.059) — quebrar em seções
- `TicketsPage.tsx` (875) — extrair filtros, tabela e dialogs
- `ClientMappingsTab.tsx` (912) — revisar necessidade
- `ClientAssetsList.tsx` (908) — quebrar
- `unifi-sync/index.ts` (1.107) — extrair shared com `tactical-rmm-sync` e `checkmk-sync`

### 4.4 Componentes UI shadcn que sobraram mas podem sair se substituídos

`chart.tsx` (303) — usado por 2 dashboards. Se algum dia migrar para Recharts direto, pode sair com 1 dep (`recharts` continua usado, mas o wrapper sai).

---

## 5. Como manter este documento vivo

- Atualizar **seção 2.2** quando um PR mudar de status
- Atualizar **seção 3.3** com métricas reais ao final do PR-CLEAN
- Adicionar entrada `## Histórico — YYYY-MM-DD` quando algo grande mudar
- Não deletar entradas — apenas marcar como "concluído"
- Revisão trimestral

---

## 6. Comandos para auditoria contínua

```bash
# Ver tamanho atual do repo
du -sh . --exclude=node_modules --exclude=.git

# Listar top 20 arquivos por tamanho
find src supabase/functions -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | sort -rn | head -20

# Detectar componentes não importados (CUIDADO: não usar para *.test.*)
for f in $(find src/components -name "*.tsx" -not -path "*/ui/*"); do
  name=$(basename "$f" .tsx)
  count=$(grep -rln "${name}" src/ supabase/ 2>/dev/null | grep -v "$f" | wc -l)
  [ "$count" = "0" ] && echo "DEAD: $f"
done

# Detectar deps órfãs (heurística: nome aparece 1x = só no próprio shadcn ui dele)
for dep in @radix-ui/react-X embla-carousel-react vaul; do
  echo "$dep: $(grep -rln "$dep" src/ | wc -l) refs"
done

# Validar TS + testes
npx tsc --noEmit && npx vitest run
```

---

**FIM DO DOCUMENTO** — gerado em 2026-05-07 a partir do código real.
