

# Relatório de Análise e Reestruturação do Sistema de Faturamento

## 1. Diagnóstico do Estado Atual

### 1.1 Arquitetura Existente

O sistema atual apresenta uma estrutura modular bem organizada, porém com algumas lacunas importantes:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITETURA ATUAL                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  CONTRATOS   │───▶│   FATURAS    │───▶│   COBRANÇAS  │                   │
│  │              │    │              │    │  (Boleto/PIX)│                   │
│  │ billing_day  │    │ auto_payment │    │              │                   │
│  │ nfse_enabled │    │ _generated   │    │  banco-inter │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   SERVIÇOS   │    │    NFS-e     │    │ NOTIFICAÇÕES │                   │
│  │              │    │              │    │              │                   │
│  │ contract_    │    │ asaas-nfse   │    │ email/wpp    │                   │
│  │   services   │    │ nfse_history │    │              │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Pontos Fortes Identificados

| Funcionalidade | Status | Observação |
|----------------|--------|------------|
| Geração automática de faturas | Implementado | `generate-monthly-invoices` |
| Boleto/PIX via Banco Inter | Implementado | mTLS, escopo correto |
| NFS-e via Asaas | Implementado | com histórico e logs |
| Notificações Email/WhatsApp | Implementado | templates configuráveis |
| Webhook pagamentos | Implementado | `webhook-banco-inter` |
| Polling fallback | Implementado | otimizado (1h delay) |
| Cobrança em lote | Implementado | `batch-collection-notification` |
| Histórico de contrato | Implementado | `contract_history` |
| Serviços por contrato | Implementado | `contract_services` |

### 1.3 Lacunas Críticas Identificadas

| Funcionalidade | Status | Impacto |
|----------------|--------|---------|
| Reajuste anual de contratos | Não implementado | Alto |
| Valores adicionais pontuais (único mês) | Não implementado | Alto |
| Mensagem personalizada por contrato | Não implementado | Médio |
| Antecedência configurável por contrato | Parcial (global) | Médio |
| Histórico de alteração de serviços | Parcial | Médio |
| Dashboard de sincronização | Não implementado | Baixo |
| Agendamento de geração automática (cron) | Não implementado | Alto |

---

## 2. Análise Detalhada por Módulo

### 2.1 Módulo de Contratos

**Situação Atual:**
- Campos básicos: `name`, `client_id`, `monthly_value`, `start_date`, `end_date`
- Suporte a NFS-e: `nfse_enabled`, `nfse_service_code`, `nfse_descricao_customizada`
- Dia de faturamento: `billing_day` (1-28)
- Preferência de pagamento: `payment_preference` (boleto, pix, both)

**Problemas:**
1. Não há campo para `adjustment_date` (data do próximo reajuste)
2. Não há campo para `adjustment_index` (índice: IGPM, IPCA, percentual fixo)
3. Não há campo para `notification_message` (mensagem personalizada)
4. Não há campo para `days_before_due` (antecedência para geração)

### 2.2 Módulo de Serviços do Contrato

**Situação Atual:**
- Tabela `contract_services`: `service_id`, `quantity`, `unit_value`, `value`
- Ao editar, todos os serviços são deletados e reinseridos

**Problemas:**
1. Não há histórico de quando um serviço entrou ou saiu
2. Não há suporte a "valores adicionais pontuais" (cobrar extra em um único mês)
3. Perda de rastreabilidade de alterações

### 2.3 Módulo de Faturas

**Situação Atual:**
- Geração manual ou via `generate-monthly-invoices`
- Suporte a parcelamento: `parent_invoice_id`, `installment_number`, `total_installments`
- Rastreabilidade: `invoice_generation_log`

**Problemas:**
1. Não há conceito de "competência" na fatura (mês de referência)
2. Não há suporte a adicionais pontuais
3. Não há validação de duplicidade robusta

### 2.4 Módulo de NFS-e

**Situação Atual:**
- Integração com Asaas (preferencial)
- Suporte a API Nacional (backup)
- Histórico completo: `nfse_history` com `nfse_event_logs`
- Substituição e cancelamento implementados

**Pontos Positivos:**
- Fluxo bem estruturado
- Logs detalhados com `correlation_id`
- Pré-visualização antes da emissão

