
# Melhorias 7-12: Checklist, Retencao Fiscal, Testes, Relatorios, UX NFS-e e SLA

Este plano cobre seis melhorias complementares que abrangem documentacao operacional, conformidade fiscal, testes, relatorios financeiros, UX de reemissao e gestao de incidentes.

---

## 7. Checklist Operacional e Playbook de Implantacao

### O que sera feito
Criar um documento Markdown completo (`DEPLOYMENT_PLAYBOOK.md`) com passo a passo para implantacao, cobrindo:

**Conteudo do documento:**
- Pre-requisitos (secrets, certificados, DNS)
- Configuracao de integracoes (Banco Inter, Asaas, SMTP, Evolution API, Telegram, CheckMK, Tactical RMM)
- Configuracao de CRONs (`pg_cron` jobs)
- Testes de validacao pos-deploy (checklist com comandos curl para edge functions)
- Runbook de troubleshooting para erros comuns
- Procedimento de onboarding de novo cliente (cadastro, contrato, primeiro faturamento)
- Treinamento basico para time financeiro e suporte

**Arquivo:** `DEPLOYMENT_PLAYBOOK.md` (novo, raiz do projeto)

---

## 8. Politica de Retencao e Backup de Arquivos Fiscais

### O que sera feito
Implementar lifecycle rules e documentar politica de retencao para o bucket `nfse-files`.

**Migracao SQL:**
- Criar tabela `storage_retention_policies` com campos: `bucket_name`, `retention_days` (default 2555 = 7 anos), `backup_enabled`, `last_audit_at`
- Inserir registro para bucket `nfse-files` com retencao de 7 anos
- Criar funcao RPC `audit_storage_retention` que verifica arquivos antigos e registra em `audit_logs`

**Documentacao:**
- Adicionar secao "Politica de Retencao Fiscal" ao `DEPLOYMENT_PLAYBOOK.md`
- Descrever SLA de disponibilidade (99.9% via Supabase Storage)
- Procedimento de restauracao: URLs assinadas, re-download via Asaas API

**Frontend:**
- Adicionar card "Retencao Fiscal" no `IntegrationHealthDashboard.tsx` mostrando:
  - Total de arquivos no bucket `nfse-files`
  - Arquivo mais antigo
  - Status de compliance (verde se todos < 7 anos)

---

## 9. Ambiente de Homologacao e Testes E2E Fiscais

### O que sera feito
Criar mocks e fixtures para testes de integracao das edge functions fiscais.

**Arquivos de teste (novos):**

`supabase/functions/asaas-nfse/asaas-nfse_test.ts`
- Mock de respostas Asaas (emit, status, cancel)
- Teste: emissao com sucesso retorna `invoice_id`
- Teste: polling retorna status `autorizada` com PDF/XML
- Teste: erro E0014 (DPS duplicada) retorna mensagem formatada
- Teste: cancelamento com motivo obrigatorio

`supabase/functions/banco-inter/banco-inter_test.ts`
- Mock de OAuth token exchange
- Teste: geracao de boleto retorna `codigoSolicitacao`
- Teste: polling com `readToken` retorna barcode e PDF URL
- Teste: fallback de escopo combinado

**Nota:** Estes testes usam `Deno.test()` e podem ser executados via `supabase--test-edge-functions`. Usam fetch mocks para simular respostas das APIs externas sem chamadas reais.

---

## 10. Relatorios e KPIs para Adicionais e Notas Avulsas

### O que sera feito
Adicionar aba "Adicionais" ao `ReportsPage.tsx` com metricas de adicionais pontuais e notas avulsas.

**Migracao SQL:**
Criar RPC `get_additional_charges_report(start_date, end_date)` que retorna:
- Total de adicionais por cliente (nome, quantidade, valor total)
- Total de notas avulsas por cliente
- Comparativo mensal (adicionais vs receita recorrente)
- Clientes com mais de 3 avulsas no periodo (candidatos a contrato)

**Frontend:**
- Adicionar aba "Adicionais" ao `TabsList` em `ReportsPage.tsx`
- Card: "Total de Adicionais no Periodo" (valor e quantidade)
- Card: "Total de Notas Avulsas" (valor e quantidade)
- Tabela: ranking de clientes por valor de adicionais
- Alerta visual: clientes com muitos avulsos (icone `TrendingUp` + sugestao de migrar para contrato)
- Grafico de barras: adicionais por mes (ultimos 6 meses)

