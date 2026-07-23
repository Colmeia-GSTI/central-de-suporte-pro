# Contratos e Reajustes

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo funcional e majoritariamente em uso. O reajuste manual é feito 100% client-side no ContractAdjustmentDialog (INSERT contract_adjustments + UPDATE contracts/contract_services + INSERT contract_history); a edge apply-contract-adjustment é uma segunda implementação da MESMA regra, invocada apenas pelo cron check-contract-adjustments para auto-aplicar FIXO no D-0. fetch-economic-indices busca IGPM/IPCA/INPC do Banco Central e alimenta useLatestEconomicIndex e o EconomicIndicesWidget (setor Billing). Nenhum arquivo/símbolo do escopo está morto; os principais problemas são duplicação de regra, edges sem autenticação (verify_jwt=false) e agendamento fora das migrations.

## Integrações

- Banco Central do Brasil — SGS (séries IGPM=189, IPCA=433, INPC=188) via fetch-economic-indices, sem credenciais (fetch público)
- pg_cron + pg_net — agendamento de check-contract-adjustments e fetch-economic-indices (SQL documentado em docs/ops/DEPLOYMENT_PLAYBOOK.md; não presente em migrations)
- Asaas (indireto) — NextAsaasInvoicePreview mostra a próxima cobrança recalculada com o valor reajustado

## Fluxos (rota → componente → hook → edge → tabela)

- Reajuste manual (edição): /contracts/edit/:id -> EditContractPage -> ContractForm(aba Reajuste) -> ContractAdjustmentCard -> ContractAdjustmentDialog(mutation client-side) -> INSERT contract_adjustments + UPDATE contracts + UPDATE contract_services + INSERT contract_history
- Reajuste manual (atalho lista): /contracts -> ContractsPage(dropdown 'Reajuste anual') -> ContractAdjustmentDialog -> mesmas tabelas (contract_adjustments/contracts/contract_services/contract_history)
- Buscar índice atual: ContractAdjustmentDialog -> useLatestEconomicIndex -> SELECT economic_indices(accumulated_12m) -> preenche percentual
- Renegociação: ContractAdjustmentCard -> ContractRenegotiationDialog -> UPDATE contracts.monthly_value + INSERT contract_history(action='renegotiation') (NÃO cria contract_adjustments nem mexe em adjustment_date)
- Editar configuração: ContractAdjustmentCard -> ContractAdjustmentConfigSheet -> UPDATE contracts(adjustment_date/adjustment_index/adjustment_percentage)
- Config na criação: /contracts/new -> NewContractPage -> ContractForm -> sections/ContractAdjustmentSection -> campos do form -> INSERT contracts
- Cron reajuste/lembretes: pg_cron -> check-contract-adjustments -> (FIXO D-0) invoke apply-contract-adjustment -> UPDATE contracts/contract_services + INSERT contract_adjustments/contract_history; caso contrário INSERT notifications + contract_history(action='adjustment_reminder'); lê user_roles(admin/financial) e clients
- Índices econômicos: pg_cron(semanal, só no playbook) OU EconomicIndicesWidget -> fetch-economic-indices -> API BCB SGS -> upsert economic_indices(onConflict index_type,reference_date)
- Widget de índices: BillingPage -> BankReconciliationTab -> EconomicIndicesWidget -> SELECT economic_indices / invoke fetch-economic-indices
- Timeline de reajustes: ContractAdjustmentCard -> useContractAdjustmentHistory -> SELECT contract_adjustments + contract_history(renegotiation) -> ContractAdjustmentHistoryList
- Histórico completo: ContractsPage/ContractQuickActions -> ContractHistorySheet -> SELECT contract_history + contract_service_history + invoices+nfse_history

## Regras de negócio