### 2.5 Módulo de Cobranças (Banco Inter)

**Situação Atual:**
- Boleto e PIX via API v3
- mTLS com certificados
- Webhook para confirmação de pagamento
- Polling como fallback

**Pontos Positivos:**
- Arquitetura webhook-first (economia de recursos)
- Fallback apenas para registros > 1 hora
- Suporte a cancelamento de boleto

### 2.6 Módulo de Notificações

**Situação Atual:**
- Email via SMTP
- WhatsApp via Evolution API
- Templates fixos: `reminder`, `urgent`, `final`
- Logs em `message_logs` e `invoice_notification_logs`

**Problemas:**
1. Não há mensagem personalizada por contrato
2. Templates são hardcoded na edge function

---

## 3. Fluxo Ideal Proposto

### 3.1 Fluxograma Revisado

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE FATURAMENTO IDEAL                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     1. CONFIGURAÇÃO DO CONTRATO                      │    │
│  │                                                                      │    │
│  │  • Serviços recorrentes (com histórico de alterações)               │    │
│  │  • Data de reajuste anual + índice (IGPM/IPCA/fixo)                 │    │
│  │  • Dia de faturamento (billing_day)                                 │    │
│  │  • Dias de antecedência para geração (days_before_due)              │    │
│  │  • Preferência de pagamento (boleto/pix/ambos)                      │    │
│  │  • Mensagem personalizada para cobranças                            │    │
│  │  • Configurações de NFS-e (código, descrição, CNAE)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    2. VALORES ADICIONAIS PONTUAIS                    │    │
│  │                                                                      │    │
│  │  • Adicionar valor extra para um mês específico                     │    │
│  │  • Descrição do adicional                                           │    │
│  │  • Aplicado automaticamente na fatura do mês correspondente         │    │
│  │  • Histórico mantido para auditoria                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      3. REAJUSTE ANUAL                               │    │
│  │                                                                      │    │
│  │  • Verificação automática na data de aniversário                    │    │
│  │  • Busca do índice (IGPM/IPCA via API ou manual)                    │    │
│  │  • Aplicação proporcional a todos os serviços                       │    │
│  │  • Registro no histórico do contrato                                │    │
│  │  • Notificação ao cliente (opcional)                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │             4. GERAÇÃO AUTOMÁTICA (X DIAS ANTES)                     │    │
│  │                                                                      │    │
│  │  • CRON: Executar diariamente                                       │    │
│  │  • Verificar contratos cujo (billing_day - days_before) = hoje      │    │
│  │  • Criar fatura com competência do mês                              │    │
│  │  • Incluir valores adicionais do mês                                │    │
│  │  • Gerar Boleto/PIX automaticamente                                 │    │
│  │  • Emitir NFS-e (se habilitado)                                     │    │
│  │  • Enviar notificações (email + WhatsApp)                           │    │
│  │  • Log em invoice_generation_log                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    5. ACOMPANHAMENTO DE PAGAMENTO                    │    │
│  │                                                                      │    │
│  │  • Webhook do Banco Inter (tempo real)                              │    │
│  │  • Polling fallback a cada 6h (registros > 1h)                      │    │
│  │  • Atualização do status: pending → paid                            │    │
│  │  • Notificação interna para equipe                                  │    │
│  │  • Registro de data de pagamento                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     6. SINCRONIZAÇÃO PERIÓDICA                       │    │
│  │                                                                      │    │
│  │  • poll-services: 6h (fallback consolidado)                         │    │
│  │    - Boletos: verificar codigoSolicitacao                           │    │
│  │    - NFS-e: verificar status no Asaas                               │    │
│  │  • Atualização de status overdue (faturas vencidas)                 │    │
│  │  • Limpeza de registros antigos (>30 dias)                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Alterações Propostas no Banco de Dados

### 4.1 Tabela `contracts` - Novos Campos

