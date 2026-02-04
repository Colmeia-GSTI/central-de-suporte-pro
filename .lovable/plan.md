# Plano de Desenvolvimento

Este arquivo documenta planos de desenvolvimento em andamento.

## Histórico

### ✅ Solução E0014 (DPS Duplicada) - Implementada em 2026-02-04

Implementação completa do tratamento do erro E0014:

1. **Edge Function `asaas-nfse`**:
   - Adicionado mapeamento de erros conhecidos da prefeitura (`KNOWN_PREFEITURA_ERRORS`)
   - Função `parseStatusDescription()` para extrair código e descrição de erros
   - Validação pré-emissão: verifica se `asaas_invoice_id` já existe antes de reemitir
   - Se nota já autorizada no Asaas: atualiza registro local e retorna sucesso
   - Se erro E0014 detectado: bloqueia reemissão e sugere vincular nota
   - Nova ação `link_external` para vincular notas emitidas externamente

2. **Webhook `webhook-asaas-nfse`**:
   - Adicionado parsing de erros com `parseStatusDescription()`
   - Detecção específica de E0014 com log dedicado `dps_duplicada`

3. **Frontend `NfseDetailsSheet`**:
   - Alerta especial para E0014 com campo para vincular nota
   - Botão "Vincular" inline no alerta
   - Dialog completo para vincular nota existente
   - Formatação amigável de mensagens de erro

4. **Utilitários `nfseFormat.ts`**:
   - `parseNfseError()` - extrai código e descrição de erros
   - `isE0014Error()` - detecta erro de DPS duplicada
   - `formatNfseErrorMessage()` - formata mensagens para exibição
