
# Plano: Correções e Melhorias na Integração Frontend-Backend do Faturamento

## Resumo da Análise

Realizei uma análise completa do fluxo de faturamento e identifiquei **problemas críticos** de conexão entre frontend e backend, além de oportunidades de melhoria.

## Problemas Encontrados

### 1. **BUG CRÍTICO: IDs das faturas NÃO são passados para o processamento em lote**
- **Localização**: `BillingBatchProcessing.tsx` linhas 63-64
- **Problema**: O array `invoice_ids` está vazio (`[]`), ignorando as faturas selecionadas
- **Impacto**: O processamento em lote não funciona - nenhuma fatura é processada
- **Solução**: Passar os IDs selecionados como prop e incluí-los na requisição

### 2. **Falta de seletor de provedor de faturamento no dialog**
- **Problema**: O state `billingProvider` existe mas não há UI para alterá-lo
- **Impacto**: Usuário não consegue escolher entre Banco Inter e Asaas
- **Solução**: Adicionar RadioGroup para seleção do provedor

### 3. **Progress bar estático durante processamento**
- **Problema**: O `<Progress value={50} />` está fixo em 50%
- **Impacto**: Usuário não tem feedback real do progresso
- **Solução**: Implementar progresso baseado no status de cada fatura

### 4. **Histórico de processamento não exibido**
- **Problema**: Os campos `processed_at`, `processing_attempts`, `processing_metadata` existem no banco mas não são exibidos
- **Impacto**: Sem visibilidade de auditoria/debug
- **Solução**: Adicionar timeline de histórico por fatura

### 5. **Edge Function batch-process-invoices com bug no update**
- **Localização**: linha 78
- **Problema**: Uso incorreto de função no update: `processing_attempts: (old_attempts: number) => old_attempts + 1`
- **Impacto**: Erro de sintaxe no Supabase - updates falham
- **Solução**: Usar SQL incremento correto ou buscar valor atual

## Correções a Implementar

### Fase 1: Corrigir Conexão Frontend-Backend (Crítico)

**Arquivo: `BillingBatchProcessing.tsx`**
```text
Alterações:
1. Adicionar prop `selectedInvoiceIds: string[]`
2. Usar os IDs na mutação: `invoice_ids: selectedInvoiceIds`
3. Adicionar RadioGroup para selecionar billing_provider
4. Implementar barra de progresso dinâmica
```

**Arquivo: `BillingInvoicesTab.tsx`**
```text
Alterações:
1. Passar `selectedInvoiceIds={Array.from(selectedInvoices)}` para BillingBatchProcessing
```

**Arquivo: `supabase/functions/batch-process-invoices/index.ts`**
```text
Alterações:
1. Corrigir update de processing_attempts para usar valor correto
2. Melhorar logging para debug
```

### Fase 2: Adicionar Visualização de Histórico

**Novo componente: `InvoiceProcessingHistory.tsx`**
```text
- Timeline mostrando cada etapa de processamento
- Status de boleto, NFS-e, email com timestamps
- Mensagens de erro expandíveis
- Número de tentativas de processamento
```

### Fase 3: Status em Tempo Real (Opcional)

**Usar Supabase Realtime** para:
- Atualizar indicadores de status automaticamente
- Mostrar progresso do processamento em lote sem polling manual

## Verificação do Schema (Confirmado ✓)

Os campos necessários já existem na tabela `invoices`:
- `boleto_status` (enum: pendente/gerado/enviado/erro) ✓
- `nfse_status` (enum: pendente/gerada/erro) ✓  
- `email_status` (enum: pendente/enviado/erro) ✓
- `boleto_error_msg`, `nfse_error_msg`, `email_error_msg` ✓
- `boleto_sent_at`, `nfse_generated_at`, `email_sent_at` ✓
- `processed_at`, `processing_attempts`, `processing_metadata` ✓

Os tipos TypeScript estão sincronizados com o banco de dados ✓

## Arquivos a Modificar

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `src/components/billing/BillingBatchProcessing.tsx` | Corrigir passagem de IDs, adicionar seletor de provedor, progresso dinâmico |
| `src/components/billing/BillingInvoicesTab.tsx` | Passar IDs selecionados como prop |
| `supabase/functions/batch-process-invoices/index.ts` | Corrigir sintaxe de update |
| `supabase/config.toml` | Adicionar config para batch-process-invoices |

## Impacto

- ✅ Corrige bug que impede processamento em lote
- ✅ Adiciona feedback visual real do progresso
- ✅ Permite escolha do provedor de faturamento
- ✅ Mantém compatibilidade com código existente
- ✅ Zero breaking changes na API
