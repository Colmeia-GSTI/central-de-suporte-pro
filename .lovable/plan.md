

## Plano: Corrigir IP na aba Ativos

### Problema
O campo `ip` do merge usa `doc.ip_local` diretamente, que pode conter múltiplos IPs separados por vírgula. Além disso, se `ip_local` estiver vazio, cai para `monitored_devices.ip_address` que pode ser IP público.

### Correção

**Arquivo:** `src/components/clients/ClientAssetsList.tsx` — linha 252

```
ANTES:
ip: doc.ip_local || matched?.ip_address || "",

DEPOIS:
ip: doc.ip_local
  ? doc.ip_local.split(',')[0].trim()
  : matched?.ip_address || "",
```

Uma única linha alterada. Nada mais é modificado.

