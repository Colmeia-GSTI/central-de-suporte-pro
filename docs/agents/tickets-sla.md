# Chamados / Tickets e SLA

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Modulo cobre o ciclo completo do chamado (criacao via RPC atomica, fila, atendimento com cronometro/sessoes, pausas, transferencia, resolucao com registro de tempo/KB, avaliacao) e exibicao de SLA em horario comercial calculado client-side. Codigo esta amplamente em uso e bem cabeado, mas ha duas nocoes DESCONEXAS de SLA: o display (sla-calculator.ts) versus a coluna tickets.sla_deadline que NUNCA e escrita em lugar nenhum do repo — o que torna notify-sla-breach um no-op operacional e zera as metricas de SLA do Dashboard. Ha ainda escrita duplicada de historico/sessoes (TicketsPage vs useTicketAttendance) e um TicketRatingDialog morto dentro do TicketsPage. O MAPA_DE_SETORES ja documenta a maioria destes riscos com precisao.

## Integrações

- Email: send-email-resend e send-email-smtp (via send-ticket-notification e notify-sla-breach)
- WhatsApp: Evolution API via send-whatsapp (integration_settings.evolution_api)
- Telegram: send-telegram (integration_settings.telegram) — obs: send-ticket-notification usa snake_case (chat_id/parse_mode) enquanto notify-sla-breach/check-no-contact usam camelCase (chatId/parseMode)
- Web Push: send-push-notification (obs: notify-sla-breach e check-no-contact enviam contrato {userId,title,body,url} divergente do esperado {type,role_filter/user_ids,data})
- Supabase Storage: bucket ticket-attachments (anexos de comentarios)
- RPCs: create_staff_ticket (criacao atomica), get_ticket_form_data (tecnicos/categorias/ativos)
- Gamificacao: technician_points (avaliacao >=4)
- KB: knowledge_articles (sugestoes na abertura e artigo gerado na resolucao)
- Ativos/RMM: assets e monitored_devices (DeviceSelector/AssetSelectionDialog)

## Fluxos (rota → componente → hook → edge → tabela)

- /tickets -> TicketsPage -> useQuery('tickets') supabase.from('tickets') (+clients/categories/tags/requester_contact/monitored_device) -> Tabela/Kanban/MobileCard
- /tickets [Iniciar] -> handleStartTicket -> AssetSelectionDialog (rpc get_ticket_form_data) -> startTicketMutation -> UPDATE tickets(status=in_progress,assigned_to,started_at,first_response_at,asset) + INSERT ticket_attendance_sessions + INSERT ticket_history
- /tickets -> TicketDetails -> TicketAttendancePanel -> useTicketAttendance start/resume -> ticket_attendance_sessions + ticket_pauses + tickets + ticket_history; registro manual -> ticket_time_entries
- /tickets -> TicketDetails -> TicketPauseDialog -> INSERT ticket_pauses(auto_resume_at p/ no_contact) + fecha sessao + UPDATE tickets.status + ticket_history
- /tickets -> TicketDetails -> TicketResolveDialog -> INSERT ticket_time_entries(extra) + fecha sessao + UPDATE tickets(resolved,resolved_at,resolution_notes) + ticket_history + (opcional) knowledge_articles
- /tickets -> TicketDetails -> NoContactButton -> UPDATE tickets(no_contact) + ticket_history + ticket_comments(publico) -> invoke send-ticket-notification(updated)
- /tickets -> TicketDetails -> TicketTransferDialog -> INSERT ticket_transfers + UPDATE tickets(assigned_to/department_id) + ticket_history
- /tickets -> TicketDetails(aba Detalhes) -> TicketDetailsTab select Status -> handleStatusChange(validTransitions) -> sessoes/pausas/tickets(resolved_at) + ticket_history -> invoke send-ticket-notification(resolved|updated)
- /tickets/new -> NewTicketPage -> TicketForm -> rpc create_staff_ticket (atomico) -> (external) invoke send-ticket-notification(created)
- SLA display: SLAIndicator -> sla_configs (precedencia cliente+cat>cliente>cat>prioridade) + company_settings.business_hours + ticket_pauses -> sla-calculator.calculateSLAStatus (client-side)
- CRON -> notify-sla-breach -> SELECT tickets(status ativo, sla_deadline<=janela) -> notifications + send-push/email/whatsapp/telegram  [QUEBRADO: sla_deadline nunca populado => 0 tickets]
- CRON -> check-no-contact-tickets -> ticket_pauses(auto_resume vencido)/tickets(no_contact) -> UPDATE tickets(open) + notifications + send-push; lembretes 24h/48h por updated_at
- /tickets -> TicketDetails -> TicketCommentsTab -> Storage(ticket-attachments) + INSERT ticket_comments + ticket_history -> (publico) invoke send-ticket-notification(commented)
- Sidebar -> useTechnicianTicketCount -> COUNT tickets(assigned_to=user, status open/in_progress/waiting) -> badge

