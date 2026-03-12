

# Plano: Mover Configuração UniFi para dentro de cada Cliente

## Contexto

Atualmente, o `UnifiConfigForm` está na página de Configurações globais (aba Integrações → Rede). O usuário quer que a configuração de controllers UniFi fique **dentro da página de detalhes de cada cliente**, já que cada controller pertence a um cliente específico.

## Mudanças

### 1. Refatorar `UnifiConfigForm.tsx`
- Adicionar prop `clientId: string` obrigatória
- Remover o seletor de cliente (`Select` de `clients-list-simple`) — o client_id será fixo
- Filtrar controllers pela query usando `.eq("client_id", clientId)`
- O formulário de criação já preenche `client_id` automaticamente com o prop

### 2. Integrar no `ClientNetworkTab.tsx`
- Importar o `UnifiConfigForm` refatorado
- Renderizar o formulário de configuração **acima** da visualização de sites/devices/topologia
- Quando não há controllers configurados, mostrar o form de adicionar em vez da mensagem "configure em Configurações"
- Layout: Config de controllers no topo, visualização de rede abaixo

### 3. Remover da aba global de Integrações
- Em `IntegrationsTab.tsx`: remover o `UnifiConfigForm` da aba "Rede"
- Na aba "Rede" das integrações globais, mostrar apenas um resumo/status geral dos controllers UniFi (quantos clientes têm controllers, status de sync) com link para cada cliente
- Alternativamente, remover a aba "Rede" inteira se ficar vazia, ou manter apenas como painel de status

### 4. Atualizar `IntegrationStatusPanel.tsx`
- Manter o card de status UniFi no painel global (mostra contagem agregada)
- Adicionar links para os clientes que têm controllers configurados

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `src/components/settings/integrations/UnifiConfigForm.tsx` | Refatorar: adicionar prop `clientId`, remover seletor de cliente |
| `src/components/clients/ClientNetworkTab.tsx` | Integrar `UnifiConfigForm` com `clientId` fixo |
| `src/components/settings/IntegrationsTab.tsx` | Remover `UnifiConfigForm` da aba Rede, manter resumo |

