
# Relatório de Auditoria: Sistema de Emissão de Notas Fiscais

## Resumo Executivo

Este relatório apresenta uma análise completa do processo de emissão de notas fiscais de serviço (NFS-e) utilizando a API Asaas, identificando pontos de falha, propondo melhorias de monitoramento e estabelecendo um plano de ação.

---

## 1. Mapeamento do Fluxo Atual

### 1.1 Fluxo de Emissão de NFS-e (Serviços)

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FLUXO DE EMISSÃO NFS-e                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [1] USUÁRIO                [2] FRONTEND              [3] EDGE FUNCTION         │
│  ───────────                ───────────               ─────────────────         │
│  Clica "Emitir"  ────────►  Valida campos  ─────────► asaas-nfse/emit          │
│                             localmente                                          │
│                                                       │                         │
│                                                       ▼                         │
│  [4] BANCO LOCAL           [5] API ASAAS             [6] WEBHOOK                │
│  ──────────────            ──────────────            ────────────               │
│  nfse_history   ◄───────   POST /invoices  ─────────► webhook-asaas-nfse       │
│  status="processando"      (cria NFS-e)               (status updates)          │
│                                                                                 │
│                                                       │                         │
│                                                       ▼                         │
│  [7] FALLBACK POLLING      [8] RESULTADO FINAL                                  │
│  ────────────────────      ────────────────────                                 │
│  poll-asaas-nfse-status    status="autorizada" ou "erro"                       │
│  (cada 1 hora)             numero_nfse preenchido                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes do Sistema

| Componente | Função | Arquivo |
|------------|--------|---------|
| Frontend - Dialog Avulsa | Formulário de emissão standalone | `NfseAvulsaDialog.tsx` |
| Frontend - Dialog Fatura | Emissão vinculada a fatura | `EmitNfseDialog.tsx` |
| Edge Function - Emit | Orquestra emissão | `asaas-nfse/index.ts` |
| Webhook | Recebe atualizações | `webhook-asaas-nfse/index.ts` |
| Polling Fallback | Recupera status perdidos | `poll-asaas-nfse-status/index.ts` |
| Banco de Dados | Histórico de notas | `nfse_history` |

---

## 2. Pontos de Falha Identificados

### 2.1 Falhas Críticas (Causam Registros Órfãos)

| ID | Ponto de Falha | Impacto | Status Atual |
|----|----------------|---------|--------------|
| F01 | Erro na API Asaas durante criação | Registro fica em "processando" eternamente | **CORRIGIDO** (try/catch implementado) |
| F02 | Webhook não entregue | Status não atualizado | Parcialmente mitigado pelo polling |
| F03 | Falha silenciosa no polling | Registros órfãos não detectados | **CORRIGIDO** (detecção de órfãos) |

### 2.2 Falhas de Validação (Erros Preveníveis)

| ID | Ponto de Falha | Descrição | Mitigação Atual |
|----|----------------|-----------|-----------------|
| V01 | `invalid_fiscal_info` | Dados fiscais incompletos no Asaas | Alerta visual no dialog |
| V02 | CNPJ/CPF inválido | Documento do cliente malformado | Validação local básica |
| V03 | Valor zero ou negativo | Valor do serviço inválido | Validação no frontend |
| V04 | Código de serviço inexistente | Serviço municipal não encontrado | Combobox com lista da API |

### 2.3 Falhas de Infraestrutura

| ID | Ponto de Falha | Descrição | Impacto |
|----|----------------|-----------|---------|
| I01 | Timeout na API Asaas | Requisição demora >30s | Erro genérico, sem retry |
| I02 | Webhook secret não configurado | Autenticação falha | Webhooks rejeitados (fail-closed) |
| I03 | Armazenamento PDF/XML falha | Upload para storage falha | Arquivos não disponíveis |

### 2.4 Cenários de Erro Mapeados

```text
CENÁRIO 1: Dados Fiscais Incompletos
├── Gatilho: Usuário não configurou dados fiscais no Asaas
├── Resposta Atual: Erro 400 "invalid_fiscal_info"
├── Comportamento: Registro marcado como "erro"
└── Problema: Usuário precisa ir ao Asaas manualmente

CENÁRIO 2: Cliente sem CPF/CNPJ
├── Gatilho: Campo "document" vazio no cliente
├── Resposta Atual: Erro ao criar customer no Asaas
├── Comportamento: Registro marcado como "erro"
└── Problema: Mensagem técnica, pouco compreensível

CENÁRIO 3: Webhook Perdido
├── Gatilho: Asaas envia webhook mas função falha
├── Resposta Atual: Status permanece "processando"
├── Comportamento: Polling corrige após 1 hora
└── Problema: Delay de até 1 hora na atualização

CENÁRIO 4: Nota Autorizada mas Arquivos Falharam
├── Gatilho: PDF/XML não baixados corretamente
├── Resposta Atual: Status "autorizada" mas sem arquivos
├── Comportamento: Campos pdf_url/xml_url vazios
└── Problema: Usuário não consegue baixar documentos
```

