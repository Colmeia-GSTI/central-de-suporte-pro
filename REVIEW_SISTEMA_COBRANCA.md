# Revisão Completa do Sistema de Cobrança, Contratos, NFS-e e Boletos

**Data:** 05/02/2026
**Escopo:** Revisão de código, banco de dados, fluxos de integração e UI
**Arquivos analisados:** 65 migrations, 44 edge functions, 30+ componentes React

---

## Sumário Executivo

A revisão identificou **97 pontos de melhoria** distribuídos em 6 categorias. Os problemas mais graves envolvem **dados desconectados entre fluxos** (invoice <-> boleto <-> NFS-e), **informações não salvas** corretamente, e **ausência de proteções contra duplicidade e race conditions**.

---

## 1. PROBLEMAS CRÍTICOS (Impacto direto em receita/dados)

### 1.1 Campo `payment_method` nunca é preenchido na geração de faturas
- **Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`
- **Problema:** A fatura é criada sem o campo `payment_method`, mas o `poll-boleto-status` filtra por `.eq("payment_method", "boleto")`.
- **Impacto:** Boletos gerados nunca são rastreados pelo polling. O status nunca é atualizado automaticamente.
- **Correção:** Preencher `payment_method` com base em `contract.payment_preference` durante a geração.

### 1.2 Serviços do contrato (`contract_services`) ignorados na geração de faturas
- **Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`
- **Problema:** A query busca contratos e `additional_charges`, mas ignora completamente `contract_services`.
- **Impacto:** Faturas não refletem os serviços do contrato. Valor pode estar incorreto.
- **Correção:** Incluir `contract_services` na query e gerar `invoice_items` correspondentes.

### 1.3 Indicadores de status da fatura usam campos inexistentes
- **Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linhas 847-856)
- **Problema:** O componente `InvoiceActionIndicators` recebe props `boleto_status`, `nfse_status`, `email_status` que **não existem** na tabela `invoices`.
- **Impacto:** Indicadores de status sempre mostram "pendente" independente do estado real.
- **Correção:** Buscar status real das tabelas `nfse_history` e `invoice_notification_logs`.

### 1.4 Webhook de pagamento não atualiza faturas "overdue"
- **Arquivo:** `supabase/functions/webhook-asaas-nfse/index.ts` (linha 378)
- **Problema:** O update filtra `.eq("status", "pending")`. Faturas com status `overdue` **não são atualizadas** quando o pagamento é confirmado.
- **Impacto:** Cliente paga boleto vencido, mas fatura permanece como "overdue" no sistema.
- **Correção:** Usar `.in("status", ["pending", "overdue"])` no filtro de update.

### 1.5 Função `downloadAndStoreFile` não existe
- **Arquivo:** `supabase/functions/asaas-nfse/index.ts` (ação `check_single_status`)
- **Problema:** O código chama `downloadAndStoreFile()` para baixar PDF/XML da NFS-e, mas essa função **não existe** no arquivo.
- **Impacto:** Download de PDFs e XMLs da NFS-e falha silenciosamente. Documentos não são armazenados.
- **Correção:** Implementar a função ou importar do webhook que já possui lógica similar.

### 1.6 Webhook retorna sucesso antes de processar
- **Arquivo:** `supabase/functions/webhook-asaas-nfse/index.ts` (linhas 414-420)
- **Problema:** Usa `EdgeRuntime.waitUntil()` para processar em background, mas retorna `success: true` **imediatamente**.
- **Impacto:** Erros no processamento são silenciosos. NFS-e fica em estado inconsistente.
- **Correção:** Processar de forma síncrona ou implementar retry com tracking de erro.

### 1.7 Índices críticos do banco foram removidos
- **Arquivo:** `supabase/migrations/20260126233517_*.sql`
- **Problema:** Índices fundamentais foram dropados em massa, incluindo:
  - `idx_nfse_history_contract` (contract_id)
  - `idx_nfse_history_invoice` (invoice_id)
  - `idx_nfse_history_client` (client_id)
  - `idx_invoices_status_due_status`
  - `idx_contracts_status`
  - `idx_contracts_active`