```sql
ALTER TABLE contracts
ADD COLUMN adjustment_date DATE,              -- Data do próximo reajuste
ADD COLUMN adjustment_index TEXT DEFAULT 'IGPM', -- IGPM, IPCA, INPC, FIXO
ADD COLUMN adjustment_percentage NUMERIC,     -- Percentual fixo (se index = FIXO)
ADD COLUMN days_before_due INTEGER DEFAULT 5, -- Antecedência para gerar fatura
ADD COLUMN notification_message TEXT;         -- Mensagem personalizada para cobranças

COMMENT ON COLUMN contracts.adjustment_date IS 
'Data do próximo reajuste anual (geralmente aniversário do contrato)';

COMMENT ON COLUMN contracts.adjustment_index IS 
'Índice de reajuste: IGPM, IPCA, INPC, FIXO';

COMMENT ON COLUMN contracts.days_before_due IS 
'Quantos dias antes do vencimento a fatura deve ser gerada';

COMMENT ON COLUMN contracts.notification_message IS 
'Mensagem personalizada incluída nas cobranças deste contrato';
```

### 4.2 Nova Tabela `contract_additional_charges`

```sql
CREATE TABLE contract_additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reference_month TEXT NOT NULL, -- Formato: YYYY-MM
  applied BOOLEAN DEFAULT false,
  applied_invoice_id UUID REFERENCES invoices(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_additional_charges_month ON contract_additional_charges(contract_id, reference_month);

ALTER TABLE contract_additional_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage additional charges" ON contract_additional_charges
  FOR ALL USING (is_staff(auth.uid()));

COMMENT ON TABLE contract_additional_charges IS 
'Valores adicionais pontuais a serem cobrados em um mês específico';
```

### 4.3 Nova Tabela `contract_service_history`

```sql
CREATE TABLE contract_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id),
  action TEXT NOT NULL, -- 'added', 'removed', 'updated'
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view service history" ON contract_service_history
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert service history" ON contract_service_history
  FOR INSERT WITH CHECK (is_staff(auth.uid()));
```

### 4.4 Tabela `invoices` - Campo de Competência

```sql
ALTER TABLE invoices
ADD COLUMN reference_month TEXT; -- Formato: YYYY-MM

COMMENT ON COLUMN invoices.reference_month IS 
'Mês de competência da fatura (YYYY-MM)';

-- Índice para evitar duplicidade
CREATE UNIQUE INDEX idx_invoices_contract_month 
ON invoices(contract_id, reference_month) 
WHERE contract_id IS NOT NULL AND status != 'cancelled';
```

### 4.5 Nova Tabela `contract_adjustments`

```sql
CREATE TABLE contract_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  adjustment_date DATE NOT NULL,
  index_used TEXT NOT NULL, -- IGPM, IPCA, etc
  index_value NUMERIC NOT NULL, -- Valor do índice aplicado
  old_monthly_value NUMERIC NOT NULL,
  new_monthly_value NUMERIC NOT NULL,
  applied_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view adjustments" ON contract_adjustments
  FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage adjustments" ON contract_adjustments
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financial'));

COMMENT ON TABLE contract_adjustments IS 
'Histórico de reajustes anuais aplicados aos contratos';
```

---

## 5. Novos Módulos/Componentes Recomendados

### 5.1 Estrutura de Módulos

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MÓDULOS DO SISTEMA                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GESTÃO DE CONTRATOS                                                         │
│  ├── ContractForm.tsx (existente - atualizar)                               │
│  ├── ContractServicesSection.tsx (existente - adicionar histórico)          │
│  ├── ContractAdjustmentDialog.tsx (NOVO)                                    │
│  ├── ContractAdditionalChargeDialog.tsx (NOVO)                              │
│  └── ContractNotificationMessageForm.tsx (NOVO)                             │
│                                                                              │
│  FATURAMENTO                                                                 │
│  ├── BillingPage.tsx (existente)                                            │
│  ├── BillingInvoicesTab.tsx (existente - adicionar competência)             │
│  ├── InvoiceForm.tsx (existente - adicionar competência)                    │
│  └── InvoiceGenerationScheduler.tsx (NOVO - config de CRON)                 │
│                                                                              │
│  INTEGRAÇÕES FINANCEIRAS                                                     │
│  ├── BancoInterConfigForm.tsx (existente)                                   │
│  ├── AsaasConfigForm.tsx (existente)                                        │
│  └── SyncStatusDashboard.tsx (NOVO - status das sincronizações)             │
│                                                                              │
│  EDGE FUNCTIONS                                                              │
│  ├── generate-monthly-invoices (existente - atualizar)                      │
│  ├── apply-contract-adjustment (NOVO)                                       │
│  ├── check-contract-adjustments (NOVO - CRON diário)                        │
│  └── poll-services (existente - consolidado)                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Novos Componentes UI

