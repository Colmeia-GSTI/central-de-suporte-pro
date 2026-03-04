

# Correção: Histórico e Interação Chamado (Solicitante ↔ Atendente)

## Diagnóstico

Após investigação completa, identifiquei os seguintes problemas:

### Problema 1: Portal do Cliente - Comentários sem identificação de remetente
O chat no portal do cliente (`ClientPortalPage.tsx`) **não mostra o nome de quem enviou** cada mensagem. A query de comentários não busca dados de perfil (nome do usuário). As mensagens aparecem como bolhas anônimas, diferenciadas apenas pela posição (esquerda/direita).

### Problema 2: Portal do Cliente - Não busca nomes dos usuários
A query de comentários no portal (linha 194) faz `select("id, ticket_id, user_id, content, is_internal, created_at")` mas nunca resolve `user_id` para um nome legível.

### Problema 3: TicketDetailsTab - Histórico recente só carrega ao expandir
O campo `isHistoryOpen` inicia como `false`, e o query usa `enabled: isHistoryOpen`. Isso não é necessariamente um bug, mas pode confundir se o usuário espera ver o histórico automaticamente.

### Problema 4: TicketCommentsTab (staff) - Não diferencia visualmente solicitante vs atendente
Na aba de comentários do staff, todos os comentários aparecem no mesmo estilo. Não há distinção visual entre comentário do cliente (solicitante) e do técnico (atendente).

## Plano de Correção

### 1. Portal do Cliente - Adicionar nomes aos comentários
- Buscar profiles dos `user_id`s dos comentários (mesma técnica já usada em `TicketCommentsTab`)
- Exibir o nome do remetente acima de cada mensagem no chat
- Mostrar "Você" para mensagens do próprio usuário e o nome real para mensagens do técnico

### 2. TicketCommentsTab (staff) - Diferenciação visual solicitante vs atendente
- Consultar o `created_by` do ticket para identificar quem é o solicitante
- Aplicar estilo diferenciado: mensagens do cliente com fundo diferente e label "Solicitante", mensagens do técnico com label "Equipe"
- Manter o layout de chat para melhor leitura da conversa

### 3. TicketDetailsTab - Abrir histórico recente por padrão
- Alterar `isHistoryOpen` para iniciar como `true` para que o histórico já apareça carregado ao abrir o chamado

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/pages/client-portal/ClientPortalPage.tsx` | Buscar nomes dos usuários nos comentários e exibir remetente |
| `src/components/tickets/TicketCommentsTab.tsx` | Diferenciar visualmente comentários de cliente vs equipe |
| `src/components/tickets/TicketDetailsTab.tsx` | Iniciar histórico expandido por padrão |