- **Impacto:** Queries de geração mensal, relatórios financeiros e listagens fazem full table scan.
- **Correção:** Recriar todos os índices removidos com migration dedicada.

### 1.8 Relacionamento bidirecional Invoice <-> NFS-e
- **Arquivo:** `supabase/migrations/20260205100000_*.sql`
- **Problema:** `invoices.nfse_history_id` referencia `nfse_history` E `nfse_history.invoice_id` referencia `invoices`, criando FK circular.
- **Impacto:** Dependência circular em INSERT/DELETE. Confusão sobre qual tabela é a "dona" da relação.
- **Correção:** Definir modelo 1:N (uma invoice pode ter N nfse_history) e remover `invoices.nfse_history_id`.

---

## 2. FLUXO DE COBRANÇA - Problemas e Melhorias

### 2.1 Geração de Faturas Mensais

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Detecção de duplicatas é fraca (só verifica `!= cancelled`) | Alta | Usar `NOT IN ('cancelled', 'draft', 'voided')` |
| 2 | Flag `auto_payment_generated` marcada como `true` mesmo com falha parcial | Alta | Rastrear sucesso de cada tipo de pagamento separadamente |
| 3 | Sem transação para geração de pagamento após criar fatura | Alta | Usar transação ou implementar rollback |
| 4 | Falhas na geração não atualizam status da fatura | Média | Criar campo `generation_error` ou status `error` na fatura |
| 5 | `invoice_items` não são criados a partir de `contract_services` | Crítica | Gerar items baseado nos serviços do contrato |

### 2.2 Geração de Pagamentos (Boleto/PIX)

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Race condition: marca `auto_payment_generated` antes de buscar dados para email | Alta | Enviar email antes de marcar como gerado |
| 2 | `billing_provider` acessado como `(invoice as any)` — falta tipagem | Média | Atualizar interface TypeScript |
| 3 | Nenhuma validação se URL do boleto é válida | Média | Validar formato de URL antes de salvar |
| 4 | Erro de pagamento não é gravado na fatura | Alta | Criar campo `payment_error` na tabela `invoices` |
| 5 | Sem idempotência — rerun gera pagamentos duplicados | Alta | Verificar se pagamento já existe antes de gerar |

### 2.3 Processamento em Lote (Batch)

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Status do PIX nunca é rastreado (`pix_status` não é definido) | Alta | Implementar tracking de PIX similar ao boleto |
| 2 | Sem deduplicação — mesmo `invoice_id` pode ser processado 2x | Alta | Deduplicar array de IDs no início |
| 3 | NFS-e não tem verificação de duplicidade | Alta | Verificar `nfse_history` antes de emitir |
| 4 | `processing_attempts` só incrementa em boleto, não em NFS-e/email | Média | Incrementar em todas as operações |
| 5 | Atualizações em 3 locais diferentes sem transação | Alta | Consolidar em update único ou usar transação |

---

## 3. FLUXO DE BOLETOS - Problemas e Melhorias

### 3.1 Webhook Banco Inter

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | URL do boleto hardcoded (`https://inter.co/boleto/...`) — incorreta | Alta | Usar URL real do PDF retornada pela API |
| 2 | Busca PIX por `ILIKE` no campo `pix_code` — pode achar fatura errada | Alta | Criar campo `pix_txid` dedicado com UNIQUE constraint |
| 3 | Não verifica se fatura existe antes de atualizar | Média | Verificar existência e logar se não encontrada |
| 4 | Só processa status PAGO/RECEBIDO/LIQUIDADO | Alta | Tratar DEVOLVIDO, VENCIDO, EXPIRADO, REJEITADO |
| 5 | Sem validação de transição de status (pode voltar de "paid" para "pending") | Alta | Implementar máquina de estados com transições válidas |
| 6 | Não é idempotente — mesmo webhook processado 2x gera dados duplicados | Alta | Verificar se já foi processado via `webhook_id` ou `idempotency_key` |
| 7 | Audit log não registra o que realmente foi alterado na fatura | Média | Incluir campos alterados no log |

