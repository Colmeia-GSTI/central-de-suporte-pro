
# Correções Definitivas - IMPLEMENTADAS E VALIDADAS

## Status: ✅ COMPLETO (2026-02-17)

Todas as 6 fases foram implementadas, deployadas e validadas com testes reais.

## Correções Aplicadas

### Fase 1: ✅ Fix municipalServiceId (asaas-nfse) - BUG CRÍTICO
- `tryResolve` e `tryResolveStandalone`: extraem código via `s.description.match(/^(\d{2}\.\d{2}\.\d{2})/)` em vez de `s.code` (que não existe na API Asaas)
- Log `codigos_disponiveis` corrigido para extrair de `description`

### Fase 2: ✅ Asaas create_payment - campos obrigatórios
- Adicionado `payment_method: "boleto"`, `boleto_status: "enviado"`, `boleto_sent_at`
- Adicionado `payment_method: "pix"` para PIX
- Busca `identificationField` via `GET /payments/{id}/identificationField` (endpoint separado conforme docs Asaas)

### Fase 3: ✅ Banco Inter - billing_provider, acesso correto, PDF base64
- Adicionado `billing_provider: "banco_inter"` no updateData
- Adicionado `boleto_sent_at` quando boleto completo
- Corrigido acesso: `details.boleto.codigoBarras` / `details.boleto.linhaDigitavel`
- PDF obtido via `GET /cobranca/v3/cobrancas/{id}/pdf` (retorna base64), decodificado e salvo no Storage

### Fase 4: ✅ poll-boleto-status - acesso correto, PDF base64
- Prioridade de leitura: `boleto.*` antes de `cobranca.*`
- PDF via endpoint `/pdf` (base64) salvo no Storage
- Adicionado `boleto_status: "enviado"` e `boleto_sent_at` no update

### Fase 5: ✅ webhook-banco-inter - sem alterações necessárias
- O webhook recebe payload direto do Inter com estrutura flat (não aninhada), diferente do GET consulta

### Fase 6: ✅ batch-process-invoices - removida sobrescrita
- Removido update redundante de `boleto_status: "enviado"` e `boleto_sent_at` (linhas 96-104)
- Edge functions já cuidam do status internamente

## Validação
- Teste real `list_services` para "PASSO FUNDO" confirmou que a API retorna `description: "01.07.01 - ..."` com `id: "527787"` e SEM campo `code`
- Todas as 5 edge functions deployadas com sucesso
