# Calendário e Agendamento

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Agenda interna funcional: CRUD de calendar_events feito 100% direto no Postgres via supabase-js (RLS por user_id), renderizado com FullCalendar. A integração Google Calendar está half-wired: o form de config gera a URL OAuth (action auth_url) e redireciona ao Google, mas NENHUM handler captura o ?code de volta em /settings nem chama a action callback — os tokens nunca são trocados/salvos. As actions sync_event/delete_event da edge existem porém nenhuma tela as invoca, então a sincronização é código morto na prática (CRUD não pluga na edge). Enum billing_reminder e coluna invoice_id são artefatos abandonados (nunca escritos).

## Integrações

- Google Calendar API v3 via OAuth2 (edge google-calendar): auth_url funcional; callback/sync_event/delete_event implementados porém NUNCA invocados pelo app.
- integration_settings(integration_type='google_calendar'): client_id/secret/redirect_uri, lido pela edge e pelo useIntegrationSettings no form.
- google_calendar_integrations: tokens por usuário (RLS owner) — escrito só no callback (morto); lido/deletado direto pelo GoogleCalendarConfigForm (checar conexão / desconectar).
- FullCalendar (@fullcalendar/react + daygrid/timegrid/list/interaction) — render e interação da agenda interna.

## Fluxos (rota → componente → hook → edge → tabela)

- /calendar -> ProtectedRoute(requireStaff) -> CalendarPage -> useQuery('calendar_events') select *,clients(name) por range (RLS user_id) -> FullCalendarWrapper (render)
- CalendarPage 'Novo Evento'/dateClick -> EventForm.submit -> supabase.from('calendar_events').insert (direto, user_id=auth) -> invalidate ['calendar-events']
- CalendarPage drag/drop/resize -> updateEventMutation -> update calendar_events(start_time,end_time) (editable sempre true, sem gate de permissão)
- EventDetailsSheet (bottom sheet) -> deleteMutation -> delete calendar_events by id (direto)
- /settings -> IntegrationsTab -> GoogleCalendarConfigForm 'Conectar' -> invoke('google-calendar', action:auth_url) -> redirect accounts.google.com -> volta /settings?code=&state=user_id -> [SEM handler: ?code ignorado, callback nunca chamado] -> tokens não salvos
- GoogleCalendarConfigForm mount -> select google_calendar_integrations by user_id (checa conexão) / 'Desconectar' -> delete google_calendar_integrations (direto)
- TechnicianDashboard -> useQuery('today-events') select calendar_events por user_id/dia (leitor separado do módulo, read-only)

## Regras de negócio

- Range de eventos = semana que cobre o mês corrente (startOfWeek(startOfMonth)..endOfWeek(endOfMonth)) — src/pages/calendar/CalendarPage.tsx:36-44
- Permissões: canCreate=can('calendar','create') gate no botão e dateClick; canEdit computado porém não usado — src/pages/calendar/CalendarPage.tsx:56-57,61,123,203
- Auto-abre form de criação via ?action=new quando canCreate — src/pages/calendar/CalendarPage.tsx:60-66
- EventForm só permite 5 tipos (visit/meeting/on_call/unavailable/personal); billing_reminder ausente — src/components/calendar/EventForm.tsx:34
- start_time/end_time montados de start_date + hora local no mesmo dia (não trata fim<início nem cruzar meia-noite) — src/components/calendar/EventForm.tsx:93-94
- Cores/labels por event_type (6 valores incl. billing_reminder só p/ exibição) — src/components/calendar/FullCalendarWrapper.tsx:17-33 e EventDetailsSheet.tsx:23-39
- View responsiva: mobile listWeek / desktop dayGridMonth, troca no resize <768px — src/components/calendar/FullCalendarWrapper.tsx:82-100,141
- Grade 06:00-22:00, locale pt-br, formato 24h — src/components/calendar/FullCalendarWrapper.tsx:162,194-195
- Edge exige integração ativa + client_id/secret antes de qualquer action, senão 400 — supabase/functions/google-calendar/index.ts:41-71
- OAuth scopes calendar.events + calendar.readonly, access_type=offline, prompt=consent, state=user_id — supabase/functions/google-calendar/index.ts:78-90
- sync_event renova access_token via refresh_token quando token_expires_at expirou — supabase/functions/google-calendar/index.ts:166-192
- Eventos enviados ao Google com timeZone America/Sao_Paulo (ou date p/ all_day) — supabase/functions/google-calendar/index.ts:210-215
- Draft de criação persistido em sessionStorage (key event_new) — src/components/calendar/EventForm.tsx:72-76

## Arquivos-chave

