
Objetivo: corrigir de ponta a ponta o cenário em que a Viapiana (e outros clientes) continuam aparecendo com NFS-e em erro e fatura vencida, e criar um fluxo seguro de saneamento para “eliminar problemas” sem quebrar a rastreabilidade financeira.

1) Diagnóstico confirmado (causa raiz)
- A fatura da Viapiana (#52) está `overdue` e sem registro de cancelamento em auditoria (`audit_logs` vazio para essa fatura).  
  Isso indica que o cancelamento comercial da fatura não foi concluído no fluxo correto.
- Existem registros de NFS-e em `nfse_history` com erro `invalid_action` e mensagem “Necessário informar os impostos da nota fiscal.” vinculados à fatura da Viapiana.
- Há inconsistência de cobrança nessa mesma fatura: `boleto_status = enviado`, mas sem `boleto_url`, sem `boleto_barcode` e `payment_method` nulo (estado órfão/inconsistente).
- O “Painel de Erros” hoje prioriza reprocessar/regenerar, mas não tem um fluxo claro de saneamento final (“descartar erro”, “encerrar cobrança problemática”) com trilha de auditoria explícita para financeiro.

2) Estratégia de correção (fluxo completo de saneamento)
Vamos implementar um fluxo com 2 ações distintas e explícitas, para evitar confusão entre “cancelar boleto”, “cancelar nota” e “cancelar cobrança”:

A. Encerrar Cobrança Problemática (fatura)
- Ação principal no painel de erros e na listagem de faturas.
- Efeitos:
  - muda `invoices.status` para `cancelled`;
  - grava motivo obrigatório em `audit_logs`;
  - limpa/normaliza campos transitórios inconsistentes (ex.: `boleto_status` órfão, mensagens de erro obsoletas), sem apagar histórico útil;
  - tira imediatamente da inadimplência (não volta para overdue).
- Regras:
  - só para `pending`/`overdue`;
  - se houver NFS-e autorizada, exigir decisão guiada: cancelar NFS-e antes de encerrar cobrança.

B. Resolver Erro de NFS-e (sem “sumir” com rastreio)
- Em vez de apagar direto o histórico, criar ação de “resolver erro”:
  - marca registro como resolvido (ex.: status funcional de resolução + motivo);
  - mantém trilha para auditoria fiscal/financeira.
- Exclusão física (delete) ficará restrita a casos técnicos específicos (órfão/duplicado sem valor fiscal), com confirmação reforçada.

3) Ajustes de UI e fluxo operacional
Arquivos-alvo:
- `src/components/billing/BillingErrorsPanel.tsx`
- `src/components/billing/BillingInvoicesTab.tsx`
- `src/components/billing/InvoiceActionsPopover.tsx`
- `src/components/contracts/ContractInvoiceActionsMenu.tsx`
- `src/components/billing/CancelNfseDialog.tsx` (integração/uso consistente)
- `src/hooks/useInvoiceActions.ts`

Melhorias:
- Adicionar botões claros no Painel de Erros:
  - “Encerrar cobrança” (fatura)
  - “Resolver erro NFS-e”
  - “Reprocessar NFS-e” (quando fizer sentido)
- Exibir estado “Resolvido” para erro já tratado, evitando que continue “poluindo” a aba de erros.
- Unificar os diálogos de justificativa obrigatória (texto mínimo e sem ação silenciosa).
- Evitar ações destrutivas sem confirmação (já no padrão do projeto).

4) Correções de backend/funções para impedir recorrência
Arquivos-alvo:
- `supabase/functions/asaas-nfse/index.ts`
- `supabase/functions/generate-monthly-invoices/index.ts`
- (se necessário) função dedicada de saneamento financeiro

Ajustes:
- Reforçar payload fiscal em toda reemissão de NFS-e (inclusive caminhos de reprocessamento), garantindo envio consistente de tributos.
- Na reemissão via painel de erros, buscar e repassar explicitamente configurações fiscais do contrato (alíquota/ISS retido) para eliminar variação entre fluxos.
- Normalizar estado de cobrança órfã (ex.: “enviado sem artefato”) para estado de reprocessamento claro.
- Garantir que cancelamento comercial finalize estado da fatura e não deixe “pendurada” para cron de overdue.

5) Ajustes de dados (saneamento inicial dos registros já quebrados)
- Executar saneamento pontual dos registros já inconsistentes:
  - Viapiana: encerrar corretamente a cobrança com justificativa e registrar auditoria.
  - Resolver os registros de NFS-e em erro vinculados à cobrança encerrada (marcar como resolvidos/encerrados).
  - Corrigir estados órfãos de boleto para não reaparecerem como problema ativo.
- Isso será feito por operação controlada (não destrutiva por padrão), com logs.

6) Política de exclusão segura (importante)
- Faturas: não excluir fisicamente por padrão; usar cancelamento comercial (`cancelled`) para preservar integridade financeira.
- NFS-e de erro: priorizar “resolver” em vez de deletar; delete apenas em exceções técnicas com justificativa.
- Tudo com auditoria obrigatória.

7) Validação e critérios de aceite
- Viapiana não aparece mais como “vencida” após encerramento correto.
- Viapiana não aparece mais como “erro ativo” em NFS-e após resolução.
- Painel de erros mostra apenas pendências reais (não resolvidas).
- Novo fluxo exige motivo e deixa trilha em auditoria.
- Reprocessamentos futuros não retornam erro de tributos ausentes no mesmo cenário.

8) Riscos e mitigação
- Risco: confundir “cancelar boleto” com “cancelar cobrança”.
  - Mitigação: rotular ações com clareza e separar no UI.
- Risco: exclusão de histórico fiscal importante.
  - Mitigação: padrão é resolução/cancelamento lógico, não delete físico.
- Risco: regressão em fluxos de contrato/listas.
  - Mitigação: invalidar caches corretos e validar telas de Faturas, Erros, Contratos e NFS-e.

9) Sequência de implementação
1. Ajustar hook central (`useInvoiceActions`) para saneamento completo da fatura problemática.
2. Expor as novas ações no Painel de Erros e menus de fatura/contrato.
3. Corrigir fluxo de resolução de erro NFS-e (status resolvido + auditoria).
4. Reforçar backend de emissão/reemissão com tributos consistentes.
5. Rodar saneamento inicial dos casos já quebrados (incluindo Viapiana).
6. Validar ponta a ponta nas abas: Faturas, Erros (NFS-e/Boletos), Contratos.

Resultado esperado
- Você terá um fluxo operacional claro para “retirar da frente” cobranças/notas problemáticas com segurança.
- Os erros atuais da Viapiana serão saneados.
- A reincidência cai porque emissão/reemissão e estados passam a ser tratados de forma consistente.
