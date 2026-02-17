
# Reprocessamento das NFS-e Pendentes (RUARO e CVR)

## Diagnostico

Os registros de NFS-e da RUARO e CVR estao com status `pendente` porque:

1. Falharam as 11:00 UTC com o codigo antigo (antes do deploy da correcao)
2. A migracao de limpeza (14:59 UTC) resetou o status para `pendente` e limpou os erros
3. Nao existe mecanismo automatico para reprocessar registros `pendente` -- eles ficam parados

A correcao no codigo esta **validada e funcionando**: o teste real de `list_services` retorna `municipalServiceId: 527787` para o codigo `01.07.01` em Passo Fundo.

As faturas #14 e #15 ainda mostram `nfse_status: erro` com a mensagem antiga. Precisam ser atualizadas tambem.

## Plano de Correcao

### Fase 1: Limpar estado das faturas e reprocessar

**SQL direto no banco:**
- Atualizar `nfse_status` e `nfse_error_msg` das faturas #14 e #15 para permitir reprocessamento
- Marcar os registros `pendente` orfaos antigos (de 13/02) como `cancelada` para evitar duplicidade

### Fase 2: Disparar reprocessamento via Edge Function

Chamar a edge function `asaas-nfse` com action `emit` para cada fatura, usando o novo codigo corrigido que:
- Busca a cidade do emitente (`PASSO FUNDO`)
- Filtra servicos municipais por cidade
- Extrai o codigo de `description` (nao de `code`)
- Resolve `municipalServiceId: 527787`

### Fase 3: Adicionar mecanismo de auto-retry para NFS-e pendentes

**Problema estrutural:** Nao existe job automatico que reprocesse NFS-e com status `pendente`. Registros resetados ficam parados indefinidamente.

**Solucao:** Adicionar logica no `poll-asaas-nfse-status` (que ja roda como cron) para detectar registros `pendente` sem `asaas_invoice_id` com mais de 30 minutos e disparar reemissao automatica.

**Arquivo:** `supabase/functions/poll-asaas-nfse-status/index.ts`

Adicionar bloco apos o orphan detection existente:
- Buscar registros com `status = 'pendente'` e `asaas_invoice_id IS NULL` e `created_at < 30 min atras`
- Para cada um, chamar internamente a logica de emissao via `asaas-nfse`
- Limitar a 5 retries por execucao para nao sobrecarregar

## Resumo de Alteracoes

| Acao | Detalhe |
|------|---------|
| SQL | Limpar `nfse_status`/`nfse_error_msg` das faturas #14 e #15 |
| SQL | Cancelar registros orfaos antigos de 13/02 |
| Edge Function call | Reprocessar NFS-e da CVR e RUARO |
| `poll-asaas-nfse-status` | Adicionar auto-retry para NFS-e pendentes sem `asaas_invoice_id` |

## Resultado Esperado

1. NFS-e da CVR e RUARO serao emitidas com `municipalServiceId: 527787` (Passo Fundo, 01.07.01)
2. Faturas #14 e #15 terao `nfse_status` atualizado apos emissao
3. No futuro, NFS-e que ficarem presas em `pendente` serao automaticamente reprocessadas pelo cron
