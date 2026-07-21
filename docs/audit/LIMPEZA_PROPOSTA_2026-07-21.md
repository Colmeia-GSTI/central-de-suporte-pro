# Proposta de Limpeza (Fase 2) — Central de Suporte Pro

**Data:** 2026-07-21 · **Proposta — NADA é removido aqui.** Evidência completa por item em [`AUDITORIA_2026-07-21.md`](./AUDITORIA_2026-07-21.md) (Partes B/C).

> A remoção efetiva é um **passo separado**, item a item, só após seu sign-off. Marque `[x]` no que autorizar. Itens em "revisar" trazem uma pergunta objetiva.

**Resumo:** 58 símbolos `seguro-remover` em 37 arquivos · 17 itens `revisar-com-usuário`.

## A. Seguro remover (0 refs globais, não toca banco) — agrupado por arquivo

### `.lovable/plan.md` — **arquivo inteiro órfão**
- [ ] `.lovable/plan.md` _(arquivo)_ — Plano de tarefa one-off já concluída (invite-user 409); não é doc de referência, não indexado, 0 refs

### `public/placeholder.svg` — **arquivo inteiro órfão**
- [ ] `placeholder.svg` _(arquivo (asset))_ — Asset default do Lovable, não referenciado

### `src/components/audit/AuditLogFilters.tsx`
- [ ] `AUDITED_TABLES / AUDITED_ACTIONS` _(export)_ — Exportados mas usados apenas no próprio arquivo (map interno); nenhum import externo — poderiam ser const locais não exportadas

### `src/components/auth/PermissionGate.tsx`
- [ ] `PermissionGateAny` _(componente)_ — Componente exportado sem nenhum uso em JSX
- [ ] `PermissionGateAll` _(componente)_ — Componente exportado sem nenhum uso em JSX

### `src/components/calendar/EventDetailsSheet.tsx`
- [ ] `prop onEdit (EventDetailsSheet)` _(export)_ — CalendarPage renderiza EventDetailsSheet sem onEdit; não há fluxo de edição de evento (EventForm é só insert). Botão Editar nunca renderiza.

### `src/components/dashboard/AnimatedStatCard.tsx`
- [ ] `trend (prop)` _(export)_ — Prop trend {value,isPositive} e bloco de render 'vs ontem' nunca passados por nenhum caller

### `src/components/knowledge/ArticleViewer.tsx`
- [ ] `Botão 'Compartilhar' (Share2)` _(componente)_ — Botão renderizado sem onClick — UI morta/decorativa.
- [ ] `Cards de 'Artigos Relacionados'` _(componente)_ — Buttons de artigo relacionado sem onClick — não navegam nem abrem nada.

### `src/components/knowledge/KnowledgeHero.tsx`
- [ ] `Atalho ⌘K` _(componente)_ — kbd ⌘K puramente visual; não há keybinding que foque a busca.

### `src/components/layout/PageTransition.tsx`
- [ ] `RouteChangeLoader` _(export/funcao)_ — Retorna null; 0 usos externos
- [ ] `RouteProgressBar` _(export/funcao)_ — Retorna null; 0 usos externos

### `src/components/reports/ClientManagementReport.tsx`
- [ ] `imports nao usados (Button, Download)` _(export)_ — Button e Download importados mas nunca usados no JSX (regra do escoteiro)

### `src/components/reports/TimeReportTab.tsx`
- [ ] `imports nao usados (Button, startOfMonth, endOfMonth, Building2)` _(export)_ — Symbols importados mas sem uso no corpo

### `src/components/tickets/TicketResolveDialog.tsx`
- [ ] `firstResponseAt (prop)` _(export/prop)_ — Prop declarada na interface e passada por TicketsPage.tsx:852, mas nao e desestruturada nem usada dentro do componente

### `src/components/ui/dropdown-menu.tsx`
- [ ] `DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuShortcut` _(export)_ — Sub-exports shadcn vendored sem referencia externa (vendored — manter)

### `src/components/ui/loading-skeleton.tsx`
- [ ] `PageSkeleton` _(export)_ — Export nunca importado (so CardSkeleton e usado deste arquivo)
- [ ] `TableSkeleton` _(export)_ — Export nunca importado
- [ ] `FormSkeleton` _(export)_ — Export nunca importado
- [ ] `DashboardSkeleton` _(export)_ — Export nunca importado
- [ ] `ListSkeleton` _(export)_ — Export nunca importado

### `src/components/ui/pagination.tsx`
- [ ] `PaginationEllipsis` _(export)_ — Sub-export vendored sem referencia externa

