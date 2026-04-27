# Hotfix Consolidado — Encerramento Seção 4.5.1

## Resumo da inspeção (Passo 0)

| Bug | Status | Ação |
|---|---|---|
| **B1** — Campos errados em `DocSectionInfrastructure.tsx` | Confirmado, 1 arquivo afetado | Renomear 7 ocorrências |
| **B3** — `NONE_BRANCH = "none"` divergente | **JÁ CORRIGIDO** (todos os 6 arquivos usam `"__none__"`) | Pular — registrar no CHANGELOG mesmo assim? Não. Removo da entrada. |
| **B2** — Badge "Sede" sem destaque | Já condicionado a `is_main`, falta destaque amarelo | Trocar variant/className |
| **B7** — Dados de teste em VIZU | 4 registros identificados, Sede preservada | Migration de DELETE |

### Detalhe B7 — registros que serão deletados
- `assets`: "Testes" (`d0dcc88c…`), "TestePR3" (`52f4800b…`)
- `client_branches`: "Teste Filial" (`4b345121…`, is_main=**false** ✅)
- `doc_devices`: "Testes" (`64fbdb8f…`)
- Sede preservada: `94c6fa79…` (is_main=true, nome "Sede" — não casa com `%teste%`)

---

## Mudanças

### 1) `src/components/clients/documentation/DocSectionInfrastructure.tsx` (B1)
7 substituições — alinhar com schema real:
- `general_notes` → `notes` (interface L33, EMPTY L47, read view L109/112, form L190)
- `gateway_wan_ip` → `gateway_ip_wan` (interface L39, EMPTY L49, read view L128, form L223)
- `gateway_lan_ip` → `gateway_ip_lan` (interface L40, EMPTY L49, read view L129, form L227)

### 2) `src/components/clients/ClientBranchesList.tsx` (B2)
Linha 511-514: trocar
```tsx
<Badge variant="secondary" className="gap-1 text-xs">
  <Star className="h-3 w-3" />
  Sede
</Badge>
```
por destaque amarelo preenchido (alinhado ao token `--primary` do tema, que é `#F5B700` Honey Gold):
```tsx
<Badge className="gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
  <Star className="h-3 w-3 fill-current" />
  Sede
</Badge>
```
Mantém o `branch.is_main &&` que já filtra para mostrar só na Sede.

### 3) Nova migration `cleanup_test_data_secao_451.sql`
```sql
DELETE FROM public.doc_devices
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%';

DELETE FROM public.assets
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%';

DELETE FROM public.client_branches
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%'
  AND is_main = false;
```

### 4) `CHANGELOG.md` — sob entrada do PR #4, seção `### Corrigido`
- Hotfix em `DocSectionInfrastructure.tsx`: alinhamento de 3 nomes de coluna que divergiam do schema (`general_notes`→`notes`, `gateway_wan_ip`→`gateway_ip_wan`, `gateway_lan_ip`→`gateway_ip_lan`). Bug pré-existente que bloqueava 100% dos saves de Infra.
- Badge "Sede" em `ClientBranchesList` agora com destaque amarelo preenchido (Honey Gold + Star fill), antes usava variant secondary discreto.
- Cleanup de dados de teste em produção do cliente VIZU (registros criados durante validação E2E dos PRs #2-#4).

> **Nota**: B3 (NONE_BRANCH) **não entra no CHANGELOG** — verificação mostrou que já está padronizado em todos os 6 arquivos. Sem ação necessária.

### 5) `REFACTORING_ROADMAP.md`
Marcar PR #4 da Seção 4.5.1 como ✅ COMPLETO (com hotfix). Sem nova entrada.

---

## Validação
1. `bunx tsc --noEmit` → 0 erros
2. Counts pós-cleanup: `client_branches`=1 (só Sede), `assets`=0, `doc_devices`=0
3. Diff dos 2 arquivos UI + caminho da migration

---

## Restrições respeitadas
- Não toca em hooks, RLS, edge functions, schema (só DELETE em 3 tabelas existentes)
- Não cria arquivos novos de documentação
- Não renomeia variáveis fora do escopo
- Sede preservada na migration via `is_main = false`