**ContractAdjustmentDialog.tsx**
- Permite aplicar reajuste anual manualmente
- Busca índice atual (IGPM/IPCA) de API externa
- Mostra preview do novo valor
- Registra no histórico

**ContractAdditionalChargeDialog.tsx**
- Adicionar cobrança pontual para um mês específico
- Seletor de mês/ano
- Campo de descrição e valor
- Lista de adicionais pendentes/aplicados

**ContractNotificationMessageForm.tsx**
- Textarea para mensagem personalizada
- Variáveis disponíveis: `{cliente}`, `{valor}`, `{vencimento}`, `{fatura}`
- Preview da mensagem renderizada

---

## 6. Atualizações nas Edge Functions

### 6.1 `generate-monthly-invoices` - Melhorias

```typescript
// Adicionar:
// 1. Verificação de dias de antecedência por contrato
// 2. Inclusão de valores adicionais do mês
// 3. Uso de mensagem personalizada
// 4. Campo reference_month na fatura

// Pseudocódigo do fluxo melhorado:
for (const contract of contracts) {
  const daysBeforeDue = contract.days_before_due || 5;
  const billingDay = contract.billing_day || 10;
  
  // Calcular se é hora de gerar
  const targetDate = new Date(targetYear, targetMonth, billingDay);
  const generationDate = subDays(targetDate, daysBeforeDue);
  
  if (isToday(generationDate)) {
    // 1. Calcular valor total (serviços + adicionais)
    const additionalCharges = await getAdditionalCharges(contract.id, referenceMonth);
    const totalValue = contract.monthly_value + sumAdditionals(additionalCharges);
    
    // 2. Criar fatura com competência
    const invoice = await createInvoice({
      ...baseData,
      amount: totalValue,
      reference_month: referenceMonth,
    });
    
    // 3. Marcar adicionais como aplicados
    await markAdditionalsAsApplied(additionalCharges, invoice.id);
    
    // 4. Gerar pagamentos
    await generatePayments(invoice.id, contract.payment_preference);
    
    // 5. Emitir NFS-e (se habilitado)
    if (contract.nfse_enabled) {
      await emitNfse(invoice, contract);
    }
    
    // 6. Enviar notificações com mensagem personalizada
    await sendNotifications(invoice, contract.notification_message);
  }
}
```

### 6.2 Nova Edge Function: `apply-contract-adjustment`

```typescript
// Entrada: { contract_id, index_value, notes }
// 1. Buscar contrato atual
// 2. Calcular novo valor: monthly_value * (1 + index_value/100)
// 3. Atualizar contract_services proporcionalmente
// 4. Atualizar contracts.monthly_value
// 5. Registrar em contract_adjustments
// 6. Registrar em contract_history
// 7. Atualizar adjustment_date para próximo ano
```

### 6.3 Nova Edge Function: `check-contract-adjustments` (CRON)

```typescript
// Executar diariamente via pg_cron
// 1. Buscar contratos com adjustment_date = hoje
// 2. Para cada contrato:
//    - Buscar índice (IGPM/IPCA) via API (ex: Banco Central)
//    - Aplicar reajuste automaticamente
//    - Notificar administradores
```

---

## 7. Melhorias de UX/UI

