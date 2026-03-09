

# Implementação de Agrupamento Inteligente de Notificações

## Análise do Sistema Atual

Analisando o código existente:
- `useNotifications.tsx`: Busca notificações individuais da tabela `notifications`
- `NotificationDropdown.tsx`: Exibe lista simples de notificações, uma por linha
- `NotificationsPage.tsx`: Página completa sem agrupamento
- `useUnifiedRealtime.tsx`: Cria notificações individuais para cada evento

**Problema identificado**: Cada evento gera uma notificação separada. Se 10 faturas são geradas simultaneamente, aparecem 10 notificações individuais, causando spam visual.

## Arquitetura da Solução

### 1. Estratégia de Agrupamento por Intervalo Temporal
- **Janela de agrupamento**: 15 minutos
- **Critérios de agrupamento**: `type` + `related_type` + janela temporal
- **Exemplo**: "3 novas faturas geradas há 5 min" em vez de 3 entradas separadas

### 2. Estrutura de Dados Agrupada
```typescript
interface GroupedNotification {
  id: string;
  type: string;
  related_type: string | null;
  count: number;
  latest_created_at: string;
  oldest_created_at: string;
  sample_title: string;
  sample_message: string;
  individual_ids: string[];
  is_read: boolean; // todos lidos = true
  related_ids: string[]; // IDs das entidades relacionadas
}
```

### 3. Lógica de Agrupamento (Frontend)
- **useMemo** no `useNotifications.tsx` para processar notificações brutas
- **Algoritmo**: Agrupar por `type + related_type` dentro de janela de 15min
- **Ordenação**: Por `latest_created_at` desc

### 4. Interface Inteligente

#### NotificationDropdown
- **Entrada agrupada**: "🎫 3 novos chamados criados" (expandível)
- **Click para expandir**: Mostra lista das 3 notificações individuais
- **Navegação inteligente**: 
  - Se `count = 1`: navega direto para a entidade
  - Se `count > 1`: navega para listagem com filtro

#### NotificationsPage
- **Seção "Agrupadas"**: Mostra grupos com opção de expandir
- **Seção "Individuais"**: Notificações que não se agrupam
- **Filtro temporal**: "Últimas 24h", "Última semana", etc.

### 5. Ações de Limpeza Inteligente

#### Limpeza Automática (Background)
- **Edge Function**: `cleanup-old-notifications` (executa diariamente)
- **Regras**: 
  - Notificações lidas > 30 dias: deletar
  - Notificações não lidas > 90 dias: arquivar
  - Manter max 500 notificações por usuário

#### Limpeza Manual
- **"Limpar tudo lido"**: Remove todas as notificações marcadas como lidas
- **"Arquivar grupo"**: Marca grupo inteiro como lido e arquiva
- **"Limpar antigas"**: Remove notificações > 7 dias automaticamente

### 6. Otimização de Realtime

#### Debounce de Notificações no `useUnifiedRealtime`
- **Problema atual**: Cada evento dispara notificação imediata
- **Solução**: Buffer de 30 segundos para eventos similares
- **Implementação**: Acumular eventos por tipo, enviar notificação consolidada

```typescript
// Exemplo de debounce no realtime
const notificationBuffer = useRef<Map<string, NotificationEvent[]>>(new Map());

const flushNotifications = useCallback(() => {
  notificationBuffer.current.forEach((events, key) => {
    if (events.length === 1) {
      // Enviar notificação individual
      createSingleNotification(events[0]);
    } else {
      // Enviar notificação agrupada
      createGroupedNotification(key, events);
    }
  });
  notificationBuffer.current.clear();
}, []);
```

## Implementação Técnica

### Arquivos Novos
- `src/lib/notification-grouping.ts` - Lógica de agrupamento
- `src/components/notifications/GroupedNotificationItem.tsx` - Componente para grupo
- `supabase/functions/cleanup-old-notifications/index.ts` - Limpeza automática

### Arquivos Modificados
- `src/hooks/useNotifications.tsx` - Adicionar lógica de agrupamento e limpeza
- `src/components/notifications/NotificationDropdown.tsx` - Exibir grupos expansíveis
- `src/pages/notifications/NotificationsPage.tsx` - Interface de limpeza avançada
- `src/hooks/useUnifiedRealtime.tsx` - Implementar debounce de notificações

### Database Changes
Adicionar colunas na tabela `notifications`:
```sql
ALTER TABLE notifications 
ADD COLUMN grouped_id uuid,
ADD COLUMN is_grouped boolean DEFAULT false,
ADD COLUMN group_count integer DEFAULT 1;
```

## Benefícios

1. **Redução de Ruído Visual**: 5 notificações → 1 entrada agrupada
2. **Performance**: Menos DOM nodes, consultas mais eficientes
3. **UX Melhorada**: Informação mais digestível, navegação contextual
4. **Limpeza Automática**: Sistema não acumula lixo indefinidamente
5. **Realtime Otimizado**: Menos spam de notificações em eventos em lote

## Fases de Implementação

**Fase 1**: Agrupamento básico no frontend (2-3 arquivos)
**Fase 2**: Interface expandível e navegação inteligente (2-3 arquivos)
**Fase 3**: Limpeza manual e automática (2-3 arquivos + edge function)
**Fase 4**: Otimização de realtime com debounce (1 arquivo)

