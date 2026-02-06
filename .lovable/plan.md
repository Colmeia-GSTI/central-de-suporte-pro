
# Gerar Fatura Manual por Contrato

## Objetivo
Adicionar um botao na tabela de contratos que permite gerar a fatura manualmente para um contrato especifico, ignorando a regra de antecedencia (`days_before_due`). Util para contratos com vencimento proximo que nao se enquadram na janela automatica.

---

## O que muda

### 1. Backend - Edge Function `generate-monthly-invoices`
- Aceitar um parametro opcional `contract_id` no body da requisicao
- Quando `contract_id` estiver presente, filtrar apenas esse contrato (em vez de todos os ativos)
- O resto do fluxo permanece identico: verifica duplicidade, gera fatura, emite cobranca e NFS-e se configurado

### 2. Frontend - `ContractsPage.tsx`
- Adicionar um botao com icone de "Gerar Fatura" (icone `Receipt`) na coluna de acoes de cada contrato ativo
- Ao clicar, exibir um dialog de confirmacao informando:
  - Nome do contrato
  - Valor mensal
  - Competencia que sera gerada (mes atual)
- Ao confirmar, chamar `supabase.functions.invoke("generate-monthly-invoices", { body: { contract_id } })`
- Mostrar toast de sucesso/erro com o resultado
- O botao so aparece para contratos com status "active"
- Protegido por `PermissionGate` (modulo `financial`, acao `manage`)

---

## Fluxo do usuario

```text
Contratos -> Coluna Acoes -> Botao "Gerar Fatura"
    |
    v
Dialog de Confirmacao
  "Gerar fatura para [Nome do Contrato]?"
  "Competencia: 02/2026 - Valor: R$ X.XXX,XX"
    |
    v
[Confirmar] -> Chama Edge Function com contract_id
    |
    v
Toast: "Fatura gerada com sucesso!" ou "Fatura ja existe para este mes"
```

---

## Detalhes Tecnicos

### Edge Function (`generate-monthly-invoices/index.ts`)
- Linha ~108: Extrair `contract_id` do body junto com `month` e `year`
- Linha ~128-148: Se `contract_id` presente, adicionar `.eq("id", contract_id)` na query de contratos
- Nenhuma outra alteracao necessaria - a logica de verificacao de duplicidade ja existe

### Frontend (`ContractsPage.tsx`)
- Adicionar estado para controlar o dialog de confirmacao e loading
- Adicionar `useMutation` para chamar a edge function
- Adicionar botao com `Receipt` icon entre o botao de reajuste e o de editar
- Invalidar queries `["invoices"]` e `["billing-counters"]` apos sucesso
- Importar `Loader2` para estado de loading

### Componentes reutilizados
- `ConfirmDialog` (ja importado na pagina)
- `PermissionGate` (ja importado)
- `TooltipProvider/Tooltip` (ja importado)
- `toast` via `useToast` (ja importado)