---

## 3. Proposta: Sistema de Logs por Nota Fiscal

### 3.1 Nova Tabela: `nfse_event_logs`

```sql
CREATE TABLE nfse_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfse_history_id UUID NOT NULL REFERENCES nfse_history(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'created', 'api_call', 'api_response', 'webhook', 'status_change', 'error', 'file_download'
  event_level TEXT NOT NULL DEFAULT 'info',  -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  details JSONB,  -- payload, response, error details
  correlation_id TEXT,  -- para rastrear fluxo completo
  source TEXT,  -- 'frontend', 'asaas-nfse', 'webhook-asaas-nfse', 'poll-asaas-nfse-status'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nfse_event_logs_nfse_id ON nfse_event_logs(nfse_history_id);
CREATE INDEX idx_nfse_event_logs_created ON nfse_event_logs(created_at DESC);
```

### 3.2 Tipos de Eventos a Registrar

| Tipo | Descrição | Exemplo de Mensagem |
|------|-----------|---------------------|
| `created` | Registro criado no sistema | "NFS-e iniciada para cliente X, valor R$ 1.000,00" |
| `api_call` | Chamada enviada para Asaas | "Enviando requisição POST /invoices" |
| `api_response` | Resposta recebida do Asaas | "Resposta 201: invoice_id=inv_abc123" |
| `api_error` | Erro na chamada de API | "Erro 400: invalid_fiscal_info - Configure dados fiscais" |
| `webhook` | Evento recebido via webhook | "Webhook recebido: INVOICE_AUTHORIZED" |
| `status_change` | Mudança de status | "Status alterado: processando → autorizada" |
| `file_download` | Download de arquivo | "PDF baixado e salvo em nfse/abc.pdf" |
| `retry` | Tentativa de reprocessamento | "Reprocessamento iniciado pelo usuário" |
| `cancelled` | Cancelamento | "NFS-e cancelada pelo usuário" |

### 3.3 Interface de Usuário - Menu "Logs"

**Localização**: Ao lado do status da NFS-e na tabela de listagem