### `src/components/ui/sidebar.tsx`
- [ ] `SidebarInput, SidebarMenuBadge, SidebarMenuSkeleton, SidebarGroupAction, SidebarRail, SidebarMenuAction` _(export)_ — Sub-exports do bloco sidebar shadcn (637 linhas) nunca usados (vendored — manter)

### `src/components/ui/table.tsx`
- [ ] `TableFooter, TableCaption` _(export)_ — Sub-exports shadcn vendored nunca usados fora do arquivo (baixa prioridade — parte de bloco vendored)

### `src/hooks/useAuditLogs.ts`
- [ ] `interface AuditLogFilters` _(export)_ — Interface exportada porém usada só como tipo do parâmetro do próprio hook; nenhum importador externo (só AuditLogRecord é importado de fora) — colide de nome com o componente AuditLogFilters

### `src/hooks/useIntegrationSettings.ts`
- [ ] `retornos load/setSettings de useIntegrationSettings` _(export)_ — O hook retorna load e setSettings, mas nenhum ConfigForm em escopo os desestrutura (usam settings/patch/isActive/setIsActive/loading/loaded/save). Provável superfície morta.

### `src/hooks/useInvoices.ts`
- [ ] `useInvoice(id)` _(export)_ — Hook de fatura única exportado mas sem nenhum caller
- [ ] `useInvalidateInvoices` _(hook)_ — Helper de invalidação sem callers; BillingInvoicesTab e useInvoiceActions duplicam invalidateQueries inline
- [ ] `InvoiceWithErrors` _(export)_ — Type export sem importadores (era do BillingErrorsPanel removido/consolidado)

### `src/hooks/usePermissions.ts`
- [ ] `canViewModule` _(funcao)_ — Retornado por usePermissions mas sem call site
- [ ] `canEditModule` _(funcao)_ — Retornado por usePermissions mas sem call site
- [ ] `canManageModule` _(funcao)_ — Retornado por usePermissions mas sem call site (uso só via PermissionGate.action='manage')

### `src/lib/billing-fsm.ts`
- [ ] `computeInvoiceDerivedState / getDerivedStateDisplay` _(funcao)_ — Só consumidos pelo próprio teste; a UI não deriva estado via FSM (usa StatusBadges + inline)
- [ ] `canResendNotification / canRegenerateBoleto / canEmitNfse / canCancelInvoice / canForcePolling` _(funcao)_ — 5 helpers de permissão só usados no teste; InvoiceActionsPopover só importa canCancelBoleto e canMarkAsPaid e calcula o resto inline (isPendingOrOverdue etc.)

### `src/lib/client-merge.ts`
- [ ] `resolveMergedFields` _(funcao/export)_ — Exportada e testada, mas sem uso em produção — o merge real é feito na RPC SQL merge_clients (COALESCE). Só previewMerge é usada na UI. Função espelha a lógica do SQL apenas como spec/teste.

### `src/lib/export.ts`
- [ ] `formatters` _(export)_ — Objeto de formatadores (date/datetime/currency/boolean) para export nunca importado; nao flagado pelo MAPA

### `src/lib/logger.ts`
- [ ] `devLog` _(export)_ — Wrapper console dev-only nunca importado; substituído na prática pelo singleton logger
- [ ] `Logger.paymentOperation` _(funcao)_ — Método público do logger sem nenhum caller
- [ ] `Logger.nfseOperation` _(funcao)_ — Método público do logger sem nenhum caller
- [ ] `Logger.integrationOperation` _(funcao)_ — Método público do logger sem nenhum caller
- [ ] `Logger.invoiceValidationLog` _(funcao)_ — Método público do logger sem nenhum caller
- [ ] `Logger.clearLogs` _(funcao)_ — Limpeza de logs locais sem caller

### `src/lib/permissions.ts`
- [ ] `getAllowedActions` _(export)_ — Export sem uso; ainda importado (import morto) em usePermissions.ts:2 mas nunca chamado (getActions usa PERMISSIONS_CONFIG diretamente)

### `src/lib/s3-storage.ts, src/components/settings/S3StorageConfigForm.tsx, supabase/functions/test-s3-connection` — **arquivo inteiro órfão**
- [ ] `s3-storage.ts / S3StorageConfigForm.tsx / test-s3-connection` _(arquivo/edge)_ — Símbolos documentados no IMPLEMENTATION_GUIDE §2.2/§3.1/§3.3/§3.4 inexistentes no repo