---

## 11. UX de Reemissao e Vinculacao de NFS-e (E0014)

### O que sera feito
Melhorar o fluxo existente de vinculacao de notas externas no `NfseDetailsSheet.tsx`.

**Alteracoes em `NfseDetailsSheet.tsx`:**
- No dialog de "Vincular Nota Existente", adicionar campo de busca por CPF/CNPJ do cliente (pre-preenchido)
- Adicionar campo opcional para numero do RPS
- Exibir alerta explicativo sobre o que e o erro E0014 e por que a vinculacao e necessaria
- Adicionar campo de justificativa obrigatoria (para auditoria) ao vincular
- Registrar evento `vinculacao_manual` em `nfse_event_logs` com justificativa

**Alteracoes na edge function `asaas-nfse/index.ts`:**
- Na action `link_external`: alem de atualizar status para `autorizada`, registrar na `nfse_event_logs` com tipo `vinculacao_manual` e incluir justificativa recebida
- Tentar consultar dados da nota no Asaas pelo numero externo para preencher `pdf_url` e `xml_url` automaticamente

**Novo componente `src/components/billing/nfse/NfseLinkExternalDialog.tsx`:**
- Extrair o dialog de vinculacao do `NfseDetailsSheet` para componente independente
- Formulario com: numero da nota, CPF/CNPJ (readonly), justificativa (obrigatoria, min 15 chars)
- Preview dos dados que serao atualizados antes de confirmar
- Reutilizavel tanto no Sheet quanto na listagem de NFS-e

---

## 12. SLA e Processo de Tratamento de Incidentes Financeiros

### O que sera feito
Criar runbook de incidentes e integrar com o sistema de tickets e alertas.

**Documentacao (`DEPLOYMENT_PLAYBOOK.md` - secao nova):**
- SLAs definidos:
  - Falha de emissao NFS-e: resolucao em 4h uteis
  - Falha de geracao de boleto: resolucao em 2h uteis
  - Falha de envio ao cliente: resolucao em 24h
  - Erro E0014 (duplicidade): resolucao em 48h
- Playbook de escalonamento: financeiro -> admin -> desenvolvedor
- Templates de comunicacao para cada tipo de incidente

**Migracao SQL:**
Criar tabela `financial_incident_slas` com:
- `incident_type` (enum: nfse_failure, boleto_failure, send_failure, e0014)
- `resolution_hours` (integer)
- `escalation_role` (text)
- `notification_template` (text)
- `is_active` (boolean)
- Inserir registros iniciais com SLAs padrao

**Frontend (`src/components/billing/IntegrationHealthDashboard.tsx`):**
- Adicionar secao "Incidentes Abertos" que cruza:
  - Faturas com `boleto_status = 'erro'` ou `nfse_status = 'erro'` nas ultimas 48h
  - Tempo desde a falha vs SLA definido
  - Badge vermelho se SLA estourado, amarelo se proximo do limite
- Botao "Criar Ticket" que abre formulario pre-preenchido com dados do incidente

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `DEPLOYMENT_PLAYBOOK.md` | Novo - checklist completo de implantacao |
| `src/components/billing/IntegrationHealthDashboard.tsx` | Adicionar cards de retencao fiscal e incidentes SLA |
| `src/pages/reports/ReportsPage.tsx` | Adicionar aba "Adicionais" com KPIs |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Melhorar dialog de vinculacao E0014 |
| `src/components/billing/nfse/NfseLinkExternalDialog.tsx` | Novo - dialog de vinculacao independente |
| `supabase/functions/asaas-nfse/index.ts` | Melhorar action `link_external` com auditoria |
| `supabase/functions/asaas-nfse/asaas-nfse_test.ts` | Novo - testes E2E com mocks |
| `supabase/functions/banco-inter/banco-inter_test.ts` | Novo - testes E2E com mocks |
| Migracoes SQL | `storage_retention_policies`, `get_additional_charges_report` RPC, `financial_incident_slas` |

## Ordem de Implementacao

1. Migracoes SQL (tabelas e RPCs)
2. `DEPLOYMENT_PLAYBOOK.md` (documentacao completa)
3. Relatorios de adicionais (item 10) - RPC + frontend
4. UX de vinculacao NFS-e (item 11) - componente + edge function
5. Dashboard de incidentes SLA (item 12) - frontend
6. Testes E2E (item 9) - edge function tests
