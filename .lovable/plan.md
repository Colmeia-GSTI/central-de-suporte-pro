

# Revisao Completa E2E -- Otimizacao do Sistema (Fase 2)

## Problemas Identificados

### 1. DUPLICACAO: `formatCurrency` local em 3 arquivos

Existem 3 arquivos que definem `formatCurrency` localmente, identica a funcao centralizada em `@/lib/currency`:

| Arquivo | Linha |
|---|---|
| `src/components/billing/BillingBankAccountsTab.tsx` | 34-39 |
| `src/components/financial/PixCodeDialog.tsx` | 35-36 |
| `src/pages/reports/ReportsPage.tsx` | 160-161 |
| `src/components/reports/AdditionalChargesReportTab.tsx` | 26-27 |

**Correcao:** Remover funcoes locais e importar `formatCurrency` de `@/lib/currency`.

---

### 2. DUPLICACAO: Interface `BankAccount` definida 2 vezes

Ambos `BillingBankAccountsTab.tsx` (linhas 20-32) e `BankAccountFormDialog.tsx` (linhas 25-35) definem a mesma interface manualmente.

**Correcao:** Usar `Tables<"bank_accounts">` do types.ts gerado automaticamente em ambos os componentes, eliminando as interfaces manuais.

---

### 3. `statusColors` incompleto em `BillingInvoicesTab`

`BillingInvoicesTab.tsx` (linhas 69-74) define `statusColors` mas faltam os status `renegotiated` e `lost` que existem no enum `invoice_status`. Isso causa badges sem estilo para esses status.

**Correcao:** Adicionar cores para `renegotiated` (azul) e `lost` (cinza).

---

### 4. POLLING EXCESSIVO: `IntegrationHealthDashboard` com 60s

Duas queries no `IntegrationHealthDashboard.tsx` usam `refetchInterval: 60_000` (linhas 69 e 163). Para um dashboard de saude de integracao, dados mudam raramente.

**Correcao:** Aumentar para `300_000` (5 min), alinhando com o padrao do sistema.

---

### 5. QUERIES N+1: `EconomicIndicesWidget`

`EconomicIndicesWidget.tsx` (linhas 29-45) faz 3 queries sequenciais em loop (`for` para IGPM, IPCA, INPC) ao inves de uma unica query.

**Correcao:** Substituir por uma unica query com `.in("index_type", ["IGPM", "IPCA", "INPC"])` e deduplicacao no frontend.

---

### 6. `BankAccountFormDialog` nao usa mutation pattern

O dialog usa `useState(saving)` + try/catch manual ao inves do padrao `useMutation` do React Query usado em todo o resto do sistema.

**Correcao:** Refatorar para usar `useMutation`.

---

### 7. Textos residuais "Nacional" nao corrigidos na fase anterior

Ainda existem referencias a "Nacional" que deveriam ter sido atualizadas:

| Arquivo | Linha | Texto |
|---|---|---|
| `src/lib/nfse-retencoes.ts` | 31 | `"conforme padrao NFS-e Nacional 2026"` |
| `src/components/billing/nfse/NfseTributacaoSection.tsx` | 65 | `"Tributacao (Padrao Nacional 2026)"` |
| `src/components/settings/CompanyTab.tsx` | 615 | `"Configuracoes NFS-e Nacional"` |
| `src/components/services/ServiceForm.tsx` | 35 | `"// Campos NFS-e Nacional"` |
| `src/components/services/ServiceForm.tsx` | 188 | `"Codigo de Tributacao Nacional e obrigatorio"` |

Nota: Referencias a "Simples Nacional" (regime tributario brasileiro) e "INPC (Indice Nacional...)" sao corretas e nao devem ser alteradas -- sao termos oficiais, nao referencias ao Portal Nacional de NFS-e.

**Correcao:** Atualizar textos para refletir "Asaas" ou remover a palavra "Nacional" onde se refere ao sistema de emissao.

---

### 8. Coluna `nfse_history.provider` com default `'nacional'`

A tabela `nfse_history` tem `provider text DEFAULT 'nacional'`. Como o sistema agora usa exclusivamente Asaas, o default deveria ser `'asaas'`.

**Correcao:** Migration SQL para alterar o default.