- Novo valor = monthly_value * (1 + pct/100) — ContractAdjustmentDialog.tsx:63 e apply-contract-adjustment/index.ts:58-59
- Próxima data de reajuste = data de vigência (ou hoje) + 1 ano — ContractAdjustmentDialog.tsx:65,98; edge index.ts:81-82 (usa now, não a vigência)
- Serviços reajustados proporcionalmente: unit_value*=mult, value=unit*qty — ContractAdjustmentDialog.tsx:110-116; edge index.ts:107-116
- adjustment_percentage só persiste para FIXO (null caso contrário) — ContractAdjustmentDialog.tsx:100; ContractAdjustmentConfigSheet.tsx:51
- FIXO auto-aplica no D-0 via apply-contract-adjustment — check-contract-adjustments/index.ts:107-119
- Buckets de lembrete: D-30(info), D-7(warning), D-0(warning), overdue D+1..D-30(warning) — check-contract-adjustments/index.ts:82-144
- Idempotência do lembrete: 1 por bucket por dia via contract_history(action='adjustment_reminder', changes.bucket) — check-contract-adjustments/index.ts:90-104,159-164
- Notificações só para roles admin/financial — apply/index.ts:135-138 e check/index.ts:66-69
- Renegociação exige valor diferente do atual e motivo; não altera data nem histórico de índice — ContractRenegotiationDialog.tsx:43-45,124-126
- accumulated_12m = produto dos 12 fatores mensais - 1, só a partir do 12º ponto (i>=11) — fetch-economic-indices/index.ts:94-101
- Séries BCB: IGPM=189, IPCA=433, INPC=188 — fetch-economic-indices/index.ts:18-22
- 'Buscar atual' preenche o percentual com o último accumulated_12m do índice — ContractAdjustmentDialog.tsx:76-80
- useLatestEconomicIndex desabilitado para FIXO — useLatestEconomicIndex.ts:13
- Validação edge: contract_id obrigatório e index_value numérico > 0 — apply-contract-adjustment/index.ts:28

## Arquivos-chave

- `src/pages/contracts/ContractsPage.tsx` — Lista de contratos com atalho 'Reajuste anual' (dropdown), abre ContractAdjustmentDialog e ContractHistorySheet
- `src/pages/contracts/NewContractPage.tsx` — Tela de criação de contrato; renderiza ContractForm (sem contractData -> ContractAdjustmentSection)
- `src/pages/contracts/EditContractPage.tsx` — Edição de contrato; renderiza ContractForm (com contractData -> ContractAdjustmentCard) e ContractQuickActions
- `src/components/contracts/ContractForm.tsx` — Formulário com aba 'Reajuste'; escolhe ContractAdjustmentCard (edição) ou sections/ContractAdjustmentSection (criação)
- `src/components/contracts/ContractAdjustmentCard.tsx` — Card de reajuste na edição: status, valores, ações (Aplicar/Renegociar/Config) e histórico
- `src/components/contracts/ContractAdjustmentDialog.tsx` — Dialog que APLICA o reajuste (mutation client-side); usa useLatestEconomicIndex para 'Buscar atual'
- `src/components/contracts/ContractRenegotiationDialog.tsx` — Registra renegociação de escopo (só UPDATE monthly_value + contract_history action=renegotiation)
- `src/components/contracts/ContractAdjustmentConfigSheet.tsx` — Edita só a configuração (data/índice/percentual FIXO) sem aplicar reajuste
- `src/components/contracts/ContractAdjustmentHistoryList.tsx` — Renderiza a timeline combinada de reajustes/renegociações
- `src/components/contracts/sections/ContractAdjustmentSection.tsx` — Campos de reajuste (data/índice/percentual) para o form em modo criação
- `src/components/contracts/sections/DatePickerField.tsx` — Campo de data usado por ContractAdjustmentSection
- `src/components/contracts/ContractHistorySheet.tsx` — Sheet com abas Alterações/Serviços/Faturas/NFS-e (lê contract_history, contract_service_history, invoices)
- `src/components/contracts/ContractQuickActions.tsx` — Barra de ações rápidas na edição (Faturas/Histórico/Cobrança extra/Cancelar)
- `src/components/contracts/NextAsaasInvoicePreview.tsx` — Preview da próxima fatura Asaas dentro do card de reajuste
- `src/components/billing/EconomicIndicesWidget.tsx` — Widget que lista últimos índices e dispara fetch-economic-indices manualmente
- `src/hooks/useLatestEconomicIndex.ts` — Query do último accumulated_12m por índice (desabilitado p/ FIXO)
- `src/hooks/useContractAdjustmentHistory.ts` — Combina contract_adjustments + contract_history(renegotiation) em timeline única
- `supabase/functions/apply-contract-adjustment/index.ts` — Edge que aplica reajuste (UPDATE contracts/services + INSERT adjustments/history + notificações) _(uso: parcial)_
- `supabase/functions/check-contract-adjustments/index.ts` — Cron diário: lembretes progressivos e auto-aplicação de FIXO no D-0
- `supabase/functions/fetch-economic-indices/index.ts` — Busca séries BCB SGS (189/433/188), calcula accumulated_12m e faz upsert em economic_indices