### `src/lib/storage-utils.ts`
- [ ] `openStorageFileSafe` _(export)_ — Wrapper com toast de openStorageFile nunca importado (só o par downloadStorageFileSafe é usado)

### `src/pages/calendar/CalendarPage.tsx`
- [ ] `const canEdit` _(funcao)_ — Variável computada (can('calendar','edit')) e nunca usada — drag/drop/resize (editable=true) não é gated por ela.

### `src/pages/client-portal/components/portal-types.ts`
- [ ] `PortalTicket.ticket_categories (campo) + join ticket_categories(name) no SELECT de tickets` _(export)_ — Categoria é buscada no join da query de tickets e declarada na interface, mas nunca renderizada em nenhum componente do portal (ClientTicketsList/DetailPanel não exibem categoria). Peso morto na query.

### `src/pages/gamification/GamificationPage.tsx`
- [ ] `badgeIcons (mapa de ícones)` _(export)_ — Chaves do mapa são slugs de NOME (velocista, guardiao_sla, maratonista, cinco_estrelas, resolvedor) mas o lookup usa badge.icon (L191), cujos valores no seed são zap/shield/star/trophy/award/book-open. Interseção = ZERO, logo todos os 6 badges caem no fallback <Star>. O mapa inteiro é morto.

### `src/pages/tickets/TicketsPage.tsx`
- [ ] `isRatingOpen / TicketRatingDialog (instancia no TicketsPage)` _(componente/estado)_ — Estado isRatingOpen so e passado como onOpenChange (fecha); nao existe setIsRatingOpen(true) em lugar algum — o dialog de avaliacao dentro do TicketsPage nunca abre (avaliacao real ocorre no portal do cliente)

### `src/test/example.test.ts` — **arquivo inteiro órfão**
- [ ] `example.test.ts` _(arquivo (teste))_ — Teste placeholder sem cobertura real (expect(true).toBe(true))

### `src/test/mocks/http.ts` — **arquivo inteiro órfão**
- [ ] `mockFetchOnce / restoreFetch (arquivo inteiro)` _(arquivo/funcao)_ — Nenhum teste importa; restoreFetch é no-op

### `supabase/functions/asaas-nfse/index.ts`
- [ ] `action 'get_status'` _(edge)_ — Consulta simples de status sem nenhum invocador; substituída por check_single_status (esse sim usado por NfseProcessingIndicator).
- [ ] `action 'list_services'` _(edge)_ — Listagem de serviços municipais Asaas sem caller; a UI usa a tabela local nfse_service_codes (NfseServiceCodeCombobox).
- [ ] `action 'create_customer'` _(edge)_ — Sem caller; o frontend usa 'sync_customer' (ClientForm) e 'create_test_customer' (AsaasConfigForm); a emissão usa ensureCustomerSync internamente.
- [ ] `action 'retry_failed'` _(edge)_ — Sem caller; o reprocesso de nota é feito re-invocando 'emit'/'emit_standalone' (InvoiceProcessingHistory:205, NfseDetailsSheet:305).

### `supabase/functions/certificate-vault/index.ts`
- [ ] `action 'decrypt'` _(edge)_ — Nenhum caller descriptografa a senha do certificado; a emissão usa o certificado dentro do próprio Asaas. A senha criptografada em certificates.senha_hash nunca é lida.

### `supabase/functions/google-calendar/index.ts`
- [ ] `action "callback" (edge google-calendar)` _(edge)_ — Nenhum handler no frontend captura ?code após o redirect do Google nem invoca action:'callback' -> loop OAuth quebrado, tokens nunca salvos.
- [ ] `action "delete_event" (edge google-calendar)` _(edge)_ — EventDetailsSheet faz delete direto na tabela, nunca chama a edge.

## B. Revisar com usuário (decisão necessária)

Não removível "no escuro": depende de confirmar dado/schema/pg_cron no banco (proibido consultar/alterar) ou é defensivo por design.

- [ ] `tickets.sla_deadline (coluna) + notify-sla-breach` — `supabase/functions/notify-sla-breach/index.ts:73` _(edge/coluna)_
  - A funcao filtra tickets por sla_deadline nao-nulo, mas NENHUM ponto do repo escreve sla_deadline (sem default/generated/trigger/RPC). create_staff_ticket nao seta. Resultado: sempre 0 chamados processados; alertas de SLA inoperantes e metrica SLA do Dashboard sempre 100%/vazia
  - **Ressalva:** A EDGE notify-sla-breach em si esta viva (deployada/cron), mas inerte por dado ausente. O 'morto' confirmado e a POPULACAO da coluna, nao a funcao. Impacto maior que o auditor descreveu (ver achadosAdicionais).
