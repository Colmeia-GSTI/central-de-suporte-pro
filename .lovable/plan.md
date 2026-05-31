
# Refatoração da Interface de Contratos + Validação do Reajuste no Asaas

> Skill aplicada: **ui-ux-pro-max** — `ui-reasoning.csv` linha 5 (B2B Service: minimalismo + confiança), linha 6 (Financial Dashboard: clareza de números), linha 16 (Productivity Tool: ações rápidas). `quick-reference.md` → `progressive-disclosure`, `tab-navigation`, `inline-validation`, `confirmation-dialogs`, `number-tabular`, `sticky-header`.

---

## Parte 1 — Diagnóstico atual

A página `EditContractPage` hoje renderiza **um único formulário gigante de 793 linhas** com tudo empilhado: identificação, vigência, faturamento, reajuste, serviços, NFS-e, mensagens, notas internas. Resultado:

1. Usuário rola muito, perde contexto e não acha onde está cada coisa.
2. Card de **Reajuste** aparece no meio do form, competindo com inputs do mesmo form (duplica intenção: "salvar" vs "aplicar reajuste").
3. Ações importantes (faturas do contrato, histórico, cobrança extra) estão escondidas só na listagem `ContractsPage`, sem atalho na própria edição.
4. Não tem header fixo identificando qual contrato/cliente está sendo editado.
5. Mobile: scroll vertical interminável, sem agrupamento visual.

## Parte 2 — Validação do reajuste indo correto pro Asaas

Fluxo conferido no código:

```text
Aplicar Reajuste (ContractAdjustmentDialog)
   └─► edge fn apply-contract-adjustment
         ├─ insert contract_adjustments (histórico)
         ├─ UPDATE contracts.monthly_value = novo valor
         ├─ UPDATE contracts.adjustment_date = +1 ano
         ├─ UPDATE contract_services (proporcional)
         └─ insert contract_history(action=adjustment)

Próxima fatura
   └─► cron generate-monthly-invoices (11h UTC diário)
         ├─ lê contracts.monthly_value JÁ ATUALIZADO
         ├─ amount = monthly_value × intervalMonths
         ├─ INSERT invoices
         └─ invoke asaas-nfse create_payment → cria cobrança nova no Asaas com valor novo
```

**Asaas NÃO usa subscriptions** neste projeto — cada fatura cria uma cobrança pontual via `create_payment`. Logo, o reajuste é refletido **automaticamente** na próxima cobrança gerada pelo cron. Não precisa atualizar nada em cobranças antigas (corretas: foram emitidas pelo valor da época).

✅ **Reajuste vai chegar correto ao Asaas.** Vamos só adicionar uma **validação visual** ("Próxima fatura: R$ X em DD/MM via Asaas") no card de reajuste para o usuário leigo ter certeza.

## Parte 3 — Nova UI de Edição de Contrato (com abas)

### A. Layout reorganizado em abas (Tabs do shadcn)

```text
┌─────────────────────────────────────────────────────────────────┐
│ ← Voltar     Editar Contrato                       [Salvar]     │
│ AirDuto · Backup nuvem 25GB                                     │
│ Ativo · R$ 50,00/mês · Próxima fatura 07/06/2026 · Asaas        │
├─────────────────────────────────────────────────────────────────┤
│ [Geral] [Faturamento] [Reajuste] [Serviços] [NFS-e] [Avançado]  │
├─────────────────────────────────────────────────────────────────┤
│  (conteúdo da aba selecionada)                                  │
└─────────────────────────────────────────────────────────────────┘

       Toolbar lateral / topo direito:
       📄 Faturas   🕓 Histórico   ➕ Cobrança Extra   ⋮ Mais
```

**Aba a aba:**
- **Geral** — nome, cliente (combobox), status, modelo de suporte, horas, vigência (term_type + data início/término), descrição.
- **Faturamento** — `ContractBillingSection` (dia, dias antes vencer, frequência, provider, preferência), mensagem de cobrança (`ContractNotificationMessageForm`). **Sem o campo `monthly_value` direto** — só leitura com link "Para alterar valor, vá em Reajuste".
- **Reajuste** — `ContractAdjustmentCard` em destaque. Adicionar bloco "Próxima cobrança no Asaas: R$ Y em DD/MM" calculado a partir de `monthly_value × intervalMonths` + `billing_day`. Botões "Aplicar Reajuste" / "Registrar Renegociação" / "Editar Configuração". Histórico colapsável.
- **Serviços** — `ContractServicesSection` (já existe).
- **NFS-e** — `ContractNfseSection`.
- **Avançado** — notas internas + ações destrutivas (cancelar contrato, com `confirmation-dialogs`).

### B. Header sticky com identidade do contrato

