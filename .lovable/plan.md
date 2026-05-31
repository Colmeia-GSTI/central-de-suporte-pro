
# Validação Gayger + Redesign do Reajuste Anual

> Aplicando a skill **ui-ux-pro-max**. Referências usadas:
> - `ui-reasoning.csv` linha 6 (**Financial Dashboard** — clareza, números animados, alerta) + linha 16 (**Productivity Tool** — micro-interactions, ações rápidas 150ms) + linha 5 (**B2B Service** — minimalismo, confiança, sem decoração).
> - `quick-reference.md` seções: **Forms & Feedback** (`input-helper-text`, `inline-validation`, `confirmation-dialogs`, `success-feedback`), **Touch & Interaction** (`loading-buttons`, `press-feedback`), **Animation** (`duration-timing 150–300ms`, `motion-meaning`), **Typography & Color** (`number-tabular`, `color-semantic`).

---

## Parte 1 — Validação da cobrança do Gayger (R$ 50 mensal cobrado a cada 3 meses)

**Estado atual do contrato** `Gayger - Backup em nuvem 25GB`:

| Campo | Valor | OK? |
|---|---|---|
| `monthly_value` | R$ 50,00 | ✅ |
| `billing_frequency` | `quarterly` | ✅ |
| `billing_day` | 7 | ✅ |
| `billing_provider` | asaas | ✅ |
| `payment_preference` | boleto | ✅ |
| `status` | active | ✅ |
| `first_billing_month` | NULL (não bloqueia) | ✅ |
| Faturas existentes | **0** | — |

**Lógica do cron `generate-monthly-invoices` (já validada no código, linhas 331–541):**
1. Mapa: `quarterly = 3 meses`.
2. Gate de frequência: só gera se `monthsSince ≥ 3` desde a última fatura ativa. Gayger nunca faturou → permite gerar.
3. Valor: `monthly_value × intervalMonths = 50 × 3 = R$ 150,00`. ✅
4. Notas registram explicitamente: `Valor recorrente: 3x R$ 50,00 = R$ 150,00`.
5. Próximo ciclo: setembro/2026 (gate de 3 meses bloqueia jul/ago).

**Quando entra a 1ª fatura?**
- Vencimento previsto: **07/06/2026** (ref 2026-06).
- Janela `days_before_due=5` → cron gera a partir de **02/06/2026** às 11h UTC.
- Cron de amanhã (31/05) **vai pular** o Gayger — comportamento correto.

**Conclusão Gayger:** ✅ Cobrança vai sair correta e a cadência trimestral será respeitada automaticamente.
**Validação prevista 02/06 às 11h05:** conferir 1 fatura R$ 150,00, Asaas, com `asaas_payment_id` preenchido.

---

## Parte 2 — Redesign da UI de Reajuste Anual

### Diagnóstico (problemas hoje)
1. **Duas UIs desconectadas:** seção crua no formulário (só campos) + dialog escondido na listagem.
2. **Usuário leigo não vê:** quando será o próximo, quanto falta, quem dispara (automático ou manual), histórico.
3. **`monthly_value` editável direto** no form, gerando confusão com reajuste real.
4. **Sem preview de impacto:** ninguém vê "R$ 50 → R$ 52,50/mês = R$ 157,50/trimestre".
5. Viola `quick-reference.md → input-helper-text, progressive-disclosure, success-feedback`.

### Solução visual (estilo Financial Dashboard, minimal, app-like)

#### A. Novo `ContractAdjustmentCard.tsx` — substitui a seção atual e aparece também na página de detalhe do contrato

```text
┌─ Reajuste Anual ─────────────────────────────────── ⓘ ─┐
│                                                         │
│  [●] Próximo reajuste em  11 meses 20 dias              │
│      📅 15/05/2027  •  Índice: IGP-M (revisão manual)   │
│                                                         │
│  Valor atual                Última atualização          │
│  R$ 50,00 / mês             31/05/2026 (Renegociação)   │
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ 📈 Aplicar Reajuste │  │ ✏️ Editar Configuração   │  │
│  └─────────────────────┘  └──────────────────────────┘  │
│                                                         │
│  ▾ Histórico (3)                                        │
│   31/05/26 · Renegociação  R$ 1.500 → R$ 2.300  +53%    │
│   10/05/25 · IGPM 4,87%    R$ 1.430 → R$ 1.500  +5%     │
│   10/05/24 · IGPM 3,50%    R$ 1.380 → R$ 1.430  +4%     │
└─────────────────────────────────────────────────────────┘
```

Regras visuais (skill):
- **Badge de status** seguindo semântica de cores do projeto (`#2F9E44 success`, `#F08C00 warning`, `#E03131 danger`):
  - 🟢 > 60 dias | 🟡 30–60 dias | 🔴 ≤ 30 dias ou vencido.
  - Cor + ícone + texto (`color-not-only`).