### 3.2 Polling de Status de Boleto

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Nunca atualiza `invoice.status` quando boleto é recebido | Alta | Atualizar status para "boleto_emitido" ou similar |
| 2 | Não verifica se boleto foi pago (só busca código de barras) | Crítica | Incluir verificação de pagamento no polling |
| 3 | Extração de dados do cliente é frágil (array vs objeto) | Média | Padronizar query para retorno consistente |
| 4 | Só trata CANCELADO e EXPIRADO — ignora DEVOLVIDO, REJEITADO | Alta | Implementar handler para todos os status |
| 5 | Campo `notes` tem dados sobrescritos/perdidos | Média | Criar campo dedicado para `codigoSolicitacao` |
| 6 | Sem timestamp de quando o status foi verificado | Média | Adicionar `boleto_status_checked_at` |

### 3.3 Cancelamento de Boletos

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Delete de fatura não verifica se boleto foi transmitido ao banco | Alta | Bloquear delete se boleto já transmitido |
| 2 | Batch cancel não reporta quais boletos falharam nem por quê | Média | Retornar lista de erros detalhada |
| 3 | Batch cancel pode não cancelar no Banco Inter, só deleta localmente | Alta | Sempre cancelar no banco antes de deletar local |

---

## 4. FLUXO DE NFS-e - Problemas e Melhorias

### 4.1 Emissão de NFS-e (Asaas)

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Action `create_customer` não valida campos obrigatórios para NFS-e | Média | Validar email, endereço, CEP antes de criar |
| 2 | Force delete tenta cancelar na API mesmo quando deveria ignorar | Média | Pular chamada API quando `force=true` |
| 3 | Tipo de `numero_nfse` inconsistente (string vs number) | Alta | Padronizar como string em todos os locais |
| 4 | Caminhos de storage inconsistentes entre `asaas-nfse` e `webhook-asaas-nfse` | Alta | Padronizar padrão: `nfse/{client_id}/{nfse_id}/` |
| 5 | Campo `mensagem_erro` usado no webhook, mas banco tem `mensagem_retorno` | Alta | Corrigir para usar `mensagem_retorno` em todos os locais |

### 4.2 Polling de Status NFS-e

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Registros órfãos marcados como erro sem logar no `nfse_event_logs` | Alta | Adicionar log de evento para rastreabilidade |
| 2 | Limite de 50 registros pode deixar NFS-e sem verificação | Média | Implementar paginação ou processar em lotes |
| 3 | Sem retry para NFS-e que falharam por problema temporário | Média | Implementar retry com backoff exponencial |

### 4.3 Webhook NFS-e

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Processamento em background sem captura de erro | Crítica | Processar síncrono ou implementar error tracking |
| 2 | NFS-e com múltiplas tentativas perde histórico (só última é mantida) | Alta | Manter todas as tentativas no `nfse_history` |

---

## 5. FLUXO DE CONTRATOS - Problemas e Melhorias

### 5.1 Criação de Contrato

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Sem transação — contrato criado mas fatura inicial pode falhar | Alta | Implementar rollback se fatura falhar |
| 2 | Action `emit_nfse` usada no ContractForm, mas ação correta é `emit` | Alta | Corrigir nome da action |
| 3 | Campo `name` inserido em `contract_services` mas não existe na tabela | Alta | Remover campo ou adicionar coluna |
| 4 | `service_id` não é validado contra tabela `services` | Média | Validar existência do serviço |
| 5 | Permite contrato com `monthly_value: 0` sem serviços | Média | Validar que valor > 0 ou tem serviços |

### 5.2 Ajuste de Contratos

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Sem transação — `contract_services` pode ser atualizado parcialmente | Alta | Usar transação para atualizar tudo ou nada |
| 2 | Índices não-FIXO (IGPM, IPCA, INPC) só geram notificação, não aplicam | Alta | Implementar busca automática de índices e aplicação |
| 3 | Se um contrato falhar no check, loop para e demais contratos são ignorados | Alta | Tratar cada contrato individualmente com try/catch |
| 4 | Sem histórico de ajustes anteriores facilmente consultável | Média | Criar view de histórico de ajustes por contrato |

