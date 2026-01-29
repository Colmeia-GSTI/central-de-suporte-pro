# Plano: Correção do Sistema NFS-e + Integração Financeira Completa

## ✅ IMPLEMENTADO

### 1. Bug Crítico Corrigido: Reenvio NFS-e
- `NfseDetailsSheet.tsx`: `resendMutation` agora salva alterações E chama a edge function `asaas-nfse`
- Dados editados (valor, descrição, competência) são persistidos e enviados para processamento

### 2. Botão "Emitir Completo" nas Faturas
- `BillingInvoicesTab.tsx`: Nova função `handleEmitComplete` que:
  - Gera boleto se não existir
  - Gera PIX se não existir
  - Emite NFS-e vinculada à fatura
  - Envia notificação por Email + WhatsApp

### 3. Badge NFS-e na Listagem de Faturas
- Query `nfse-by-invoices` busca NFS-e vinculadas
- Badge colorido mostra status da NFS-e (autorizada, processando, pendente, etc.)

### 4. Preview Antes de Emitir NFS-e
- `EmitNfseDialog.tsx`: Fluxo em 2 passos (form → preview)
- Preview mostra: Prestador, Tomador, Valor, Competência, Código Tributação, Descrição
- Botão "Confirmar Emissão" após revisão

### 5. Motivo Obrigatório para Cancelamento
- `NfseDetailsSheet.tsx`: Campo `motivoCancelamento` obrigatório
- Alerta informando necessidade para auditoria
- Motivo salvo na tabela antes de chamar API de cancelamento

## Arquivos Modificados

| Arquivo | Alterações |
|---------|------------|
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | resendMutation corrigido, motivo cancelamento |
| `src/components/billing/BillingInvoicesTab.tsx` | Emitir Completo, badge NFS-e, query vinculação |
| `src/components/financial/EmitNfseDialog.tsx` | Preview em 2 passos, dados completos |
