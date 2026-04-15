

## Plano: Tarefa 1 (IP fix + SourceBadge) e Tarefa 2 (Aba Rede com doc_devices e VLANs)

### Tarefa 1 — ClientAssetsList.tsx

A correção de IP já está aplicada (linhas 252-253 já usam `split(',')[0].trim()`). Resta apenas:

**1a. Substituir OriginBadge local pelo SourceBadge compartilhado:**
- Remover a função `OriginBadge` local (linhas 708-737)
- Importar `SourceBadge` de `./documentation/shared/SourceBadge`
- No render (linha 616), trocar `<OriginBadge origin={item.origin} />` por `<SourceBadge source={item.origin === "trmm" ? "trmm" : item.origin === "doc_only" ? "manual" : item.origin} />`
- Remover imports não mais usados (`Activity`, `FileText` das linhas de OriginBadge)

### Tarefa 2 — Hook useUnifiedNetworkDevices + Aba Rede

**2a. Criar hook `src/hooks/useUnifiedNetworkDevices.ts`:**

Hook reutilizável que:
- Recebe `clientId` e lista de `deviceTypes` (ex: `["switch", "access_point", "nas", "router", "other"]`)
- Busca `doc_devices` filtrado por `device_type IN deviceTypes`
- Busca `monitored_devices` filtrado por `external_source = 'unifi'`
- Aplica merge idêntico ao da aba Ativos (doc como base, monitored para status)
- Retorna `items`, `isLoading`, contadores

**2b. Reescrever `ClientNetworkTab.tsx`:**

Estrutura nova:

```text
┌─────────────────────────────────────────────┐
│ UnifiConfigForm (já existe)                 │
├─────────────────────────────────────────────┤
│ Resumo: [Dispositivos: X] [VLANs: X]       │
│         [Firewall: X →]                     │
├─────────────────────────────────────────────┤
│ Mapa de Topologia (se houver dados)         │
├─────────────────────────────────────────────┤
│ Sites UniFi (mantido como está)             │
│   Dentro de cada site: DeviceGrid atualizado│
│   com merge doc_devices + badges            │
├─────────────────────────────────────────────┤
│ Seção VLANs                                 │
│   Tabela: ID | Nome | Finalidade | Range IP │
│           | Gateway | DHCP | Isolada | Origem│
│   ou: Card vazio com botão "Ir para Doc"    │
└─────────────────────────────────────────────┘
```

**Parte A — Merge de dispositivos:**
- Usar o hook `useUnifiedNetworkDevices` para obter lista unificada
- Atualizar `DeviceGrid` para mostrar: Nome, Tipo, Modelo (doc), IP (doc.ip_local prioridade), SSIDs/Portas, Localização, Status (monitored), Badge Documentado
- Dispositivos apenas em `monitored_devices` → Badge "Não documentado" amarelo

**Parte B — Seção VLANs:**
- Query `doc_vlans WHERE client_id = clientId`
- Tabela com colunas: ID VLAN, Nome, Finalidade, Range IP, Gateway, DHCP (Sim/Não), Isolada (Sim/Não), Origem (SourceBadge)
- Empty state com mensagem e botão que navega para aba Documentação

**Parte C — Resumo no topo:**
- 3 cards compactos substituindo os atuais (Sites, Devices Online, Clientes Wi-Fi)
- Adicionar: Dispositivos de rede (count), VLANs configuradas (count), Regras de firewall (count de doc_firewall_rules)
- Clique em "Regras de firewall" navega para aba Documentação (seção 12)

**Componentes reutilizados:**
- `SourceBadge` para origem em VLANs e dispositivos
- `StatusBadge` para status de dispositivos
- `Field` onde aplicável no detalhe

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/components/clients/ClientAssetsList.tsx` | Trocar OriginBadge → SourceBadge |
| `src/hooks/useUnifiedNetworkDevices.ts` | Criar (hook de merge) |
| `src/components/clients/ClientNetworkTab.tsx` | Reescrever com merge + VLANs + resumo |

Nenhuma alteração em tabelas, monitored_devices, ou topologia existente.