---

## Plano de Execucao

### Etapa 1 -- Eliminar duplicacoes de `formatCurrency`

- Remover funcao local de `BillingBankAccountsTab.tsx`, `PixCodeDialog.tsx`, `ReportsPage.tsx`, `AdditionalChargesReportTab.tsx`
- Importar `formatCurrency` de `@/lib/currency`

### Etapa 2 -- Eliminar interface `BankAccount` duplicada

- Usar `Tables<"bank_accounts">` nos componentes `BillingBankAccountsTab` e `BankAccountFormDialog`
- Remover interfaces manuais

### Etapa 3 -- Corrigir `statusColors` incompleto

- Adicionar `renegotiated` e `lost` ao `statusColors` no `BillingInvoicesTab`

### Etapa 4 -- Otimizacoes de performance

- Reduzir `refetchInterval` do `IntegrationHealthDashboard` de 60s para 300s
- Consolidar queries N+1 do `EconomicIndicesWidget` em query unica

### Etapa 5 -- Refatorar `BankAccountFormDialog` para `useMutation`

- Substituir `useState(saving)` + try/catch por `useMutation` padrao

### Etapa 6 -- Corrigir textos residuais "Nacional"

- Atualizar `nfse-retencoes.ts` linha 31
- Atualizar `NfseTributacaoSection.tsx` linha 65
- Atualizar `CompanyTab.tsx` linha 615
- Atualizar `ServiceForm.tsx` linhas 35, 188

### Etapa 7 -- Migration: alterar default de `nfse_history.provider`

```sql
ALTER TABLE nfse_history ALTER COLUMN provider SET DEFAULT 'asaas';
UPDATE nfse_history SET provider = 'asaas' WHERE provider = 'nacional';
```

---

## Secao Tecnica

### EconomicIndicesWidget -- query consolidada:

```typescript
const { data } = await supabase
  .from("economic_indices")
  .select("*")
  .in("index_type", ["IGPM", "IPCA", "INPC"])
  .order("reference_date", { ascending: false })
  .limit(10);

const latest = new Map<string, EconomicIndex>();
for (const row of data || []) {
  if (!latest.has(row.index_type)) latest.set(row.index_type, row as EconomicIndex);
}
return Array.from(latest.values());
```

### statusColors completo:

```typescript
const statusColors: Record<Enums<"invoice_status">, string> = {
  pending: "bg-status-warning/20 text-status-warning border-status-warning/40",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  overdue: "bg-destructive/20 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
  renegotiated: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  lost: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};
```

### BankAccountFormDialog -- refatoracao para useMutation:

```typescript
const saveMutation = useMutation({
  mutationFn: async () => {
    // validacao + insert/update
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
    onOpenChange(false);
    toast.success(isEditing ? "Conta atualizada" : "Conta criada");
  },
  onError: (err: Error) => {
    toast.error(err.message || "Erro ao salvar conta");
  },
});
```

### Arquivos afetados:

**Editar (10 arquivos):**
1. `src/components/billing/BillingBankAccountsTab.tsx`
2. `src/components/billing/BankAccountFormDialog.tsx`
3. `src/components/financial/PixCodeDialog.tsx`
4. `src/pages/reports/ReportsPage.tsx`
5. `src/components/reports/AdditionalChargesReportTab.tsx`
6. `src/components/billing/BillingInvoicesTab.tsx`
7. `src/components/billing/IntegrationHealthDashboard.tsx`
8. `src/components/billing/EconomicIndicesWidget.tsx`
9. `src/components/billing/nfse/NfseTributacaoSection.tsx`
10. `src/components/settings/CompanyTab.tsx`
11. `src/components/services/ServiceForm.tsx`
12. `src/lib/nfse-retencoes.ts`

**Migration SQL:** 1 migration para `nfse_history.provider` default

### Impacto estimado:
- ~30 linhas de codigo duplicado removidas (formatCurrency + BankAccount interface)
- ~80% reducao em queries do EconomicIndicesWidget (3 para 1)
- ~80% reducao em polling do IntegrationHealthDashboard (60s para 300s)
- Zero referencias residuais a "NFS-e Nacional" como sistema de emissao
- statusColors completo evita badges sem estilo

