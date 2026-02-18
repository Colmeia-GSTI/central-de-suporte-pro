

# Remoção do NFS-e Nacional e Consolidação no Asaas

## Resumo

Remover todas as referências ao "Portal Nacional da NFS-e", "API Nacional", "DPS", "Ambiente de Dados Nacional" e integração direta por certificado A1 para NFS-e. O sistema passa a usar exclusivamente o Asaas como provedor de NFS-e. Simultaneamente, migrar chamadas de polling legadas para a edge function consolidada `poll-services` e corrigir textos de UI que mencionam o portal nacional.

---

## Alterações Detalhadas

### 1. Edge Function `poll-services/index.ts`

- Remover o tipo `"nfse_nacional"` do union `PollRequest.services`
- Remover a função `pollNfseNacional` inteira (~25 linhas)
- Remover a chamada a `pollNfseNacional` do `Promise.all`
- Remover a referência a `nfse_nacional` do array padrão de services
- Resultado: o serviço fica apenas com `"boleto"` e `"asaas_nfse"`

### 2. Frontend -- Migrar polling legado para `poll-services`

5 componentes chamam edge functions legadas. Migrar todos para `poll-services`:

| Componente | De | Para |
|---|---|---|
| `BillingNfseTab.tsx` (linha 277) | `poll-asaas-nfse-status` | `poll-services` com `{ services: ["asaas_nfse"] }` |
| `IntegrationHealthDashboard.tsx` (linha 25) | `poll-boleto-status` | `poll-services` com `{ services: ["boleto"] }` |
| `IntegrationHealthDashboard.tsx` (linha 42) | `poll-asaas-nfse-status` | `poll-services` com `{ services: ["asaas_nfse"] }` |
| `BillingBoletosTab.tsx` (linha 235) | `poll-boleto-status` | `poll-services` com `{ services: ["boleto"] }` |
| `BillingErrorsPanel.tsx` (linha 165) | `poll-boleto-status` | `poll-services` com `{ services: ["boleto"] }` |
| `InvoiceProcessingHistory.tsx` (linha 254) | `poll-boleto-status` | `poll-services` com `{ services: ["boleto"] }` |

### 3. Remover Edge Functions legadas

- Deletar `supabase/functions/poll-boleto-status/` (~321 linhas)
- Deletar `supabase/functions/poll-asaas-nfse-status/` (~390 linhas)

Impacto: ~710 linhas de código backend removidas.

### 4. Atualizar textos de UI -- "Portal Nacional" para "Asaas"

| Arquivo | Linha | Texto atual | Novo texto |
|---|---|---|---|
| `nfseFormat.ts` (linha 96) | `"API Nacional"` | Remover o case `"nacional"` |
| `nfseFormat.ts` (linha 130) | `"A nota já existe no Portal Nacional..."` | `"A nota já existe no provedor Asaas. Use 'Vincular Nota Existente' para sincronizar."` |
| `nfseFormat.ts` (linha 178) | `"Nota já existe no Portal Nacional"` | `"Nota já existe no provedor"` |
| `nfseFormat.ts` (linha 179) | `"...série/número DPS já está registrada"` | `"Esta NFS-e já foi emitida anteriormente com os mesmos dados."` |
| `NfseDetailsSheet.tsx` (linha 299) | `"Esta nota já existe no Portal Nacional"` | `"Esta nota já existe no provedor Asaas"` |
| `NfseDetailsSheet.tsx` (linha 702) | `"Nota já existe no Portal Nacional"` | `"Nota já existe no provedor"` |
| `NfseDetailsSheet.tsx` (linha 705) | `"...mesma Série/Número DPS"` | `"Esta NFS-e já foi emitida anteriormente com os mesmos dados."` |
| `NfseLinkExternalDialog.tsx` (linha 91) | `"Vincule uma NFS-e já emitida no Portal Nacional..."` | `"Vincule uma NFS-e já emitida no Asaas ao registro local."` |
| `NfseLinkExternalDialog.tsx` (linha 100) | `"...já existe no Portal Nacional"` | `"...já foi processada pelo Asaas"` |
| `NfseLinkExternalDialog.tsx` (linha 109) | `"...verificou no Portal Nacional..."` | `"...verificou no Asaas que a nota existe..."` |
| `webhook-asaas-nfse/index.ts` (linha 63) | `"DPS duplicada - NFS-e já existe no Portal Nacional"` | `"NFS-e duplicada - já emitida anteriormente no Asaas"` |
| `webhook-asaas-nfse/index.ts` (linhas 284-288) | Referências a "Portal Nacional" | Trocar para "provedor Asaas" |
| `asaas-nfse/index.ts` (linha 63) | `"DPS duplicada - NFS-e já existe no Portal Nacional"` | `"NFS-e duplicada - já emitida no Asaas"` |