## Regras de negócio

- SLA conta apenas horario comercial e desconta pausas: sla-calculator.ts:83 (calculateElapsedBusinessMinutes) e :238-247 (desconto de pausas na resolucao)
- Horario comercial padrao Seg-Sex 08:30-11:45 e 13:30-18:00 America/Sao_Paulo: SLAIndicator.tsx:29-36 (DEFAULT_BUSINESS_HOURS)
- Precedencia de SLA config: cliente+categoria > cliente > categoria > prioridade, com fallback so-prioridade: SLAIndicator.tsx:59-83
- Cores de SLA por % restante (<=25 destrutivo, <=50 laranja, <=75 amarelo): sla-calculator.ts:179-188
- Tempo trabalhado = soma das sessoes de atendimento, sessao aberta limitada a resolved_at; fallback para started_at em dados legados: attendance-time.ts:27-47
- Cronometro so avanca com status in_progress; SLAIndicator para de atualizar quando resolvido: useTicketAttendance.ts:39-44; SLAIndicator.tsx:44-52
- Iniciar atendimento fecha sessoes orfas, cria sessao e (na 1a vez) grava started_at/first_response_at: TicketsPage.tsx:295-330; useTicketAttendance.ts:106-143
- Iniciar exige selecao/descricao de dispositivo (chamado open sem tecnico): TicketsPage.tsx:346-350; AssetSelectionDialog.tsx:99-124
- Tipos de pausa manual/no_contact/third_party -> status paused/no_contact/waiting_third_party; no_contact define auto_resume_at: TicketPauseDialog.tsx:45-93
- Resolver exige notas >=10 chars; opcionalmente cria artigo KB e registra tempo extra: TicketResolveDialog.tsx:267,164-234
- Avaliacao >=4 estrelas concede pontos ao tecnico (5=15, 4=10) e muda status para closed: TicketRatingDialog.tsx:46-53,73-89
- No_contact adiciona comentario publico e notifica o cliente para retornar contato: NoContactButton.tsx:38-89
- Auto-resume: pausas no_contact vencidas voltam a status open + notificam; lembretes 24h/48h baseados em updated_at: check-no-contact-tickets/index.ts:117-180,182-314
- notify-sla-breach: cooldown 60min, janela de aviso 30min, e-mail so nos ultimos 10min/violado, gestores avisados em violacao high/critical: notify-sla-breach/index.ts:16-19,178,239-262
- Maquina de transicoes de status validas guarda mudancas manuais: TicketDetailsTab.tsx:340-349 (validTransitions)
- Criacao atomica via RPC create_staff_ticket; notificacao de criacao so para 'external': TicketForm.tsx:217-248
- Interno/tarefa nao aplicam SLA e nao notificam cliente: TicketForm.tsx:241,552-556; gating isInternal em send-ticket-notification/index.ts:58,94-95,154,238
- Lista default 'active' exclui resolved/closed; paginacao por cursor de created_at: TicketsPage.tsx:225,214,242-246

## Arquivos-chave