- Componente novo `ContractEditHeader` (sticky `top-0`, `z-10`, `backdrop-blur`):
  - Botão voltar (padrão iOS, canto superior esquerdo conforme regra do projeto)
  - Nome do contrato + cliente em destaque (`Orbitron` para nome)
  - Linha de metadados: status badge + valor atual (`tabular-nums`) + próxima fatura
  - Botão "Salvar" sempre visível (some o fim-de-form perdido)

### C. Barra de ações rápidas

Substitui ações que só existiam no menu da listagem. Acessível em qualquer aba:
- **Faturas do contrato** → abre `ContractInvoicesSheet`
- **Histórico** → abre `ContractHistorySheet`
- **Nova cobrança extra** → abre `ContractAdditionalChargeDialog`
- **Menu ⋮**: Duplicar contrato (futuro), Cancelar contrato (com AlertDialog)

### D. Melhorias de UX/leigo (skill)

- Cada aba tem 1 frase de helper explicando para que serve (`input-helper-text`).
- Tooltips PT-BR simples em todos os termos técnicos (NFS-e, IGP-M, Asaas, etc).
- Validação inline on blur, não on change (`inline-validation`).
- Mobile: as Tabs viram Accordion vertical (sem scroll horizontal de abas).
- Toast Sonner em toda mutation (sucesso + erro com mensagem amigável).
- Empty state em todas as listas (faturas, histórico, serviços).

### E. Conferência de "menus que não funcionavam"

Auditar os fluxos abaixo nesta refatoração (botões clicados → ação real):
1. Voltar — `navigate("/contracts")` ✅
2. Salvar — `mutation.mutate(form.getValues())` em qualquer aba (não só na última)
3. Aplicar Reajuste → edge fn `apply-contract-adjustment` → invalidar `["contract", id]` e `["contracts"]`
4. Registrar Renegociação → grava `contract_history`, atualiza `monthly_value` (sem mexer em `adjustment_date`)
5. Editar Configuração de reajuste → só atualiza `adjustment_date/index/percentage`
6. Faturas/Histórico/Cobrança extra → abrem os sheets/dialogs já existentes
7. Cancelar contrato → muda `status='cancelled'` com `contract_history`

## Parte 4 — Validação automatizada do Asaas pós-reajuste

Pequeno indicador no card de Reajuste:

```text
┌─ Próxima cobrança no Asaas ─────────────────┐
│ R$ 150,00 (3× R$ 50,00)                     │
│ Vence em 07/06/2026 · Boleto · Asaas        │
│ Será gerada automaticamente em 02/06/2026   │
└─────────────────────────────────────────────┘
```

Cálculo no frontend (sem chamar Asaas):
- `intervalMonths` ← mapa de `billing_frequency`
- `nextAmount = monthly_value × intervalMonths`
- `nextDue = próximo billing_day a partir de hoje`
- `nextGen = nextDue - days_before_due`

Isso dá ao usuário **certeza visual** de que o reajuste vai chegar correto no Asaas.

---

## Arquivos

**Criar:**
- `src/components/contracts/ContractEditHeader.tsx` — header sticky com identidade
- `src/components/contracts/ContractEditTabs.tsx` — Tabs (desktop) / Accordion (mobile)
- `src/components/contracts/ContractQuickActions.tsx` — barra de ações (Faturas/Histórico/Extra/⋮)
- `src/components/contracts/sections/ContractGeneralSection.tsx` — extrai bloco "Geral" do form
- `src/components/contracts/sections/ContractAdvancedSection.tsx` — notas internas + cancelar
- `src/components/contracts/NextAsaasInvoicePreview.tsx` — bloco de preview da próxima cobrança

**Editar:**
- `src/pages/contracts/EditContractPage.tsx` — usar header + tabs + quick actions
- `src/components/contracts/ContractForm.tsx` — quebrar em seções por aba (mantém schema/mutation, só reorganiza render)
- `src/components/contracts/ContractAdjustmentCard.tsx` — embutir `NextAsaasInvoicePreview`
- `CHANGELOG.md`

**Sem alteração de regra de negócio:** schema do form, edge functions (`apply-contract-adjustment`, `generate-monthly-invoices`, `asaas-nfse`), tabelas e cron continuam exatamente iguais. **A mudança é puramente de apresentação e organização** — alinhada ao princípio do projeto de "não adicionar features novas".

## Fora do escopo
- Não mexer em `ContractsPage` (listagem) — só a edição.
- Não mexer no fluxo de criação de contrato (`NewContractPage`) — fica para outra rodada.
- Não alterar nenhum cron, edge function ou tabela.
- Não tocar em integração Asaas (já validada correta).

**Posso implementar?**
