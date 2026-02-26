

# Plano Unificado: Melhorias no Formulario de Contratos e Mensagem de Cobranca

## Resumo das Alteracoes

Este plano consolida todas as correcoes e melhorias identificadas no modulo de contratos, calendario e mensagens de cobranca.

---

## 1. Calendario com navegacao rapida por mes/ano e altura fixa

**Arquivo:** `src/components/ui/calendar.tsx`

Adicionar estilos para os dropdowns nativos do DayPicker (`caption_dropdowns`, `dropdown_month`, `dropdown_year`, `dropdown`) e a prop `fixedWeeks` para manter altura constante. Isso resolve o problema do calendario "pulando" e permite selecionar mes/ano com clique direto.

**Arquivo:** `src/components/contracts/ContractForm.tsx`

No campo `adjustment_date`, adicionar as props `captionLayout="dropdown-buttons"`, `fromYear={2024}`, `toYear={2036}` e `fixedWeeks` ao componente Calendar.

---

## 2. Substituir todos os inputs nativos de data por Calendar/Popover

**Arquivo:** `src/components/contracts/ContractForm.tsx`

Os campos `start_date` (linha 537) e `end_date` (linha 570) ainda usam `<Input type="date">`. Serao convertidos para o mesmo padrao Popover + Calendar com dropdowns de mes/ano, identico ao campo de reajuste.

---

## 3. Unificar "Tempo indeterminado" e "Renovacao automatica"

**Arquivo:** `src/components/contracts/ContractForm.tsx`

Substituir o checkbox `indefinite_term` (linha 544) e o switch `auto_renew` (linha 578) por um unico Select "Vigencia do Contrato" com 3 opcoes:

| Opcao | end_date | auto_renew | Campo data fim |
|---|---|---|---|
| Indeterminado | null | true | Escondido |
| Renovacao automatica | obrigatorio | true | Visivel |
| Prazo fixo | obrigatorio | false | Visivel |

O schema Zod sera atualizado para incluir `term_type` como campo auxiliar. Os campos `indefinite_term` e `auto_renew` continuam existindo no schema para manter compatibilidade com o banco, mas serao derivados automaticamente do `term_type` selecionado.

---

## 4. Corrigir botao "Criar" -> "Salvar" na edicao

**Arquivo:** `src/components/contracts/ContractForm.tsx` (linha 1045)

Trocar `contract` por `contractData` na condicao do botao:

```text
Antes:  contract ? "Atualizar" : "Criar"
Depois: contractData ? "Salvar" : "Criar Contrato"
```

Tambem corrigir o toast de sucesso (linha 392) para usar `contractData`.

---

## 5. Adicionar status "suspended" ao schema Zod

**Arquivo:** `src/components/contracts/ContractForm.tsx` (linha 52)

O enum atualmente nao inclui `"suspended"`, mas o Select ja tem essa opcao (linha 520). Adicionar ao schema para evitar erro de validacao ao editar contratos suspensos.

---

## 6. Adicionar variavel {nota} na mensagem de cobranca

**Arquivo:** `src/components/contracts/ContractNotificationMessageForm.tsx`

Adicionar `{ key: "{nota}", description: "Numero da NFS-e emitida" }` na lista de variaveis disponiveis e no preview.

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts` (linha 579)

Adicionar substituicao de `{nota}` com o numero real da NFS-e apos emissao. Tambem adicionar `{boleto}` (link do boleto) e `{pix}` (codigo PIX) para que todas as variaveis listadas no frontend sejam de fato substituidas no backend.

---

## 7. Correcoes de qualidade de codigo

**Arquivo:** `src/components/contracts/ContractForm.tsx`

- Eliminar casts `(contractData as any)` (linhas 116-136) estendendo o tipo `ContractWithClient` ou usando um tipo mais completo
- Passar `contractId={contractData?.id}` ao `ContractServicesSection` (linha 856) para habilitar historico
- Invalidar queries adicionais no `onSuccess`: `["invoices"]`, `["billing-counters"]`, `["contract", contractData?.id]`

**Arquivo:** `src/components/contracts/ContractServicesSection.tsx` (linha 123)

Corrigir `useCallback(onChange, [])` que congela o callback. Usar `useRef` para manter referencia estavel.

---

## Detalhes Tecnicos

### Arquivos Modificados

| Arquivo | Alteracoes |
|---|---|
| `src/components/ui/calendar.tsx` | Estilos para dropdowns de mes/ano, suporte a `fixedWeeks` |
| `src/components/contracts/ContractForm.tsx` | Schema Zod (suspended, term_type), botao Salvar, 3 date pickers, vigencia unificada, tipagem, contractId, invalidacao |
| `src/components/contracts/ContractNotificationMessageForm.tsx` | Variaveis {nota}, {boleto}, {pix} |
| `supabase/functions/generate-monthly-invoices/index.ts` | Substituicao de {nota}, {boleto}, {pix} com dados reais |
| `src/components/contracts/ContractServicesSection.tsx` | Correcao useCallback |

### Impacto no Banco de Dados

Nenhum. Todas as alteracoes sao no frontend e Edge Function existente. Os campos `auto_renew` e `end_date` ja existem no banco.

### Estilos do Calendar para dropdowns

Serao adicionados os classNames `caption_dropdowns`, `dropdown_month`, `dropdown_year` e `dropdown` ao componente Calendar base, com estilos que garantem selects visiveis, compactos e consistentes com o design system.