- `src/pages/tickets/TicketsPage.tsx` — Tela principal: lista/kanban de chamados, filtros, acoes em lote, inicio de atendimento (com AssetSelectionDialog) e sheet de detalhes com dialogs de transferir/pausar/resolver/avaliar
- `src/pages/tickets/NewTicketPage.tsx` — Rota /tickets/new; wrapper de ErrorBoundary + TicketForm, le initialData de query params
- `src/lib/sla-calculator.ts` — Regra pura de SLA em horario comercial: minutos uteis decorridos/restantes, status resposta+resolucao, desconto de pausas, cores
- `src/lib/attendance-time.ts` — Regra pura de tempo de atendimento: trabalhado (soma sessoes, cap em resolved_at), pausado, espera, decorrido; formatadores
- `src/hooks/useTicketAttendance.ts` — Hook do cronometro: busca sessoes/pausas, calcula tempos, mutations start/resume (fecha sessao orfa, cria sessao, grava historico)
- `src/hooks/useTechnicianTicketCount.ts` — Conta chamados ativos do tecnico logado (badge da sidebar)
- `src/hooks/useTechnicianList.ts` — Lista staff (technician/manager/admin) para selects de atribuicao/filtro
- `src/hooks/useSavedViews.ts` — Persiste 'vistas' de filtros em localStorage (nao usa banco)
- `src/hooks/useClientMonitoredDevices.ts` — Busca dispositivos monitorados (RMM) do cliente; exporta type ClientMonitoredDevice
- `supabase/functions/send-ticket-notification/index.ts` — Notificacao multicanal (email/WhatsApp/Telegram/push) por evento created/updated/commented/resolved; so externo notifica cliente
- `supabase/functions/notify-sla-breach/index.ts` — Cron: alerta tecnico/gestores de SLA em risco/violado lendo tickets.sla_deadline _(uso: parcial)_
- `supabase/functions/check-no-contact-tickets/index.ts` — Cron: auto-retoma pausas no_contact vencidas (status->open) e lembretes 24h/48h; respeita interval_minutes de integration_settings
- `src/components/tickets/TicketAttendancePanel.tsx` — Painel de cronometro (tempo trabalhado/pausado/espera/decorrido) + botoes iniciar/pausar/retomar/encerrar + secao de registro manual de tempo (ticket_time_entries)
- `src/components/tickets/TicketDetails.tsx` — Cabecalho do chamado + acoes (NoContact/Transferir) + TicketAttendancePanel + abas comentarios/detalhes/historico
- `src/components/tickets/SLAIndicator.tsx` — Badge de SLA (compacto/completo) calculado client-side; busca sla_configs, company_settings.business_hours e ticket_pauses
- `src/components/tickets/TicketResolveDialog.tsx` — Finalizar chamado: notas (min 10), tempo extra, criar artigo KB; fecha sessao, seta resolved_at, grava historico
- `src/components/tickets/TicketRatingDialog.tsx` — Avaliacao 1-5 estrelas: seta status closed e concede pontos ao tecnico se >=4 _(uso: parcial)_
- `src/components/tickets/TicketPauseDialog.tsx` — Pausa manual/no_contact/third_party: cria ticket_pauses (auto_resume_at p/ no_contact), fecha sessao, muda status
- `src/components/tickets/NoContactButton.tsx` — Marca status no_contact, comentario publico e notifica cliente (send-ticket-notification)
- `src/components/tickets/TicketTransferDialog.tsx` — Transfere para tecnico ou departamento (feature-flag), grava ticket_transfers + historico
- `src/components/tickets/TicketStatsBar.tsx` — Cards de contagem por status (open/progress/waiting/paused/unassigned/resolved) + interno/tarefa, clicaveis como filtro
- `src/components/tickets/TicketsKanbanView.tsx` — Kanban com drag&drop que muda status; colunas open/in_progress/waiting/paused/waiting_third_party/resolved
- `src/components/tickets/TicketFilters.tsx` — Painel de filtros expandido (prioridade/tecnico/cliente/tipo) + salvar vista
- `src/components/tickets/TicketForm.tsx` — Formulario de criacao (externo/interno/tarefa) com Zod, KBSuggestions, DeviceSelector; submete via rpc create_staff_ticket
- `src/components/tickets/TicketDetailsTab.tsx` — Aba detalhes: edicao inline, troca de status com maquina validTransitions + side-effects (sessoes/pausas/resolved_at), historico recente, links
- `src/components/tickets/TicketCommentsTab.tsx` — Comentarios publicos/internos com anexos (Storage) + macros; notifica cliente em comentario publico
- `src/components/tickets/TicketHistoryTab.tsx` — Timeline de ticket_history com deteccao de tipo de evento por comentario e field_changes
- `src/components/tickets/TicketMobileCard.tsx` — Card de chamado para viewport mobile (status/prioridade/SLA/iniciar)
- `src/components/tickets/TicketTypeBadge.tsx` — Badge Interno/Tarefa (nada para externo)
- `src/components/tickets/AssetSelectionDialog.tsx` — Dialog ao iniciar atendimento: escolher ativo cadastrado ou descrever dispositivo; usa rpc get_ticket_form_data
- `src/components/tickets/shared/DeviceSelector.tsx` — Seletor unificado RMM/ativo/texto-livre de dispositivo (DeviceSelectorValue)
- `src/components/tickets/KBSuggestions.tsx` — Sugestoes de artigos da KB por ilike no titulo/descricao durante criacao
- `src/components/tickets/RequesterContactCard.tsx` — Card do solicitante com atalhos tel/WhatsApp/email e computador relacionado
- `src/components/tickets/TagBadge.tsx` — Badge visual de tag (cor + remover)
- `src/components/tickets/TagsInput.tsx` — Seletor multi-tag (ticket_tags) com popover de busca
- `src/components/tickets/TicketLinksSection.tsx` — Vinculo entre chamados (ticket_links: related/duplicates/parent/child)

