

# Plano: Calendário Completo e Responsivo (Estilo Google Calendar)

## Diagnóstico do Problema Atual

A implementação atual do calendário tem várias limitações:

1. **Problemas em Mobile**:
   - Layout fixo `grid-cols-7` que não adapta para telas pequenas
   - Células com `min-h-[80px]` que ocupam muito espaço vertical
   - Sidebar de eventos em layout lado-a-lado (`lg:grid-cols-[1fr_350px]`) que não funciona bem em mobile
   - Textos e eventos muito pequenos para toque

2. **Funcionalidades Faltando (vs Google Calendar)**:
   - Sem visualização de Semana (Week View)
   - Sem visualização de Dia (Day View)
   - Sem visualização de Agenda/Lista (List View)
   - Sem arrastar e soltar eventos
   - Sem redimensionar eventos
   - Sem suporte a eventos multi-dia
   - Sem cores por calendário/categoria

3. **Erro React Console**:
   - O Dialog está recebendo ref incorretamente (warning de Function components)

---

## Solucao Proposta

Substituir a implementacao manual por **FullCalendar** - a biblioteca mais completa e usada para calendarios em React, com suporte nativo a todas as funcionalidades do Google Calendar.

### Por que FullCalendar?
- Responsivo por padrao com deteccao automatica de mobile
- Visualizacoes: Mes, Semana, Dia, Agenda/Lista
- Suporte nativo a touch/gestos em mobile
- Drag & Drop para mover eventos
- Redimensionar eventos arrastando bordas
- Eventos multi-dia
- Integracao com React e TypeScript
- Amplamente usado e documentado

---

## Etapas de Implementacao

### Etapa 1: Instalacao de Dependencias

Instalar os pacotes do FullCalendar:
- `@fullcalendar/react` - Componente React
- `@fullcalendar/core` - Core do calendario
- `@fullcalendar/daygrid` - Visualizacao de mes/dia em grid
- `@fullcalendar/timegrid` - Visualizacao de semana/dia com horarios
- `@fullcalendar/list` - Visualizacao de agenda/lista
- `@fullcalendar/interaction` - Drag & Drop, redimensionar, selecao

### Etapa 2: Criar Componente FullCalendar Responsivo

Novo arquivo `src/components/calendar/FullCalendarWrapper.tsx`:

```text
Funcionalidades:
+------------------------------------------+
|  [Hoje] [<] [>]  Janeiro 2026  [M][S][D][A] |
+------------------------------------------+
|                                          |
|   VISUALIZACAO DO CALENDARIO             |
|   - Mes: Grid tradicional                |
|   - Semana: Timeline com horarios        |
|   - Dia: Timeline detalhado              |
|   - Agenda: Lista de eventos             |
|                                          |
+------------------------------------------+

Comportamento Mobile:
- Toolbar compactada com botoes menores
- Visualizacao padrao: Agenda (listWeek)
- Swipe para navegar entre semanas/meses
- Eventos com area de toque maior
```

### Etapa 3: Refatorar CalendarPage.tsx

1. Remover implementacao manual do grid de dias
2. Integrar FullCalendarWrapper
3. Manter logica de dados (query de eventos)
4. Adaptar formulario de eventos para Sheet em mobile
5. Adicionar callbacks para:
   - `eventClick`: Abrir detalhes do evento
   - `dateClick`: Criar novo evento na data
   - `eventDrop`: Mover evento (atualizar no banco)
   - `eventResize`: Alterar duracao do evento
   - `select`: Selecionar intervalo para novo evento

### Etapa 4: Estilizacao e Tema

Criar estilos CSS para integrar FullCalendar com o tema do app:
- Cores consistentes com as variaveis CSS do projeto
- Suporte a dark mode
- Bordas e sombras consistentes com os cards

### Etapa 5: Funcionalidades Adicionais

1. **Eventos Multi-dia**: Suporte nativo do FullCalendar
2. **Categorias com Cores**: Usar `backgroundColor` por tipo de evento
3. **Sincronizacao Google Calendar**: Ja existe edge function, integrar UI
4. **Lembretes/Notificacoes**: Integrar com sistema de push existente

---

## Mapeamento de Tipos de Evento para Cores

| Tipo | Cor Atual | Nova Cor (FullCalendar) |
|------|-----------|-------------------------|
| visit | bg-status-progress | var(--status-progress) |
| meeting | bg-primary | var(--primary) |
| on_call | bg-status-warning | var(--status-warning) |
| unavailable | bg-muted | var(--muted) |
| personal | bg-accent | var(--accent) |
| billing_reminder | bg-destructive | var(--destructive) |

---

## Arquivos a Serem Modificados

| Arquivo | Acao |
|---------|------|
| `package.json` | Adicionar dependencias FullCalendar |
| `src/components/calendar/FullCalendarWrapper.tsx` | CRIAR - Componente wrapper |
| `src/pages/calendar/CalendarPage.tsx` | REFATORAR - Usar FullCalendar |
| `src/index.css` | ADICIONAR - Estilos FullCalendar |
| `src/components/calendar/EventDetailsSheet.tsx` | CRIAR - Sheet para detalhes em mobile |

---

## Secao Tecnica

### Configuracao do FullCalendar

```typescript
// Configuracao responsiva
const calendarOptions = {
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: isMobile ? 'listWeek' : 'dayGridMonth',
  headerToolbar: isMobile 
    ? { left: 'prev,next', center: 'title', right: 'listWeek,dayGridDay' }
    : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
  editable: true,
  selectable: true,
  selectMirror: true,
  dayMaxEvents: true, // Mostra "+2 mais" quando muitos eventos
  weekends: true,
  locale: ptBrLocale,
  // Callbacks
  eventClick: handleEventClick,
  dateClick: handleDateClick,
  eventDrop: handleEventDrop,
  eventResize: handleEventResize,
  select: handleSelect,
};
```

### Tratamento de Resize para Mobile

```typescript
// Mudar visualizacao quando redimensiona
windowResize: (arg) => {
  if (arg.view.calendar.el.offsetWidth < 768) {
    arg.view.calendar.changeView('listWeek');
  }
}
```

### Integracao com Dados Existentes

Os eventos do banco serao mapeados para o formato FullCalendar:
```typescript
events.map(event => ({
  id: event.id,
  title: event.title,
  start: event.start_time,
  end: event.end_time,
  allDay: event.all_day,
  backgroundColor: eventTypeColors[event.event_type],
  extendedProps: {
    client: event.clients?.name,
    location: event.location,
    type: event.event_type,
  }
}))
```

---

## Resultado Esperado

Apos a implementacao:

1. **Mobile**: Visualizacao de agenda (lista) como padrao, facil de navegar com toque
2. **Desktop**: Todas as visualizacoes (Mes, Semana, Dia, Agenda)
3. **Interatividade**: Arrastar eventos para mover, redimensionar para alterar duracao
4. **Touch-friendly**: Areas de toque maiores, gestos de swipe
5. **Consistencia visual**: Integrado com o tema dark/light do app