- [ ] `generate-invoice-payments (edge function)` — `supabase/functions/generate-invoice-payments/index.ts` _(edge)_
  - Órfã: nenhum invoke no frontend/edges, fora do config.toml e da tabela de cron. Superseda por generate-monthly-invoices (geração inline) + batch-process-invoices
  - **Ressalva:** Morto no repo. RESSALVA: nao consegui verificar pg_cron no banco (regra: somente leitura, banco proibido). Antes de deletar, confirmar que nenhum job pg_cron invoca esta fn. IntegrationStatusPanel:263 e UI enganosa (ver correcoes).
- [ ] `boleto_status === 'processando' (leitura morta)` — `src/hooks/useInvoiceActions.ts:142` _(funcao)_
  - Enum boleto_processing_status = pendente|gerado|enviado|erro; 'processando' nunca ocorre (checkArtifactReadiness). Mesma leitura morta em resend-payment-notification e batch-process-invoices
  - **Ressalva:** Leitura morta confirmada nos 3 sites (useInvoiceActions:142, resend-payment-notification:101, batch-process-invoices:236). E ramo defensivo. RESSALVA fraca: linhas legadas com 'processando' no banco nao verificaveis (banco proibido); risco baixo dado o enum. AUDITOR PERDEU 4o site: InvoiceProcessingHistory.tsx:124 (mesma leitura morta).
- [ ] `action 'delete_record' (alias legado)` — `supabase/functions/asaas-nfse/index.ts:2107` _(edge)_
  - Alias mantido por compat (cai em archive_record, nunca apaga). Nenhum caller vivo — o frontend usa 'archive_record'.
  - **Ressalva:** E um alias defensivo intencional (retencao fiscal 7 anos, nunca apaga). Morto porem proposital; remocao segura mas de baixa prioridade.
- [ ] `action "sync_event" (edge google-calendar)` — `supabase/functions/google-calendar/index.ts:152` _(edge)_
  - Nenhuma tela chama; CRUD escreve direto na tabela sem sincronizar.
  - **Ressalva:** CRUD do módulo grava direto em calendar_events; nunca sincroniza com o Google.
- [ ] `enum event_type 'billing_reminder'` — `src/integrations/supabase/types.ts:7398` _(export)_
  - Só aparece em mapas de exibição (cores/labels); nenhum código insere evento desse tipo. EventForm nem oferece a opção (zod enum tem 5 valores).
  - **Ressalva:** Morto como PRODUTOR (nada cria evento desse tipo). O valor existe no enum do Postgres (não removível trivialmente); código-morto = só display sem origem de dados.
- [ ] `coluna calendar_events.invoice_id` — `supabase/migrations/20260120152857_...sql:19` _(tabela)_
  - Adicionada para lembretes de cobrança; índice depois removido (20260126233517); nenhum código lê/escreve.
  - **Ressalva:** Coluna órfã (lembrete de cobrança nunca implementado). Deadness de CÓDIGO confirmada; drop físico da coluna é decisão de schema (não verifiquei banco — read-only).
- [ ] `colunas google_event_id / google_calendar_id / sync_enabled / last_sync_at` — `supabase/functions/google-calendar/index.ts:197,259` _(tabela)_
  - Só tocadas por sync_event/callback, ambos nunca invocados -> dead na prática.
  - **Ressalva:** Dead-in-practice: os únicos writers (sync_event/callback) nunca rodam. As 4 colunas estão em 2 tabelas distintas; last_sync_at de google_calendar_integrations não tem sequer writer no código morto.
- [ ] `not_helpful_count` — `src/components/knowledge/*` _(export)_
  - Coluna de banco existe mas nunca é exibida na UI (só helpful_count é mostrado).
  - **Ressalva:** confirmar no banco via Lovable MCP (SELECT) antes de qualquer ação
- [ ] `RPC increment_article_views (branch feliz)` — `src/components/knowledge/ArticleViewer.tsx` _(funcao)_
  - RPC chamada não existe (ausente das migrations e do types.ts Functions); o try sempre lança e cai no fallback update não-atômico. Ramo atômico é efetivamente morto.
  - **Ressalva:** UI decorativa morta confirmada. A função de compartilhar já é coberta pelo 'Copiar link' adjacente — remover o Share2 ou dar-lhe onClick (navigator.share).