## Pontos de atenção / riscos

- CRITICO: tickets.sla_deadline nunca e escrito no repo (0 writes) -> notify-sla-breach processa 0 chamados e metrica SLA do Dashboard (get_dashboard_stats) fica sempre 100%/vazia. Ou implementar trigger p/ preencher sla_deadline, ou reescrever notify-sla-breach usando sla-calculator.ts.
- Duas fontes de SLA desconexas: display client-side (sla-calculator.ts, horario comercial+pausas) vs sla_deadline absoluto (edge/dashboard). Nunca convergem.
- Fluxo de 'iniciar atendimento' duplicado: startTicketMutation (TicketsPage) e startMutation (useTicketAttendance) fazem quase o mesmo (sessao+status+historico) por caminhos paralelos — candidato a unificar.
- 3 edges (send-ticket-notification, notify-sla-breach, check-no-contact-tickets) nao estao em supabase/config.toml -> verify_jwt=true por default; as duas de cron precisam de JWT service-role senao retornam 401.
- check-no-contact-tickets usa updated_at para janelas 24h/48h: qualquer edicao do chamado reseta o relogio de lembrete.
- notify-sla-breach so cria notificacao in-app quando ha assigned_to; chamados na fila sem tecnico nao geram alerta de SLA.
- Kanban muda status por drag&drop sem passar pela maquina validTransitions do TicketDetailsTab nem pelos side-effects de sessao/pausa (inconsistencia de regras entre os dois caminhos de mudanca de status).
- TicketRatingDialog no TicketsPage e codigo morto (isRatingOpen nunca ativado); prop firstResponseAt do TicketResolveDialog e passada mas ignorada.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `tickets.sla_deadline (coluna) + notify-sla-breach` (supabase/functions/notify-sla-breach/index.ts:73) — A funcao filtra tickets por sla_deadline nao-nulo, mas NENHUM ponto do repo escreve sla_deadline (sem default/generated/trigger/RPC). create_staff_ticket nao seta. Resultado: sempre 0 chamados processados; alertas de SLA inoperantes e metrica SLA do Dashboard sempre 100%/vazia
- `isRatingOpen / TicketRatingDialog (instancia no TicketsPage)` (src/pages/tickets/TicketsPage.tsx:107) — Estado isRatingOpen so e passado como onOpenChange (fecha); nao existe setIsRatingOpen(true) em lugar algum — o dialog de avaliacao dentro do TicketsPage nunca abre (avaliacao real ocorre no portal do cliente)
- `firstResponseAt (prop)` (src/components/tickets/TicketResolveDialog.tsx:37) — Prop declarada na interface e passada por TicketsPage.tsx:852, mas nao e desestruturada nem usada dentro do componente

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA esta em grande parte CORRETO e ate ja documenta os principais riscos deste modulo — poucas divergencias reais. Ja registra: sla_deadline nunca escrito (L180), 3 edges fora do config.toml herdando verify_jwt=true (L183), escrita duplicada de historico useTicketAttendance vs TicketsPage (L185), check-no-contact usar updated_at (L187), notify-sla-breach so alertar se houver assigned_to (L188), mismatch de contrato do push (L1185) e Telegram camelCase (L1135). Tudo confirmado no codigo.
- MAPA L166 (lista de componentes) OMITE componentes existentes do modulo: KBSuggestions, TagsInput, TagBadge, TicketLinksSection, TicketMobileCard, TicketTypeBadge, RequesterContactCard.
- MAPA nao sinaliza que a instancia de TicketRatingDialog no TicketsPage e morta (isRatingOpen nunca vira true) — avaliacao pelo staff nesta tela nao existe (so no portal).
- MAPA nao registra que o deep-link de push /tickets?open=<id> (send-ticket-notification:248) nao e tratado pelo TicketsPage (que so le ?action=new) — clique no push nao abre o chamado.
- MAPA nao registra que o Kanban (TicketsKanbanView) nao tem colunas no_contact nem closed, entao chamados 'Sem Contato' somem da visao kanban.
- Maturidade 'parcial' no indice (L23) confere com o estado real do modulo.

