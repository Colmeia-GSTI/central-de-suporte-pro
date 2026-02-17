
# Reprocessamento NFS-e Pendentes - CONCLUÍDO ✅

## Correções Aplicadas

### Bug adicional descoberto: `municipalServiceName` obrigatório
A API Asaas exige tanto `municipalServiceId` quanto `municipalServiceName` no payload de emissão.
O campo não estava sendo enviado, causando erro `"O campo municipalServiceName deve ser informado"`.

**Fix:** `tryResolve` agora retorna `{id, description}` e o payload inclui `municipalServiceName`.

### Fase 1: Limpeza SQL ✅
- Faturas #14 e #15: `nfse_status` resetado
- 3 registros órfãos de 13/02: marcados como `cancelada`
- 2 registros pendentes de 17/02: marcados como `cancelada` (recriados no reprocessamento)

### Fase 2: Reprocessamento ✅
- CVR (fatura #14): `inv_000017489403` - Status SCHEDULED
- RUARO (fatura #15): `inv_000017489404` - Status SCHEDULED
- Ambas usando `municipalServiceId: 527787` (01.07.01, Passo Fundo)

### Fase 3: Auto-retry no poll-asaas-nfse-status ✅
- Detecta registros `pendente` sem `asaas_invoice_id` com mais de 30 min
- Dispara reemissão automática (máx 5 por execução)
- Notifica admins sobre reprocessamentos automáticos

## Arquivos Alterados
| Arquivo | Alteração |
|---------|-----------|
| `asaas-nfse/index.ts` | `tryResolve` retorna `{id, description}`, payload inclui `municipalServiceName` |
| `poll-asaas-nfse-status/index.ts` | Auto-retry para NFS-e pendentes sem asaas_invoice_id |