### 7.1 Formulário de Contrato Atualizado

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FORMULÁRIO DE CONTRATO                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ═══════════════════════ DADOS BÁSICOS ═══════════════════════              │
│                                                                              │
│  Nome do Contrato *                          Cliente *                       │
│  [Suporte Mensal Completo___________]       [▼ Empresa ABC___]              │
│                                                                              │
│  Modelo de Suporte          Status            Data de Início                 │
│  [▼ Ilimitado___]           [▼ Ativo___]     [__/__/____]                   │
│                                                                              │
│  [✓] Contrato por tempo indeterminado                                       │
│  [✓] Renovação automática                                                   │
│                                                                              │
│  ═══════════════════════ FATURAMENTO ═══════════════════════               │
│                                                                              │
│  Dia do Vencimento    Dias de Antecedência    Preferência de Pagamento      │
│  [10___]              [5___]                   [▼ Boleto + PIX___]          │
│                                                                              │
│  ═══════════════════════ REAJUSTE ANUAL ═══════════════════════            │
│                                                                              │
│  Data do Próximo Reajuste    Índice de Reajuste    % Fixo (se aplicável)   │
│  [__/__/____]                 [▼ IGPM___]          [______]                 │
│                                                                              │
│  ═══════════════════════ SERVIÇOS ═══════════════════════                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Serviço              Qtd    Valor Unit.    Subtotal    ⚙️  │            │
│  ├─────────────────────────────────────────────────────────────┤            │
│  │ Suporte Remoto        1     R$ 800,00      R$ 800,00    🗑️ │            │
│  │ Backup em Nuvem       1     R$ 200,00      R$ 200,00    🗑️ │            │
│  │ Antivírus (10 lic.)  10     R$ 15,00       R$ 150,00    🗑️ │            │
│  ├─────────────────────────────────────────────────────────────┤            │
│  │ TOTAL MENSAL                            R$ 1.150,00         │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  ═══════════════════════ VALORES ADICIONAIS ═══════════════════════        │
│                                                                              │
│  [+ Adicionar Cobrança Pontual]                                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Mês        Descrição              Valor      Status    ⚙️  │            │
│  ├─────────────────────────────────────────────────────────────┤            │
│  │ 02/2026   Instalação servidor     R$ 500    Pendente   🗑️ │            │
│  │ 01/2026   Consultoria especial    R$ 300    Aplicado   ✓  │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  ═══════════════════════ MENSAGEM DE COBRANÇA ═══════════════════════      │
│                                                                              │
│  Mensagem personalizada (opcional)                                          │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Olá {cliente}!                                               │            │
│  │                                                              │            │
│  │ Segue sua fatura #{fatura} no valor de {valor}.             │            │
│  │ Vencimento: {vencimento}.                                    │            │
│  │                                                              │            │
│  │ Qualquer dúvida, estamos à disposição!                      │            │
│  └─────────────────────────────────────────────────────────────┘            │
│  ℹ️ Variáveis: {cliente}, {valor}, {vencimento}, {fatura}, {boleto}        │
│                                                                              │
│  ═══════════════════════ NFS-e ═══════════════════════                     │
│                                                                              │
│  [✓] Emitir NFS-e automaticamente                                          │
│                                                                              │
│  Código de Serviço    CNAE               Descrição                          │
│  [▼ 01.07.01___]      [6209100]          [Prestação de serviços...]        │
│                                                                              │
│                                        [Cancelar]  [Salvar Contrato]        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Dashboard de Status de Sincronização

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STATUS DE SINCRONIZAÇÕES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  BANCO INTER    │  │     ASAAS       │  │  NOTIFICAÇÕES   │             │
│  │                 │  │                 │  │                 │             │
│  │  🟢 Conectado   │  │  🟢 Conectado   │  │  📧 Email: ✓    │             │
│  │                 │  │                 │  │  📱 WhatsApp: ✓ │             │
│  │  Boletos: ✓     │  │  NFS-e: ✓       │  │                 │             │
│  │  PIX: ✓         │  │  Clientes: ✓    │  │                 │             │
│  │                 │  │                 │  │                 │             │
│  │  Última sync:   │  │  Última sync:   │  │  Última envio:  │             │
│  │  há 2 min       │  │  há 5 min       │  │  há 30 min      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  Próxima execução automática: 14:00 (em 45 min)                             │
│                                                                              │
│  [🔄 Sincronizar Agora]  [📊 Ver Logs]  [⚙️ Configurar]                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Configuração de CRON Jobs

### 8.1 Jobs Necessários

