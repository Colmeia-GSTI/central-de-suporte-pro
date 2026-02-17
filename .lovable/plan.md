

# Correcoes Definitivas: NFS-e e Boletos no Padrao Asaas

O usuario tem razao -- as correcoes anteriores nao resolveram os problemas de raiz. Esta varredura identificou que os bugs persistem porque as correcoes aplicadas foram paliativas, nao definitivas. O plano abaixo corrige TUDO na origem.

---

## Diagnostico Final

### Problema 1: NFS-e rejeitada com `invalid_municipalServiceExternalId` (CRITICO)

**Causa raiz confirmada no banco:**
- Contratos CVR e RUARO tem `nfse_service_code: '010701'`
- A funcao `normalizeServiceCode("010701")` remove zeros a esquerda, resultando em `"10701"`
- A busca em `GET /invoices/municipalServices` retorna servicos de TODAS as cidades do Brasil
- O match encontra um `municipalServiceId` de outra cidade (nao de Passo Fundo)
- A API Asaas rejeita com `invalid_municipalServiceExternalId`
- `codigo_tributacao` fica `null` no historico porque o auto-resolve falha antes de popular

**Correcao definitiva:**
1. Buscar a cidade do emitente em `company_settings.endereco_cidade` (valor atual: `PASSO FUNDO`)
2. Filtrar os servicos municipais pela cidade: `GET /invoices/municipalServices?description=&city=PASSO FUNDO`
3. NAO remover zeros a esquerda na normalizacao -- `010701` deve ser comparado como `010701`
4. Se mesmo assim nao encontrar, enviar erro claro com os codigos disponiveis para aquela cidade

### Problema 2: Icone do boleto vermelho para faturas resetadas (MEDIO)

**Causa raiz confirmada no banco:**
- Faturas #14 e #15 tem `boleto_status: 'pendente'` + `boleto_error_msg: 'Resetado: boleto orfao...'`
- O `boleto_error_msg` deveria ter sido limpo na correcao anterior, mas NAO foi
- A funcao `getBoletoIndicator` prioriza `boleto_error_msg` sobre o status, mostrando vermelho

**Correcao definitiva:**
1. Corrigir `getBoletoIndicator` para ignorar mensagens informativas (que contem "Resetado")
2. Limpar o `boleto_error_msg` das faturas resetadas via SQL
3. O `InvoiceInlineActions` ja usa logica duplicada (nao importa de `invoiceIndicators.ts`) -- unificar

### Problema 3: Boleto PDF nao salvo no Storage S3 (BAIXO)

**Estado atual:**
- NFS-e PDFs sao salvos no bucket `nfse-files` pelo webhook
- Boletos Asaas tem `boleto_url` apontando para URL externa (bankSlipUrl)
- Boletos Inter tambem apontam para URL externa
- Nao existe bucket para documentos de fatura

**Correcao definitiva:**
- No `create_payment` do Asaas: apos receber `bankSlipUrl`, baixar o PDF e salvar no Storage
- Criar bucket `invoice-documents` para armazenar PDFs de boletos
- Manter `boleto_url` apontando para o path no Storage (consistente com `nfse-files`)

---

## Plano de Correcoes

### Fase 1: Corrigir resolucao do `municipalServiceId` (CRITICO)

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Alteracoes na funcao `normalizeServiceCode`:
- Remover o `.replace(/^0+/, "")` que elimina zeros a esquerda
- Manter apenas a remocao de pontos e espacos

Alteracoes na resolucao do `municipalServiceId` (2 locais: `emit` e `emit_standalone`):
- Buscar `endereco_cidade` de `company_settings` para usar como filtro
- Passar `?city=PASSO+FUNDO` na chamada `GET /invoices/municipalServices`
- Comparar os codigos SEM remover zeros a esquerda
- Se nenhum match for encontrado, tentar novamente SEM filtro de cidade como fallback
- Em caso de falha `invalid_municipalServiceExternalId`, retry automatico com `municipalServiceCode` em vez de `municipalServiceId`

Alteracao na criacao do historico:
- Garantir que `codigo_tributacao` e populado ANTES de criar o registro, usando o `effectiveServiceCode` resolvido

### Fase 2: Corrigir indicador visual do boleto (MEDIO)

**Arquivo:** `src/utils/invoiceIndicators.ts`

Alterar `getBoletoIndicator`:
- Se `boleto_error_msg` contem "Resetado", tratar como `pending` (cinza) e nao `error` (vermelho)
- Tooltip: "Boleto resetado - aguardando nova geracao"

**Arquivo:** `src/components/billing/InvoiceInlineActions.tsx`

Unificar logica de cores do boleto:
- Importar e usar `getBoletoIndicator` de `invoiceIndicators.ts` em vez de logica inline duplicada
- Remover as linhas 67-72 (calculo manual de `boletoColor`) e usar a funcao centralizada

**SQL:** Limpar `boleto_error_msg` das faturas resetadas (execucao direta no banco)

### Fase 3: Armazenar PDF do boleto no Storage (BAIXO)

**Migracao SQL:**
- Criar bucket `invoice-documents` com RLS

**Arquivo:** `supabase/functions/asaas-nfse/index.ts` (action `create_payment`)

Apos receber `bankSlipUrl` da API Asaas:
- Fazer `fetch(bankSlipUrl)` para baixar o PDF
- Upload para `invoice-documents/boletos/{invoice_id}.pdf`
- Salvar o path do Storage em `boleto_url` (nao a URL externa)

### Fase 4: Limpar dados orfaos no banco

**SQL direto:**
- Limpar `boleto_error_msg` das faturas #14 e #15
- Limpar registros de `nfse_history` orfaos (sem `codigo_tributacao`) para permitir reprocessamento limpo

---

## Resumo de Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/asaas-nfse/index.ts` | Fix normalizeServiceCode + filtro por cidade + storage do boleto PDF |
| `src/utils/invoiceIndicators.ts` | Tratar "Resetado" como pendente |
| `src/components/billing/InvoiceInlineActions.tsx` | Unificar com invoiceIndicators (remover logica duplicada) |
| Migracao SQL | Criar bucket `invoice-documents` + limpar dados orfaos |

## Resultado Esperado

Apos estas correcoes:
1. NFS-e de CVR e RUARO serao emitidas com o `municipalServiceId` correto de Passo Fundo
2. Icones de boleto resetados aparecerao cinza (pendente) e nao vermelho (erro)
3. PDFs de boleto Asaas serao salvos no Storage S3 do sistema
4. Toda a logica de indicadores visuais usara um unico ponto centralizado (`invoiceIndicators.ts`)

