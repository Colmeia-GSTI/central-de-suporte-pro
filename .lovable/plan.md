
# Melhorias no Sistema de Notificações

## Diagnóstico Completo

Após análise profunda do `NotificationDropdown`, `useNotifications`, `useUnifiedRealtime` e banco de dados, identifiquei 6 problemas críticos:

### Problemas Encontrados

**1. Dropdown sem ação ao clicar em notificação com `related_id`**
Clicar em uma notificação com `related_type: "invoice"` apenas marca como lida — não navega para a entidade. O campo `related_id` existe mas nunca é usado para navegação. Com 60 notificações no banco todas de `type: invoice`, o usuário não consegue chegar na fatura clicando na notificação.

**2. Sem opção de deletar / limpar notificações**
O hook `useNotifications` só tem `markAsRead` e `markAllAsRead`. Não há como excluir notificações individuais nem limpar todas. Com 30 não lidas acumuladas, não há saída.

**3. Sem filtro por tipo no dropdown**
Todas as notificações aparecem misturadas. Sem tabs ou filtros por tipo (info, warning, success, error).

**4. `usePushNotifications` ainda usa `useToast` (sistema legado)**
O hook usa `useToast` em vez de `sonner`, inconsistente com o resto do sistema.

**5. Sem página dedicada de notificações**
O dropdown está limitado a 350px de altura. Com 50+ notificações, é impossível navegar. Não existe `/notifications` com histórico completo.

**6. Notificações com `related_type` não têm ícones específicos**
`related_type: "invoice"` deveria mostrar ícone de fatura (Receipt), mas cai no ícone padrão Bell.

## Plano de Implementação

### 1. `src/hooks/useNotifications.tsx`
- Adicionar `deleteNotification(id)` e `clearAllRead()` mutations
- Retornar `isMarkingAll` e `isDeletingAll` para estados de loading dos botões

### 2. `src/components/notifications/NotificationDropdown.tsx`
- **Navegação ao clicar**: usar `useNavigate` para rotear baseado em `related_type`:
  - `invoice` → `/billing?tab=invoices`
  - `ticket` → `/tickets?id={related_id}`
  - `contract` → `/contracts`
- **Ícones por `related_type`**: Receipt para invoice, Ticket para ticket, FileText para contract
- **Botão "Limpar lidas"**: no header do dropdown com ícone Trash2
- **Tabs de filtro**: Todas | Não lidas (usando contagem como badge)
- **Botão "Ver todas"**: link para `/notifications` no footer do dropdown
- **Excluir individual**: ícone X em cada item no hover

### 3. `src/pages/notifications/NotificationsPage.tsx` (novo)
- Página completa `/notifications` com lista paginada (20 por vez, scroll infinito)
- Filtros por tipo: Todas, Não lidas, Por tipo (warning, info, success, error)
- Ações em lote: selecionar múltiplas → marcar lidas / deletar
- Empty state elegante quando sem notificações

### 4. `src/components/layout/AnimatedRoutes.tsx`
- Adicionar rota `/notifications` (lazy) protegida para staff

### 5. `src/hooks/usePushNotifications.ts`
- Migrar de `useToast` para `toast` do `sonner`

### 6. `src/hooks/useNotifications.tsx` — Realtime para clientes
- Adicionar subscription de notificações também para usuários com role `client`/`client_master` (hoje o realtime é só para `isStaff`)

## Arquivos Modificados

| Arquivo | Ação |
|---|---|
| `src/hooks/useNotifications.tsx` | + delete + clearAllRead mutations |
| `src/components/notifications/NotificationDropdown.tsx` | Navegação + ícones + limpar + tabs |
| `src/pages/notifications/NotificationsPage.tsx` | Novo — página completa |
| `src/components/layout/AnimatedRoutes.tsx` | + rota `/notifications` |
| `src/hooks/usePushNotifications.ts` | Migrar para sonner |
| `src/hooks/useUnifiedRealtime.tsx` | Notificações para clientes também |