```sql
-- 1. Geração automática de faturas (diário às 08:00)
SELECT cron.schedule(
  'generate-invoices-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://silefpsayliwqtoskkdz.supabase.co/functions/v1/generate-monthly-invoices',
    headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Verificação de reajustes (diário às 07:00)
SELECT cron.schedule(
  'check-adjustments-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://silefpsayliwqtoskkdz.supabase.co/functions/v1/check-contract-adjustments',
    headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3. Polling de status (a cada 6 horas)
SELECT cron.schedule(
  'poll-services-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://silefpsayliwqtoskkdz.supabase.co/functions/v1/poll-services',
    headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{"services": ["boleto", "nfse"]}'::jsonb
  );
  $$
);

-- 4. Lembretes de vencimento (diário às 09:00)
SELECT cron.schedule(
  'notify-due-invoices-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://silefpsayliwqtoskkdz.supabase.co/functions/v1/notify-due-invoices',
    headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{"days_before": 3}'::jsonb
  );
  $$
);

-- 5. Atualização de status overdue (diário à meia-noite)
SELECT cron.schedule(
  'update-overdue-status',
  '0 0 * * *',
  $$
  UPDATE invoices 
  SET status = 'overdue' 
  WHERE status = 'pending' 
    AND due_date < CURRENT_DATE;
  $$
);
```

---

## 9. Pontos de Atenção e Riscos

### 9.1 Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Duplicidade de faturas | Média | Alto | Índice único (contract_id + reference_month) |
| Falha na API de índices | Baixa | Médio | Permitir aplicação manual do reajuste |
| Webhook não entregue | Baixa | Médio | Polling fallback a cada 6h |
| WhatsApp bloqueado | Média | Médio | Validação prévia do número |
| Certificado expirado | Baixa | Alto | Alerta 30 dias antes (já implementado) |

### 9.2 Validações Críticas

1. **Antes de gerar fatura**: Verificar se já existe para o mês
2. **Antes de emitir NFS-e**: Validar dados do cliente (documento, endereço)
3. **Antes de reajuste**: Confirmar índice com o usuário
4. **Antes de cancelamento**: Exigir justificativa

---

## 10. Resumo de Arquivos

### Arquivos a Criar

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/components/contracts/ContractAdjustmentDialog.tsx` | Componente | Dialog para aplicar reajuste |
| `src/components/contracts/ContractAdditionalChargeDialog.tsx` | Componente | Dialog para valores pontuais |
| `src/components/contracts/ContractNotificationMessageForm.tsx` | Componente | Form para mensagem personalizada |
| `src/components/settings/SyncStatusDashboard.tsx` | Componente | Dashboard de sincronizações |
| `supabase/functions/apply-contract-adjustment/index.ts` | Edge Function | Aplicar reajuste |
| `supabase/functions/check-contract-adjustments/index.ts` | Edge Function | CRON de verificação |

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/contracts/ContractForm.tsx` | Adicionar campos de reajuste, antecedência, mensagem |
| `src/components/contracts/ContractServicesSection.tsx` | Adicionar histórico de alterações |
| `supabase/functions/generate-monthly-invoices/index.ts` | Incluir adicionais, competência, mensagem personalizada |
| `supabase/functions/resend-payment-notification/index.ts` | Suporte a mensagem personalizada |
| `src/components/billing/BillingInvoicesTab.tsx` | Exibir coluna de competência |

### Migrações de Banco

1. Adicionar campos em `contracts`
2. Criar tabela `contract_additional_charges`
3. Criar tabela `contract_service_history`
4. Criar tabela `contract_adjustments`
5. Adicionar `reference_month` em `invoices`
6. Criar índice único de duplicidade

---

## 11. Cronograma de Implementação Sugerido

| Fase | Tarefas | Estimativa | Prioridade |
|------|---------|------------|------------|
| 1 | Migrações de banco de dados | 1h | Alta |
| 2 | Campos de reajuste e antecedência no formulário | 2h | Alta |
| 3 | Sistema de valores adicionais pontuais | 3h | Alta |
| 4 | Mensagem personalizada por contrato | 2h | Média |
| 5 | Atualizar `generate-monthly-invoices` | 3h | Alta |
| 6 | Edge function de reajuste automático | 3h | Média |
| 7 | CRON jobs (pg_cron + pg_net) | 1h | Alta |
| 8 | Dashboard de sincronização | 2h | Baixa |
| 9 | Testes end-to-end | 2h | Alta |

**Total estimado: 19 horas de desenvolvimento**