## Pontos de atenção / riscos

- DUPLICAÇÃO de regra: apply-contract-adjustment (edge) e ContractAdjustmentDialog.mutation (client-side) implementam o mesmo reajuste. A UI usa a versão client-side; a edge só roda no FIXO D-0. Diferenças reais: a edge NÃO grava applied_by (index.ts:63-73), NÃO seta adjustment_percentage (index.ts:84-91) e usa adjustment_date=hoje em vez da vigência escolhida.
- SEGURANÇA: config.toml marca as 3 edges com verify_jwt=false. apply-contract-adjustment usa service role e aceita contract_id+index_value de qualquer chamador não autenticado (index.ts:15-33) -> reajuste arbitrário sem auth. Sem checagem de secret/cron header em apply nem em fetch.
- FIXO D-0 não grava registro de idempotência 'adjustment_reminder' (o branch dá 'continue' em index.ts:118 antes do INSERT das linhas 159-164). A proteção contra reaplicar 2x depende apenas de apply mover adjustment_date +1 ano; há janela de corrida se apply falhar após o UPDATE parcial.
- TIMEZONE misto: o cron calcula buckets com adjustment_date+'T00:00:00Z' (UTC, check/index.ts:73,78) enquanto o card usa +'T12:00:00' local (ContractAdjustmentCard.tsx:75,130) -> possível off-by-one entre o status exibido na UI e o dia em que o cron dispara.
- RLS x UI: os botões Aplicar/Renegociar/Config no ContractAdjustmentCard (linhas 184-197) não têm PermissionGate; a RLS de contract_adjustments exige admin/financial (migration L108-110) -> staff comum vê os botões e recebe erro de RLS ao aplicar.
- Consistência valor x serviços: editar serviços após o reajuste pode sobrescrever o monthly_value reajustado (ContractServicesSection recalcula por soma dos serviços).
- fetch-economic-indices conta 'inserted' mesmo em updates de upsert (index.ts:116-118) — métrica exibida no toast do widget é enganosa; 'latest' retornado é o último ponto iterado do array.
- Nenhum arquivo/símbolo do escopo está órfão (0 candidatos a morto). apply-contract-adjustment tem exatamente 1 caller (check-contract-adjustments), portanto é redundância, não código morto.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA (L278/L287) afirma 'Agendamento ausente no código (sem cron.schedule nas migrations)'. Confere para migrations (só criam economic_indices/contract_adjustments), MAS o cron.schedule EXISTE em docs/ops/DEPLOYMENT_PLAYBOOK.md:161 (check) e :170 (fetch) — 'ausente no código' é impreciso; está no playbook, não em migration.
- Horário do cron diverge entre docs: MAPA §Crons (L96) diz check-contract-adjustments '0 10 * * *' (bate com comentário do edge 'Runs daily at 10h UTC'), mas docs/ops/DEPLOYMENT_PLAYBOOK.md:161 diz '0 7 * * *'. Fonte real (cron.job no DB) NÃO verificada (regra: não consultar banco).
- MAPA (L262) lista EconomicIndicesWidget como frontend do módulo Contratos, mas o componente só é montado no setor Billing (BillingPage:199 -> BankReconciliationTab:225); nenhuma página/rota de contracts o consome.
- Demais afirmações do MAPA conferem com o código: duplicação edge vs client-side (L276), edge não grava applied_by nem adjustment_percentage (L277), UI nunca chama a edge (L271/L276), verify_jwt=false nas 3 edges (L281), check-contract-adjustments não lê economic_indices (L1353), cron do fetch só no playbook sem migration (L1349).