- `src/pages/calendar/CalendarPage.tsx` — Página/rota /calendar: lista calendar_events por range de data, orquestra criação (EventForm), detalhes/exclusão (EventDetailsSheet) e drag/drop/resize (update direto na tabela).
- `src/components/calendar/FullCalendarWrapper.tsx` — Wrapper do FullCalendar (dayGrid/timeGrid/list/interaction): mapeia eventos->cores/labels por event_type, view responsiva, handlers de click/drop/resize/select/datesSet.
- `src/components/calendar/EventForm.tsx` — Formulário APENAS de criação de evento (insert em calendar_events) com Zod + draft persistence de sessão.
- `src/components/calendar/EventDetailsSheet.tsx` — Bottom-sheet de detalhes do evento com botão excluir (delete direto) e botão Editar condicional a onEdit. _(uso: parcial)_
- `src/components/settings/integrations/GoogleCalendarConfigForm.tsx` — Config OAuth do Google Calendar (client_id/secret/redirect via integration_settings) + Conectar (auth_url)/Desconectar (delete google_calendar_integrations).
- `supabase/functions/google-calendar/index.ts` — Edge Deno com 4 actions: auth_url (gera URL OAuth), callback (troca code por token), sync_event (cria/atualiza evento no Google), delete_event (remove no Google). _(uso: parcial)_

## Pontos de atenção / riscos

- Integração Google Calendar está efetivamente NÃO-FUNCIONAL de ponta a ponta: sem handler de ?code em /settings, o OAuth nunca completa (tokens não salvos), então mesmo que sync_event fosse chamado não haveria integração. É a maior lacuna do módulo.
- CRUD totalmente desacoplado da sincronização: insert/update/delete escrevem direto em calendar_events e nunca disparam sync_event/delete_event -> Google nunca reflete mudanças (por design atual, mas provavelmente não intencional).
- Não há fluxo de EDIÇÃO de evento: EventForm é insert-only e onEdit nunca é passado; usuário só cria, arrasta/redimensiona ou exclui.
- supabase/functions/google-calendar viola a convenção §6.6 do CLAUDE.md: sem logic.ts e sem testes (*_test.ts); usa `error: any` (index.ts:306).
- Segurança: sync_event/delete_event usam service role e confiam no user_id vindo do body sem checar contra o JWT autenticado — qualquer usuário logado poderia operar eventos de outro user_id caso as actions fossem expostas.
- Bug potencial no drag/drop de evento all-day: se end for null, força +1h (FullCalendarWrapper.tsx:116-118), o que descaracteriza o all_day ao gravar.
- Artefatos mortos acumulados (billing_reminder, invoice_id, google_event_id/calendar_id, sync_enabled) inflam o schema/tipos sem uso — candidatos a limpeza (regra do escoteiro).

## Código morto — tratado na Fase 2 ou pendente de decisão

- `action "callback" (edge google-calendar)` (supabase/functions/google-calendar/index.ts:98) — Nenhum handler no frontend captura ?code após o redirect do Google nem invoca action:'callback' -> loop OAuth quebrado, tokens nunca salvos.
- `action "sync_event" (edge google-calendar)` (supabase/functions/google-calendar/index.ts:152) — Nenhuma tela chama; CRUD escreve direto na tabela sem sincronizar.
- `action "delete_event" (edge google-calendar)` (supabase/functions/google-calendar/index.ts:270) — EventDetailsSheet faz delete direto na tabela, nunca chama a edge.
- `prop onEdit (EventDetailsSheet)` (src/components/calendar/EventDetailsSheet.tsx:45) — CalendarPage renderiza EventDetailsSheet sem onEdit; não há fluxo de edição de evento (EventForm é só insert). Botão Editar nunca renderiza.
- `const canEdit` (src/pages/calendar/CalendarPage.tsx:57) — Variável computada (can('calendar','edit')) e nunca usada — drag/drop/resize (editable=true) não é gated por ela.
- `enum event_type 'billing_reminder'` (src/integrations/supabase/types.ts:7398) — Só aparece em mapas de exibição (cores/labels); nenhum código insere evento desse tipo. EventForm nem oferece a opção (zod enum tem 5 valores).
- `coluna calendar_events.invoice_id` (supabase/migrations/20260120152857_...sql:19) — Adicionada para lembretes de cobrança; índice depois removido (20260126233517); nenhum código lê/escreve.
- `colunas google_event_id / google_calendar_id / sync_enabled / last_sync_at` (supabase/functions/google-calendar/index.ts:197,259) — Só tocadas por sync_event/callback, ambos nunca invocados -> dead na prática.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA (docs/MAPA_DE_SETORES.md §14, ~L515-552 e §Integrações ~L1206-1223) está SURPREENDENTEMENTE ALINHADO ao código: já documenta o callback não capturado, sync órfã, e artefatos mortos (billing_reminder, invoice_id, onEdit, canEdit) — confirmado, sem contradição.
- MAPA L522 lista tabelas do módulo como 'calendar_events, google_calendar_integrations, integration_settings, clients (read-only), invoices (FK invoice_id nao usada)' mas OMITE a FK calendar_events.ticket_id, que existe no schema (types.ts:568 calendar_events_ticket_id_fkey) — divergência menor de completude.
- MAPA L538 diz 'Edge nao valida JWT/identidade para sync_event/delete_event'. Nuance: google-calendar NÃO está em supabase/config.toml (grep=0), logo verify_jwt assume o default true (JWT exigido no gateway); o que falta é checagem de identidade por-usuário no código (usa service role e confia no user_id do body). O JWT em si é exigido.
- Checklist do MAPA (L552 'Limpar artefatos mortos: billing_reminder, invoice_id, reminder_sent, onEdit, canEdit') continua ABERTO — nenhum foi removido no código atual; nota: coluna 'reminder_sent' citada no MAPA não foi encontrada em migrations/types (grep=0), pode já não existir.