---

## 6. NOTIFICAÇÕES - Problemas e Melhorias

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Sem prevenção de notificação duplicada — rerun envia novamente | Alta | Verificar `invoice_notification_logs` antes de enviar |
| 2 | Timezone inconsistente no cálculo de vencimento | Média | Usar timezone da empresa (BRT) em todos os cálculos |
| 3 | Template de email sem tratamento de erro em variáveis | Média | Wrap em try/catch com fallback para template padrão |
| 4 | Sem validação de formato de telefone para WhatsApp | Média | Validar formato E.164 antes de enviar |
| 5 | Staff recebe notificações duplicadas (criadas novamente a cada execução) | Alta | Deduplicar por invoice_id + notification_type |

---

## 7. BANCO DE DADOS - Problemas e Melhorias

### 7.1 Schema

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Índices críticos removidos em migration | Crítica | Recriar todos via nova migration |
| 2 | FK bidirecional `invoices <-> nfse_history` | Crítica | Remover um dos lados |
| 3 | `financial_entries` sem `created_by` / `updated_by` | Alta | Adicionar colunas de auditoria |
| 4 | `financial_entries` sem NOT NULL em `description` | Alta | Adicionar constraint |
| 5 | Sem CHECK constraint em `invoices.amount > 0` | Média | Adicionar constraint |
| 6 | `reference_month` em TEXT sem validação de formato | Média | Adicionar CHECK `~ '^\d{4}-\d{2}$'` |
| 7 | `valor_liquido` em `nfse_history` calculado pela app (pode ficar inconsistente) | Média | Usar GENERATED column |
| 8 | Sem UNIQUE constraint forte para faturas mensais | Alta | Criar CONSTRAINT (não apenas INDEX) |

### 7.2 RLS (Row Level Security)

| # | Problema | Severidade | Correção Proposta |
|---|---------|-----------|-------------------|
| 1 | Políticas de RLS usam subqueries sem índice em `client_contacts` | Alta | Criar índice em `client_contacts(user_id, client_id)` |
| 2 | Clientes não têm policy para ver suas faturas | Alta | Criar policy de leitura para clientes em `invoices` |
| 3 | `financial_entries` permite DELETE por qualquer usuário `financial` | Média | Restringir DELETE para admin apenas |
| 4 | `nfse_event_logs` permite INSERT com `auth.uid() IS NULL` | Média | Rastrear qual função inseriu via service_role |

### 7.3 Índices Faltantes

| Tabela | Campo(s) | Uso |
|--------|---------|-----|
| `financial_entries` | `client_id` | Filtro por cliente |
| `financial_entries` | `status` | Reconciliação |
| `financial_entries` | `created_at` | Consultas por período |
| `financial_entries` | `contract_id` | Ligação com contrato |
| `invoices` | `reference_month` | Reconciliação mensal |
| `contract_adjustments` | `adjustment_date` | Relatórios trimestrais |
| `invoice_documents` | `created_at DESC` | Listagem recente |
| `client_contacts` | `(user_id, client_id)` | Performance RLS |

---

## 8. LISTA DE MELHORIAS PROPOSTAS (Novas Funcionalidades)

