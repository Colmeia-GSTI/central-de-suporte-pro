

# Varredura E2E: Otimização, Reutilização e Redução de Código

## Problemas Identificados

### 1. CÓDIGO MORTO — Arquivos nunca importados (podem ser deletados)

| Arquivo | Evidência |
|---|---|
| `src/lib/api-error-handler.ts` | Zero imports em todo o projeto |
| `src/lib/security.ts` | Zero imports em todo o projeto |
| `src/components/nfse/NfseActionsMenu.tsx` | Zero imports — componente órfão |

**Impacto**: ~430 linhas de código morto no bundle.

### 2. DUPLICAÇÃO — Dois dialogs de NFS-e Avulsa idênticos

Existem **dois componentes** com a mesma finalidade:
- `src/components/financial/EmitNfseAvulsaDialog.tsx` (489 linhas) — usado no `BillingInvoicesTab`
- `src/components/billing/nfse/NfseAvulsaDialog.tsx` (454 linhas) — usado no `BillingNfseTab`

Ambos fazem a mesma coisa: emitir NFS-e avulsa via Asaas. São ~940 linhas que poderiam ser ~450.

**Correção**: Unificar para usar apenas o `NfseAvulsaDialog` (mais recente e melhor organizado), removendo o `EmitNfseAvulsaDialog`.

### 3. DUPLICAÇÃO — Sistema de Toast dual

O projeto usa **dois sistemas de toast** simultaneamente:
- `sonner` (import `toast` from `"sonner"`) — 54 arquivos
- `useToast` do Shadcn (import de `@/hooks/use-toast`) — 56 arquivos (inclui re-export em `src/components/ui/use-toast.ts`)

Ter dois sistemas causa inconsistência visual e peso desnecessário no bundle.

**Correção**: Migrar tudo para `sonner` (mais leve, API mais simples, já é o padrão nos arquivos mais recentes). Manter `use-toast.ts` e `toaster.tsx` temporariamente para não quebrar nada, mas marcar como deprecated.

*Nota: Esta migração é grande (~56 arquivos). Recomendo fazer em batch de 10-15 arquivos por iteração.*

### 4. DUPLICAÇÃO — `useIsTechnicianOnly` é redundante

O hook `useIsTechnicianOnly` (16 linhas, 3 consumidores) duplica lógica já disponível em `usePermissions`. O `usePermissions` já expõe `roles` e funções de verificação.

**Correção**: Adicionar helper `isTechnicianOnly` dentro de `usePermissions` e migrar os 3 consumidores.

### 5. VIOLAÇÃO — `select("*")` em 2 arquivos

- `src/components/settings/CompanyTab.tsx` — `select("*")` na tabela `company_settings`
- `src/pages/contracts/EditContractPage.tsx` — `select("*")` na tabela `contracts`

**Correção**: Substituir por colunas explícitas.

### 6. FLUXO DESCONECTADO — `EmitNfseDialog` vs `NfseAvulsaDialog`

O `BillingInvoicesTab` importa **3 componentes NFS-e** distintos:
- `EmitNfseDialog` (emissão vinculada a fatura)
- `EmitNfseAvulsaDialog` (emissão avulsa — duplicado)

Enquanto o `BillingNfseTab` usa o `NfseAvulsaDialog`. Isso cria confusão de fluxo.

## Plano de Execução (Priorizado)

### Fase 1 — Remoção de Código Morto (impacto imediato, risco zero)

| Arquivo | Ação |
|---|---|
| `src/lib/api-error-handler.ts` | Deletar |
| `src/lib/security.ts` | Deletar |
| `src/components/nfse/NfseActionsMenu.tsx` | Deletar |

### Fase 2 — Unificação do Dialog NFS-e Avulsa

| Arquivo | Ação |
|---|---|
| `src/components/financial/EmitNfseAvulsaDialog.tsx` | Deletar |
| `src/components/billing/BillingInvoicesTab.tsx` | Trocar import para `NfseAvulsaDialog` de `billing/nfse/` |

### Fase 3 — Eliminação do hook `useIsTechnicianOnly`

| Arquivo | Ação |
|---|---|
| `src/hooks/usePermissions.ts` | Adicionar `isTechnicianOnly` ao retorno |
| `src/hooks/useIsTechnicianOnly.ts` | Deletar |
| 3 consumidores | Migrar para `usePermissions().isTechnicianOnly` |

### Fase 4 — Corrigir `select("*")`

| Arquivo | Ação |
|---|---|
| `src/components/settings/CompanyTab.tsx` | Especificar colunas |
| `src/pages/contracts/EditContractPage.tsx` | Especificar colunas |

### Fase 5 — Padronização de Toast (sonner) — batch inicial

Migrar os 10 arquivos mais críticos (pages e hooks) de `useToast` para `sonner`, mantendo os demais para uma segunda iteração.

## Resumo de Impacto

- **~1.400 linhas** de código removidas/consolidadas
- **3 arquivos** de código morto eliminados
- **1 componente duplicado** de ~490 linhas removido
- **1 hook** desnecessário eliminado
- **2 queries** otimizadas (select explícito)
- Consistência de toast melhorada