### 5. Atualizar `nfse-validation.ts` (cabeçalho)

- Linha 1-4: Remover referência a "Portal Nacional da NFS-e" e "DPS"
- Novo cabeçalho: `"NFS-e Validation Rules for Asaas integration"`

### 6. Atualizar `nfse-retencoes.ts` (cabeçalho)

- Linha 1-4: Remover referência a "NFS-e Nacional 2026" e "DPS v1.0"
- Novo cabeçalho: `"Cálculo de Retenções e Tributos para NFS-e via Asaas"`

### 7. Comentários de código

Remover comentários `// Tributos Nacional 2026` em:
- `NfseAvulsaDialog.tsx` (linha 239)
- `EmitNfseDialog.tsx` (linha 205)

### 8. Aba "Ajuda" no `BillingNfseTab.tsx`

- Linha 880: Remover o item `Certificado: A1 válido (quando usando API Nacional)` do checklist
- Linha 922-924: Remover referência a `certificado digital (A1/A3) para assinatura de XML` na seção NF-e/CT-e

### 9. Card "Certificado digital (A1)" no `BillingNfseTab.tsx`

- Linhas 390-407: Remover o card de saúde do certificado digital, pois com Asaas o certificado A1 não é necessário para NFS-e
- Linhas 330-336: Remover `certOk` do health check
- Atualizar grid de 3 para 2 colunas (`md:grid-cols-2`)
- Nota: o CertificateManager e CertificateUpload continuam existindo para uso com Banco Inter (mTLS), mas não são mais exibidos na aba NFS-e

### 10. NfseAvulsaDialog -- Remover query de certificado

- Linhas 100-114: Remover a query `nfse-primary-certificate` que busca o certificado primário, pois não é mais necessária para emissão via Asaas
- Linhas 146-148: Remover `certificateDaysRemaining`

---

## Arquivos Afetados

### Editar:
1. `supabase/functions/poll-services/index.ts` -- remover nfse_nacional
2. `src/components/billing/BillingNfseTab.tsx` -- migrar polling, remover card certificado, ajustar ajuda
3. `src/components/billing/IntegrationHealthDashboard.tsx` -- migrar polling
4. `src/components/billing/BillingBoletosTab.tsx` -- migrar polling
5. `src/components/billing/BillingErrorsPanel.tsx` -- migrar polling
6. `src/components/billing/InvoiceProcessingHistory.tsx` -- migrar polling
7. `src/components/billing/nfse/nfseFormat.ts` -- remover provider "nacional", atualizar textos
8. `src/components/billing/nfse/NfseDetailsSheet.tsx` -- atualizar textos E0014
9. `src/components/billing/nfse/NfseLinkExternalDialog.tsx` -- atualizar textos
10. `src/components/billing/nfse/NfseAvulsaDialog.tsx` -- remover query certificado, limpar comentários
11. `src/components/financial/EmitNfseDialog.tsx` -- limpar comentários
12. `src/lib/nfse-validation.ts` -- atualizar cabeçalho
13. `src/lib/nfse-retencoes.ts` -- atualizar cabeçalho
14. `supabase/functions/asaas-nfse/index.ts` -- atualizar textos
15. `supabase/functions/webhook-asaas-nfse/index.ts` -- atualizar textos

### Deletar:
16. `supabase/functions/poll-boleto-status/index.ts`
17. `supabase/functions/poll-asaas-nfse-status/index.ts`

### Resultado:
- ~710 linhas de edge functions removidas
- Zero referências a "Portal Nacional", "API Nacional", "DPS" ou "nfse_nacional"
- Polling unificado via `poll-services`
- Todas as referências fiscais alinhadas com documentação Asaas