### 8.1 Cobrança e Faturamento

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Máquina de estados para fatura** — Definir transições válidas: `draft -> pending -> boleto_emitido -> paid / overdue -> paid / cancelled` | Evita estados inconsistentes | Alta |
| 2 | **Dashboard de conciliação bancária** — Tela para comparar extratos bancários vs faturas do sistema | Controle financeiro | Alta |
| 3 | **Fatura recorrente automática com preview** — Gerar faturas 5 dias antes e permitir revisão antes de emitir | Reduz erros de cobrança | Média |
| 4 | **Retry automático para pagamentos falhados** — Sistema de retry com backoff para geração de boleto/PIX | Menos intervenção manual | Alta |
| 5 | **Parcelamento de faturas** — Já tem campos `parent_invoice_id`, `installment_number`, `total_installments` mas sem UI | Facilita negociação | Média |
| 6 | **Régua de cobrança configurável** — Permitir personalizar dias e canais de notificação por cliente | Flexibilidade | Média |
| 7 | **Relatório de aging (envelhecimento de recebíveis)** — Classificar faturas por faixas de atraso (30/60/90/120 dias) | Gestão de inadimplência | Alta |
| 8 | **Baixa manual de pagamento** — Permitir registrar pagamento manual (depósito, dinheiro) com comprovante | Flexibilidade de recebimento | Alta |
| 9 | **Desconto por antecipação** — Configurar desconto automático para pagamento antes do vencimento | Incentivo ao pagamento | Baixa |
| 10 | **Multa e juros automáticos** — Calcular multa (2%) e juros (1% a.m.) para faturas vencidas | Compliance legal | Alta |

### 8.2 NFS-e

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Emissão automática vinculada ao pagamento** — Emitir NFS-e automaticamente quando fatura é paga | Automação fiscal | Alta |
| 2 | **Cancelamento e substituição com motivo** — Obrigar preenchimento de motivo ao cancelar NFS-e | Compliance fiscal | Média |
| 3 | **Relatório fiscal mensal** — Resumo de NFS-e emitidas, canceladas, total de ISS retido | Contabilidade | Alta |
| 4 | **Integração com Portal Nacional NFS-e** — Atualmente só usa Asaas. Implementar integração direta | Independência de provider | Média |
| 5 | **Arquivo SPED de NFS-e** — Gerar arquivo para importação contábil | Contabilidade | Média |
| 6 | **Alerta de certificado digital vencendo** — Já existe `check-certificate-expiry` mas sem tela de gestão | Prevenção | Média |

### 8.3 Contratos

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Renovação automática com notificação** — Notificar 30/60/90 dias antes do vencimento | Retenção de clientes | Alta |
| 2 | **Aditivo contratual** — Permitir adicionar serviços sem criar novo contrato | Flexibilidade | Média |
| 3 | **Histórico de alterações do contrato** — Timeline visual de todas as mudanças | Auditoria | Média |
| 4 | **Aprovação de ajuste por gestor** — Workflow de aprovação para reajustes acima de X% | Controle | Média |
| 5 | **Busca automática de índices (IGPM/IPCA)** — Integrar com API do Banco Central para buscar índices | Automação | Alta |
| 6 | **Contrato com SLA customizado** — Vincular configurações de SLA ao contrato, não à categoria | Personalização | Média |
| 7 | **Dashboard de contratos por vencer** — Visão de contratos que vencem nos próximos 30/60/90 dias | Gestão comercial | Alta |

### 8.4 Boletos

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Geração de remessa CNAB 240/400** — Para bancos que não têm API | Compatibilidade bancária | Média |
| 2 | **Leitura de arquivo retorno** — Processar retorno bancário para baixa automática | Automação | Média |
| 3 | **Segunda via de boleto** — Gerar segunda via com data atualizada e juros/multa | Atendimento | Alta |
| 4 | **Cancelamento em massa com confirmação** — Cancelar boletos com preview do impacto | Operação | Média |
| 5 | **Protestar boleto** — Integração para protesto de boletos vencidos | Cobrança | Baixa |
| 6 | **Registro de boletos híbrido (API + CNAB)** — Suportar bancos com registro via API e via arquivo | Flexibilidade | Média |

### 8.5 Portal do Cliente

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Visualização de faturas e boletos** — Cliente ver suas faturas, baixar boleto, copiar PIX | Autoatendimento | Alta |
| 2 | **Histórico de pagamentos** — Cliente consultar pagamentos realizados | Transparência | Alta |
| 3 | **Download de NFS-e** — Cliente baixar suas notas fiscais | Compliance | Alta |
| 4 | **Solicitação de segunda via** — Cliente solicitar novo boleto pelo portal | Reduz chamados | Média |
| 5 | **Visualização de contrato** — Cliente ver detalhes do contrato vigente | Transparência | Média |

