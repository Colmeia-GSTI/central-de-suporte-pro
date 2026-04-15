

## Plano: Corrigir IP local nos dispositivos sincronizados do TRMM

Duas Edge Functions salvam IPs de agentes TRMM — ambas precisam priorizar `local_ips` sobre `public_ip`.

### 1. `sync-doc-devices/index.ts` (linha 126)

Já está correto:
```typescript
ip_local: Array.isArray(agent.local_ips) ? agent.local_ips.join(", ") : (agent.local_ip || null),
```
Usa `local_ips` com fallback para `local_ip`. Não usa `public_ip`. Nenhuma alteração necessária aqui.

### 2. `tactical-rmm-sync/index.ts` (linha 322)

Precisa de correção:

```
ANTES:
ip_address: agent.local_ip || agent.public_ip,

DEPOIS:
ip_address: agent.local_ips
  ? (Array.isArray(agent.local_ips) ? agent.local_ips[0] : String(agent.local_ips).split(',')[0].trim())
  : (agent.local_ip || agent.public_ip),
```

Prioriza `local_ips` (array ou string), fallback para `local_ip`, último recurso `public_ip`.

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/tactical-rmm-sync/index.ts` | Editar linha 322 — IP local |

Apenas uma linha a alterar + deploy da Edge Function.

