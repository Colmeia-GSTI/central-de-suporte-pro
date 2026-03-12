

# Plano: Edição de Controllers + Nome Real + Dados Reais do UniFi

## Problemas Identificados

1. **Sem edição**: O formulário atual só permite adicionar e excluir controllers, sem opção de editar nome, credenciais ou frequência de sync.
2. **Nome genérico**: O controller salva o nome digitado pelo usuário (ex: "ucgu") sem buscar o nome real configurado no dispositivo UniFi.
3. **Dados zerados**: Após sync via Cloud, `device_count` e `client_count` ficam 0 porque a Cloud API retorna devices numa estrutura diferente que não está sendo parseada corretamente.

## Mudanças

### 1. `UnifiConfigForm.tsx` - Adicionar modo de edição

- Adicionar estado `editingId` para rastrear qual controller está sendo editado
- Ao clicar em "Editar" num controller existente, popular o form com os dados atuais e entrar em modo edição
- No modo edição, o `saveMutation` faz `update` em vez de `insert`
- Adicionar botão de edição (icone Pencil) ao lado de cada controller na lista
- Após o "Testar Conexão" no modo Cloud, auto-preencher o campo `name` com o nome real do host selecionado (via `getHostDisplayName`)
- Após o "Testar Conexão" no modo Direct, auto-preencher o `name` com o hostname do primeiro site retornado

### 2. `unifi-sync/index.ts` - Atualizar nome do controller e dados reais

- Na ação `sync` para Cloud: após descobrir o host, buscar o nome real via `getHostDisplayName` e atualizar `unifi_controllers.name` com esse nome
- Na ação `sync` para Cloud: parsear corretamente a resposta de devices da Cloud API (tratar estruturas aninhadas como `reportedState`)
- Atualizar `network_sites.device_count` e `client_count` com valores reais da contagem de devices e clientes Wi-Fi
- Na ação `test` para Cloud: retornar também a contagem de devices por host para preview

### 3. Cloud device parsing melhorado

O endpoint `GET /ea/sites/{hostId}/devices` retorna devices com estrutura aninhada. Melhorar o parsing para extrair:
- `mac` de `reportedState.mac` ou `mac`
- `name` de `reportedState.name` ou `userData.name`
- `model` de `reportedState.model`
- `ip` de `reportedState.ip` ou `networkConfig.ip`
- `state`/`status` para determinar online/offline
- `num_sta` para contar clientes Wi-Fi (em APs)

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `src/components/settings/integrations/UnifiConfigForm.tsx` | Adicionar modo edição, auto-nome, botão editar |
| `supabase/functions/unifi-sync/index.ts` | Auto-atualizar nome, melhorar parsing Cloud, contagens reais |