- [ ] `exportConfigs` — `src/lib/export.ts:79` _(export)_
  - Objeto de colunas por entidade (tickets/clients/invoices/contracts/assets/managementReport) nunca consumido; cada caller define columns inline
  - **Ressalva:** Faz parte de um bloco morto continuo export.ts:66-136 (formatters + exportConfigs), ~70 linhas nunca importadas.
- [ ] `technician_badges (tabela)` — `src/integrations/supabase/types.ts:5442` _(tabela)_
  - Tabela existe no schema mas NENHUM código de app (frontend/edge) lê ou escreve. Não há lógica de premiação de badges por técnico; a página só mostra o catálogo global de badges. Badges são 'código morto funcional'.
  - **Ressalva:** Morto funcional confirmado. Existe RLS de INSERT ('System can award badges' WITH CHECK admin) mas nenhum código a exercita — tabela + policies órfãs. Não há lógica de premiação por técnico.
- [ ] `badges.description (campo selecionado, não exibido)` — `src/pages/gamification/GamificationPage.tsx:59` _(export)_
  - Query seleciona 'description' dos badges mas a UI (L185-197) só renderiza name+icon; description nunca é exibida.
  - **Ressalva:** Baixo impacto — coluna buscada e nunca usada (over-select). Remover 'description' do select de badges. Não é bug, é dívida de limpeza.
- [ ] `increment_article_views (RPC)` — `src/components/knowledge/ArticleViewer.tsx:66` _(rpc)_
  - RPC chamada pelo frontend NÃO existe em nenhuma migration nem em types.ts; o try sempre falha e cai no catch (UPDATE views não-atômico, race condition). Branch .rpc morto — criar a RPC atômica ou remover a chamada.
  - **Ressalva:** NUANCE: nao e 'codigo morto removivel no servidor' (a funcao nem existe); e uma chamada-fantasma cujo branch de SUCESSO (linhas 66-69) e inalcancavel, com FALLBACK VIVO (linhas 71-75: UPDATE knowledge_articles.views = views+1, nao-atomico). O incremento de views funciona hoje via fallback. Bug real = race condition no UPDATE nao-atomico. Correcao: criar a RPC atomica OU remover o try e assumir o UPDATE. O auditor esta correto no efeito, mas o rotulo preciso e 'branch de sucesso morto + fallback vivo', nao 'RPC morta a deletar'.
- [ ] `calculate_penalties (RPC)` — `src/integrations/supabase/types.ts:6897` _(rpc)_
  - RPC existe no banco/types mas nenhum caller em código (src, supabase/functions, relay-unifi). Possivelmente usada só dentro de outra função SQL/view; candidata a órfã se não referenciada em SQL.
  - **Ressalva:** CAVEAT (regra dura: nao consultei o banco): pelas migrations — que o CLAUDE.md define como fonte-da-verdade do schema — a funcao e orfa. Nao da pra descartar 100% uma referencia criada ad-hoc no banco fora das migrations (view/trigger via Lovable MCP); anotar como duvida a confirmar por SELECT no MCP, sem alterar nada. Confirmado morto no escopo do repo. Redundante com calculate-invoice-penalties (mesma matematica de multa/juros).
- [ ] `Logger.invoiceProcessingLog` — `src/lib/logger.ts:308` _(funcao)_
  - Método público do logger sem nenhum caller
  - **Ressalva:** Morto. Detalhe: e o unico da familia que SEMPRE persiste no banco (sem flag persistToDb), mas mesmo assim ninguem o invoca.
- [ ] `Logger.getLogs` — `src/lib/logger.ts:390` _(funcao)_
  - Getter de logs em sessionStorage sem consumidor (LogsViewerTab usa application_logs no banco, não este)
  - **Ressalva:** Morto — leitor do buffer sessionStorage 'app_logs' sem UI que o consuma.

## C. Fora de escopo desta limpeza (correções, não remoções)

Achados que **não são "deletar código morto"** mas sim bugs/dados a corrigir (ver AUDITORIA Parte F / observações):
- `tickets.sla_deadline` nunca populado → SLA inoperante (decidir: trigger que popula OU reescrever `notify-sla-breach` com `sla-calculator.ts`).
- `increment_article_views` (RPC inexistente) → branch de sucesso morto, fallback UPDATE não-atômico vivo (criar RPC atômica OU assumir o UPDATE).
- `badgeIcons` (gamification) → chaves não batem com `badge.icon` do seed → todos caem no fallback (corrigir mapeamento, não deletar).
- Divergências de documentação (IMPLEMENTATION_GUIDE cita S3 inexistente; MAPA cita `admin-cancel-asaas-payment` inexistente) → tratadas na Fase 3.