- **Tipografia tabular** (`font-variant-numeric: tabular-nums`) em todos os valores — `quick-reference.md → number-tabular`.
- **Microanimação** ao trocar o valor: contador animado 200ms ease-out (`duration-timing`, Financial Dashboard "real-time number animations").
- **Tooltip** no índice explicando em PT-BR simples (público leigo, conforme memória do usuário):
  - IGP-M/IPCA/INPC → "Reajuste manual pelo financeiro quando a data chegar."
  - FIXO → "Reajuste aplicado automaticamente pelo sistema em XX/XX/XXXX."
- **Histórico colapsável** (`progressive-disclosure`) — fica fechado por padrão, expande on-demand.

#### B. Melhorias no `ContractAdjustmentDialog` (botão "Aplicar Reajuste")

Adicionar **bloco de preview de impacto** que aparece em tempo real ao digitar o %:

```text
┌─ Pré-visualização do impacto ──────────────────────┐
│ Valor mensal         R$ 50,00  →  R$ 52,50  (+5%)  │
│ Por cobrança (3m)    R$ 150,00 →  R$ 157,50        │
│ Próximo reajuste     31/05/2027 (1 ano)            │
└────────────────────────────────────────────────────┘
```

- **Atalho "Buscar IGP-M atual"**: botão que chama a edge function existente `fetch-economic-indices` e preenche o % automaticamente (1-click, conforme preferência do usuário leigo).
- **Campo "Data de vigência"** opcional (default: hoje) para reajustes retroativos/futuros.
- **Validação inline on blur** (`inline-validation`) — não a cada tecla.
- Botão primário em `bg-primary` (Honey Gold #F5B700) com `loading-buttons` (disabled + spinner durante mutation).
- **AlertDialog de confirmação** antes de aplicar (`confirmation-dialogs`): "Confirma reajuste de R$ X para R$ Y? Esta ação é registrada no histórico."

#### C. Remoção da ambiguidade no `ContractForm`

- `monthly_value` em contratos **existentes** → **readonly** com link "Para alterar, use Aplicar Reajuste ou Registrar Renegociação".
- Em contratos **novos** → continua editável (precisa definir valor inicial).
- Manter o aviso amarelo já implementado para casos limite.
- **Novo botão "Registrar Renegociação"** (dialog menor, separado do reajuste):
  - Para mudanças de escopo que NÃO são reajuste de índice.
  - Grava só em `contract_history(action='renegotiation')` + atualiza `monthly_value` e `contract_services`.
  - **NÃO** mexe em `contract_adjustments` nem em `adjustment_date`.

#### D. Indicador na listagem `ContractsPage`

- Badge sutil no card: 🔔 "Reajuste em 15 dias" quando `adjustment_date` ≤ 30 dias.
- O cron `check-adjustments-daily` já cria notificação — vamos só refletir visualmente.

### Regras de negócio consolidadas (vai pro tooltip "ⓘ" do card)

| Quero fazer | Uso | Atualiza |
|---|---|---|
| Reajuste anual por índice (IGPM/IPCA/INPC) | Botão **Aplicar Reajuste** | `contract_adjustments` + history + `monthly_value` + services + `adjustment_date += 1 ano` |
| Reajuste FIXO automático | Cron `check-contract-adjustments` na data configurada | Igual ao acima, automático |
| Mudança de escopo (upgrade/downgrade) | Botão **Registrar Renegociação** | `contract_history` + `monthly_value` + services (não toca em `adjustment_date`) |
| Só alterar data/índice de referência | Botão **Editar Configuração** | apenas `adjustment_date`, `adjustment_index`, `adjustment_percentage` |

---

## Arquivos

**Criar:**
- `src/components/contracts/ContractAdjustmentCard.tsx` (card principal)
- `src/components/contracts/ContractAdjustmentConfigSheet.tsx` (Sheet de "Editar Configuração")
- `src/components/contracts/ContractRenegotiationDialog.tsx` (novo dialog)
- `src/components/contracts/ContractAdjustmentHistoryList.tsx` (lista colapsável)
- `src/hooks/useContractAdjustmentHistory.ts` (combina `contract_adjustments` + `contract_history`)

**Editar:**
- `src/components/contracts/ContractForm.tsx` — substituir `ContractAdjustmentSection` pelo card; readonly em `monthly_value` para contratos existentes
- `src/components/contracts/ContractAdjustmentDialog.tsx` — preview de impacto + data de vigência + atalho IGP-M + AlertDialog
- `src/pages/contracts/ContractsPage.tsx` — badge "Reajuste em X dias"
- `CHANGELOG.md`

**Remover:** `src/components/contracts/sections/ContractAdjustmentSection.tsx` (substituído).

## Fora do escopo
- Não muda nada do cron de geração de faturas (validado correto).
- Não toca em `contract_adjustments` do Gayger (não houve reajuste).
- Não altera `apply-contract-adjustment` edge function.

**Posso implementar?**