**Design Proposto**:
```text
┌─────────────────────────────────────────────────────────────────┐
│  Logs da NFS-e #12345                                      [X] │
├─────────────────────────────────────────────────────────────────┤
│  🕐 19/01/2026 14:32:45 [INFO]                                  │
│  ✓ NFS-e iniciada para Cliente ACME Ltda                       │
│    Valor: R$ 1.500,00 | Competência: Janeiro/2026              │
│                                                                 │
│  🕐 19/01/2026 14:32:46 [INFO]                                  │
│  → Enviando para API Asaas (POST /invoices)                    │
│    Correlation: asaas-1705678365432-a1b2c3                     │
│                                                                 │
│  🕐 19/01/2026 14:32:47 [ERROR]                                 │
│  ✗ Erro na API Asaas (HTTP 400)                                │
│    Código: invalid_fiscal_info                                  │
│    Mensagem: Você precisa informar suas informações fiscais    │
│              antes de emitir notas fiscais de serviço          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  💡 SOLUÇÃO: Acesse o painel Asaas → Minha Conta → Dados       │
│     Fiscais e complete o cadastro (CNPJ, IM, Regime).          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Componente Frontend: `NfseEventLogsDialog.tsx`

Novo componente que exibe a timeline de eventos de uma NFS-e específica:
- Timeline vertical com ícones coloridos por tipo
- Expansão para detalhes técnicos (JSON)
- Mensagens traduzidas para português
- Sugestões de resolução para erros comuns

---

## 4. Análise: Notas de Produto (NF-e)

### 4.1 Limitação da API Asaas

A API Asaas é especializada em **notas de serviço (NFS-e)** e **não suporta** emissão de notas de produto (NF-e).

| Tipo | Asaas Suporta? | Alternativa |
|------|----------------|-------------|
| NFS-e (Serviços) | SIM | - |
| NF-e (Produtos) | NÃO | Integração com outro provedor |
| NFC-e (Consumidor) | NÃO | Integração com outro provedor |

### 4.2 Recomendação para NF-e de Produtos

Para emissão de NF-e de produtos, seria necessário:

1. **Integração com API Nacional (SEFAZ)**: Complexa, requer certificado A1, assinatura XML
2. **Provedor SaaS**: Serviços como Enotas, Focus NFe, Plugnotas
3. **ERP Integrado**: Sistemas como Bling, Tiny ERP

**Decisão Recomendada**: Manter foco em NFS-e via Asaas. NF-e de produtos requer projeto separado.

---

## 5. Plano de Ação

### Fase 1: Infraestrutura de Logs (Estimativa: 4-6 horas)

| Tarefa | Descrição | Prioridade |
|--------|-----------|------------|
| 1.1 | Criar tabela `nfse_event_logs` com RLS | Alta |
| 1.2 | Criar função helper `log_nfse_event()` na Edge Function | Alta |
| 1.3 | Instrumentar `asaas-nfse/index.ts` com logs em cada etapa | Alta |
| 1.4 | Instrumentar `webhook-asaas-nfse/index.ts` | Alta |
| 1.5 | Instrumentar `poll-asaas-nfse-status/index.ts` | Média |

### Fase 2: Interface de Usuário (Estimativa: 3-4 horas)

| Tarefa | Descrição | Prioridade |
|--------|-----------|------------|
| 2.1 | Criar componente `NfseEventLogsDialog.tsx` | Alta |
| 2.2 | Adicionar botão "Logs" na tabela de NFS-e | Alta |
| 2.3 | Integrar no `NfseDetailsSheet.tsx` | Média |
| 2.4 | Adicionar ícone de alerta para notas com erro | Média |

### Fase 3: Notificações Proativas (Estimativa: 2-3 horas)

| Tarefa | Descrição | Prioridade |
|--------|-----------|------------|
| 3.1 | Criar notificação push/toast imediata para erros | Alta |
| 3.2 | Adicionar badge contador de erros no menu Faturamento | Média |
| 3.3 | Email digest diário com NFS-e com problemas | Baixa |

### Fase 4: Robustez e Recuperação (Estimativa: 2-3 horas)

| Tarefa | Descrição | Prioridade |
|--------|-----------|------------|
| 4.1 | Implementar retry automático (máx 3 tentativas) | Média |
| 4.2 | Botão "Tentar Novamente" com feedback detalhado | Alta |
| 4.3 | Reduzir intervalo de polling de órfãos para 15 min | Média |

---

## 6. Códigos de Erro e Mensagens Amigáveis

### Mapeamento de Erros Asaas → Mensagens Usuário

| Código Asaas | Mensagem Técnica | Mensagem Amigável | Ação Sugerida |
|--------------|------------------|-------------------|---------------|
| `invalid_fiscal_info` | Dados fiscais não configurados | Seus dados fiscais não estão completos no Asaas | Acesse o painel Asaas e complete o cadastro fiscal |
| `invalid_customer` | CPF/CNPJ inválido | O CPF ou CNPJ do cliente está inválido | Edite o cliente e corrija o documento |
| `insufficient_balance` | Saldo insuficiente | Sua conta Asaas não tem saldo | Adicione créditos na conta Asaas |
| `city_not_integrated` | Cidade não integrada | Sua cidade não está integrada ao Asaas | Contate o suporte Asaas |
| `invalid_value` | Valor inválido | O valor informado é inválido | Verifique o valor da nota |

---

## 7. Métricas de Sucesso

Após implementação, monitorar:

| Métrica | Meta | Como Medir |
|---------|------|------------|
| Registros órfãos | Zero | Query: `status='processando' AND updated_at < now() - interval '2 hours'` |
| Tempo médio de resolução de status | < 5 minutos | Diferença entre `created_at` e `data_autorizacao` |
| Erros não notificados | Zero | Ausência de reclamações de usuário |
| Consultas no log por nota | > 0 para notas com erro | Tracking de uso do componente de logs |

---

## 8. Arquivos a Serem Criados/Modificados

### Novos Arquivos
1. `src/components/billing/nfse/NfseEventLogsDialog.tsx` - Dialog de logs
2. Migração SQL para `nfse_event_logs`

### Arquivos a Modificar
1. `supabase/functions/asaas-nfse/index.ts` - Adicionar chamadas de log
2. `supabase/functions/webhook-asaas-nfse/index.ts` - Adicionar chamadas de log
3. `supabase/functions/poll-asaas-nfse-status/index.ts` - Adicionar chamadas de log
4. `src/components/billing/BillingNfseTab.tsx` - Adicionar botão de logs na tabela
5. `src/components/billing/nfse/NfseDetailsSheet.tsx` - Integrar visualização de logs

---

## Conclusão

O sistema atual possui uma base sólida para emissão de NFS-e via Asaas, com tratamento de erros recentemente implementado. As principais melhorias propostas focam em:

1. **Visibilidade**: Sistema de logs detalhado por nota fiscal
2. **Proatividade**: Notificações imediatas de erros
3. **Clareza**: Mensagens amigáveis e ações sugeridas
4. **Robustez**: Retry automático e recuperação de falhas

A implementação completa requer aproximadamente **11-16 horas** de desenvolvimento, podendo ser executada em fases priorizando a infraestrutura de logs e interface de usuário.