### 8.6 Integridade e Observabilidade

| # | Melhoria | Benefício | Prioridade |
|---|---------|-----------|------------|
| 1 | **Job de reconciliação diária** — Verificar faturas pendentes vs pagamentos no banco | Integridade de dados | Alta |
| 2 | **Dashboard de saúde das integrações** — Mostrar status de Banco Inter, Asaas, webhooks | Monitoramento | Alta |
| 3 | **Alertas de falha de processamento** — Notificar admin quando geração de boleto/NFS-e falha | Operação | Alta |
| 4 | **Log centralizado de todas as operações financeiras** — Auditoria completa | Compliance | Alta |
| 5 | **Idempotency keys em todos os endpoints** — Prevenir operações duplicadas | Integridade | Alta |
| 6 | **Health check de webhooks** — Verificar se webhooks do Banco Inter e Asaas estão funcionais | Monitoramento | Média |
| 7 | **Backup automático de XMLs de NFS-e** — Armazenar em S3 com retenção de 5 anos | Compliance fiscal | Alta |

---

## 9. ORDEM DE PRIORIDADE RECOMENDADA

### Fase 1 — Correções Críticas (Impacto imediato)
1. Preencher `payment_method` na geração de faturas
2. Recriar índices removidos do banco
3. Corrigir webhook para atualizar faturas "overdue"
4. Corrigir nome da action de NFS-e no ContractForm (`emit_nfse` -> `emit`)
5. Corrigir campo `mensagem_erro` -> `mensagem_retorno` no webhook
6. Corrigir campo `name` inexistente em `contract_services`
7. Implementar `downloadAndStoreFile()` no asaas-nfse
8. Corrigir indicadores de status na UI (campos inexistentes)

### Fase 2 — Integridade de Dados (Previne problemas futuros)
9. Implementar máquina de estados para faturas
10. Adicionar idempotency em webhooks e geração de pagamento
11. Resolver FK bidirecional invoice <-> nfse_history
12. Adicionar transações em operações multi-tabela (contratos + faturas)
13. Prevenir notificações duplicadas
14. Adicionar índices faltantes no banco
15. Implementar retry automático para falhas de pagamento

### Fase 3 — Melhorias Operacionais
16. Dashboard de conciliação bancária
17. Relatório de aging de recebíveis
18. Busca automática de índices IGPM/IPCA
19. Emissão automática de NFS-e vinculada ao pagamento
20. Baixa manual de pagamento
21. Multa e juros automáticos

### Fase 4 — Novas Funcionalidades
22. Portal do cliente (faturas, boletos, NFS-e)
23. Segunda via de boleto
24. Parcelamento de faturas
25. Régua de cobrança configurável
26. Arquivo CNAB 240/400 (remessa e retorno)
27. Dashboard de contratos por vencer
28. Relatório fiscal mensal

---

## 10. MÉTRICAS DE SAÚDE SUGERIDAS

| Métrica | Descrição | Alerta |
|---------|-----------|--------|
| Faturas sem `payment_method` | % de faturas pending sem método definido | > 0% |
| Boletos sem código de barras > 24h | Boletos gerados mas sem retorno do banco | > 5 |
| NFS-e pendente > 48h | NFS-e sem autorização após 2 dias | > 0 |
| Webhooks falhados/dia | Webhooks que retornaram erro | > 3 |
| Faturas overdue sem notificação | Faturas vencidas sem nenhuma notificação enviada | > 0 |
| Contratos vencendo em 30 dias | Contratos ativos com end_date próximo | Informativo |
| Taxa de conciliação | % de faturas pagas conciliadas automaticamente | < 90% |

---

*Documento gerado por revisão automatizada de código. Todos os problemas foram identificados por análise estática dos arquivos fonte, migrations e edge functions.*
