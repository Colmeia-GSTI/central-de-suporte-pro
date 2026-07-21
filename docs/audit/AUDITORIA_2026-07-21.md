# Auditoria Completa — Central de Suporte Pro (Colmeia)

**Data:** 2026-07-21 · **Fase 1** do plano de revisão (`ultra-fizzy-floyd`) · **Somente leitura** (nenhuma alteração de código ou banco).

> Este relatório é o **guia de referência** das Fases 2 (limpeza) e 3 (reorganização/AGENTS.md). Foi produzido por **re-auditoria completa do zero**: 22 áreas auditadas em paralelo, cada uma por um agente auditor (leitura direta + grep do repo inteiro + graphify) seguido de um **revisor adversarial** que tentou refutar cada candidato a código morto com grep global. Total: 44 agentes, 0 erros.

## Metodologia

- **Auditor por área**: descobre arquivos (glob/graphify), lê cada um, e para cada símbolo exportado faz `grep` no repo inteiro (src/**, supabase/functions/**, config.toml, rotas, `invoke()`, `.rpc()`, imports dinâmicos, JSX) para decidir *em uso* vs *morto*. Extrai fluxos rota→componente→hook→edge→tabela e regras de negócio.
- **Revisor adversarial**: para cada candidato a morto, refaz grep global tentando **achar** a referência que o auditor perdeu (import dinâmico/lazy, config.toml, cron, string, teste, feature-flag). Só marca `confirmadoMorto` com 0 referências vivas.
- **Barreira (cross-reference global)** feita na consolidação: 12 spot-checks independentes re-grepados manualmente — **todos confirmaram** os veredictos (0 falsos-positivos na amostra): `generate-invoice-payments`, `getAllowedActions`, `exportConfigs`/`formatters`, `useInvoice`, `resolveMergedFields`, `devLog`, `not_helpful_count`, `calculate_penalties`, `increment_article_views`, `AnimatedStatCard.trend`, `TableFooter/TableCaption`, `s3-storage/S3StorageConfigForm`.
- **Restrição de banco**: nenhuma consulta ao banco. Itens que dependem de confirmar dado/schema/pg_cron no banco ficam em **"revisar com usuário"** (Parte C), não em "seguro remover".

## Sumário executivo

- **Áreas auditadas:** 22 (18 módulos + 4 transversais).
- **Candidatos a morto confirmados/aceitos:** 75 — sendo **58 `seguro-remover`** (código frontend/edge, 0 refs globais) e **17 `revisar-com-usuário`** (dependem de banco/schema/pg_cron ou são defensivos por design).
- **Candidatos refutados pelo revisor** (auditor errou; estão VIVOS): **18** — ver Parte D.
- **Achado transversal crítico:** `tickets.sla_deadline` nunca é escrito por nenhum código → `notify-sla-breach` processa 0 chamados e a métrica de SLA do Dashboard é sempre vazia/100% (código de alerta vivo, mas inerte por dado ausente).
- **Divergências vs MAPA_DE_SETORES.md** e docs raiz (ex.: IMPLEMENTATION_GUIDE documenta S3/`s3-storage.ts`/`test-s3-connection` **inexistentes**; MAPA cita `admin-cancel-asaas-payment` **inexistente**) — Parte E.

### Contagem por área

| Área | Arqs | Fluxos | Regras | Morto (seg/rev) | Refutados | Diverg. |
|---|--|--|--|--|--|--|
| auth | 45 | 21 | 18 | 6/0 | 2 | 5 |
| tickets | 36 | 14 | 18 | 2/1 | 1 | 6 |
| clients-doc | 52 | 12 | 21 | 1/0 | 1 | 7 |
| contracts | 20 | 11 | 14 | 0/0 | 0 | 4 |
| billing | 44 | 14 | 24 | 5/2 | 0 | 7 |
| nfse | 28 | 14 | 19 | 5/1 | 1 | 6 |
| monitoring | 16 | 7 | 15 | 0/0 | 0 | 4 |
| notifications | 17 | 10 | 17 | 0/0 | 1 | 4 |
| calendar | 6 | 7 | 13 | 4/4 | 0 | 4 |
| inventory | 5 | 4 | 8 | 0/0 | 0 | 6 |
| knowledge | 13 | 6 | 19 | 3/2 | 0 | 5 |
| reports | 19 | 5 | 16 | 4/1 | 0 | 4 |
| gamification | 3 | 5 | 9 | 1/2 | 2 | 6 |
| client-portal | 11 | 5 | 13 | 1/0 | 1 | 3 |
| settings | 40 | 9 | 15 | 1/0 | 2 | 5 |
| audit-security | 15 | 7 | 10 | 2/0 | 0 | 4 |
| db-schema | 7 | 11 | 7 | 0/2 | 0 | 4 |
| infra | 36 | 6 | 11 | 5/0 | 0 | 6 |
| ui-primitives | 41 | 5 | 3 | 9/0 | 0 | 3 |
| shared-lib | 17 | 9 | 10 | 7/2 | 1 | 4 |
| shared-edge | 17 | 4 | 12 | 0/0 | 3 | 3 |
| docs-config | 15 | 5 | 12 | 2/0 | 3 | 10 |

---

## Parte B — Código morto CONFIRMADO — `seguro-remover` (58)

Código de frontend/edge com **0 referências vivas** no repo inteiro (confirmado por revisor adversarial + grep). Remoção não toca banco.

### auth — Autenticacao, Usuarios e Permissoes
- **`getAllowedActions`** — `src/lib/permissions.ts:152` _(export)_
  - **Motivo:** Export sem uso; ainda importado (import morto) em usePermissions.ts:2 mas nunca chamado (getActions usa PERMISSIONS_CONFIG diretamente)
  - **Evidência (revisor):** Grep global: definido em permissions.ts:152 e importado (nao usado) em usePermissions.ts:2. ZERO chamadas `getAllowedActions(`. Restante so em artefatos graphify-out/. getActions() (o vivo, usado em ProfilePage.tsx:125) reimplementa a logica via Object.keys(moduleConfig)+can(), sem tocar getAllowedActions.
  - **Nota:** CONFIRMADO MORTO. A unica referencia e um import morto (usePermissions.ts:2). Ao limpar, remover o export E o import orfao juntos.
- **`PermissionGateAny`** — `src/components/auth/PermissionGate.tsx:75` _(componente)_
  - **Motivo:** Componente exportado sem nenhum uso em JSX
  - **Evidência (revisor):** Grep global por `PermissionGateAny`, `<PermissionGateAny`, e import: 0 consumidores. So a propria definicao (PermissionGate.tsx:65,75,76) + artefatos graphify-out/. Nenhum arquivo importa ou renderiza.
  - **Nota:** CONFIRMADO MORTO. Componente exportado sem nenhum import/JSX em todo o repo.
- **`PermissionGateAll`** — `src/components/auth/PermissionGate.tsx:104` _(componente)_
  - **Motivo:** Componente exportado sem nenhum uso em JSX
  - **Evidência (revisor):** Grep global por `PermissionGateAll`, `<PermissionGateAll`, e import: 0 consumidores. So a definicao (PermissionGate.tsx:94,104,105) + graphify-out/. Nenhum import/JSX.
  - **Nota:** CONFIRMADO MORTO. Idem PermissionGateAny.
- **`canViewModule`** — `src/hooks/usePermissions.ts:55` _(funcao)_
  - **Motivo:** Retornado por usePermissions mas sem call site
  - **Evidência (revisor):** Grep global: so a definicao (usePermissions.ts:55-57) e o export no return (usePermissions.ts:81). ZERO call sites externos; nenhum componente/hook desestrutura canViewModule do usePermissions().
  - **Nota:** CONFIRMADO MORTO. Exposto no return do hook mas sem consumidor. Referencia interna (return) nao e uso vivo.
- **`canEditModule`** — `src/hooks/usePermissions.ts:59` _(funcao)_
  - **Motivo:** Retornado por usePermissions mas sem call site
  - **Evidência (revisor):** Grep global: so definicao (usePermissions.ts:59-61) + return (usePermissions.ts:82). ZERO call sites externos.
  - **Nota:** CONFIRMADO MORTO. Retornado pelo hook, nunca consumido.
- **`canManageModule`** — `src/hooks/usePermissions.ts:63` _(funcao)_
  - **Motivo:** Retornado por usePermissions mas sem call site (uso só via PermissionGate.action='manage')
  - **Evidência (revisor):** Grep global: so definicao (usePermissions.ts:63-65) + return (usePermissions.ts:83). ZERO call sites externos. O gate usa action='manage' via can(), nao via canManageModule.
  - **Nota:** CONFIRMADO MORTO. Retornado pelo hook, nunca consumido.

### tickets — Chamados/Tickets e SLA
- **`isRatingOpen / TicketRatingDialog (instancia no TicketsPage)`** — `src/pages/tickets/TicketsPage.tsx:107` _(componente/estado)_
  - **Motivo:** Estado isRatingOpen so e passado como onOpenChange (fecha); nao existe setIsRatingOpen(true) em lugar algum — o dialog de avaliacao dentro do TicketsPage nunca abre (avaliacao real ocorre no portal do cliente)
  - **Evidência (revisor):** Grep global 'setIsRatingOpen' => apenas 2 hits, ambos em TicketsPage.tsx: :107 (declaracao useState) e :856 (onOpenChange={setIsRatingOpen}). Nenhum setIsRatingOpen(true) em lugar algum; nenhum callback passado a filho que o invoque. Logo a INSTANCIA do dialog em TicketsPage:855-860 e inalcancavel (nunca abre).
  - **Nota:** REFUTACAO PARCIAL: o COMPONENTE TicketRatingDialog NAO e morto — e importado e efetivamente aberto em src/pages/client-portal/ClientPortalPage.tsx:9,199 (avaliacao real do cliente). Morto apenas a instancia staff-side em TicketsPage + o estado isRatingOpen.
- **`firstResponseAt (prop)`** — `src/components/tickets/TicketResolveDialog.tsx:37` _(export/prop)_
  - **Motivo:** Prop declarada na interface e passada por TicketsPage.tsx:852, mas nao e desestruturada nem usada dentro do componente
  - **Evidência (revisor):** Grep global 'firstResponseAt': em TicketResolveDialog.tsx a UNICA ocorrencia e a linha 37 (declaracao na interface). O destructuring do componente (:48-60) NAO inclui firstResponseAt e o corpo nunca o referencia (componente funcional destructurado, sem objeto props). Passado por TicketsPage.tsx:852 mas descartado. Outras ocorrencias de 'firstResponseAt' no repo (sla-calculator.ts:195,209,212,263,265) sao parametro homonimo de calculateSLAStatus — simbolo distinto.
  - **Nota:** Prop morta confirmada. Remocao segura: o dado subjacente first_response_at E gravado no inicio do atendimento (startTicketMutation TicketsPage:315), apenas nao e consumido pelo ResolveDialog.

### clients-doc — Clientes e Documentacao Tecnica
- **`resolveMergedFields`** — `src/lib/client-merge.ts:36` _(funcao/export)_
  - **Motivo:** Exportada e testada, mas sem uso em produção — o merge real é feito na RPC SQL merge_clients (COALESCE). Só previewMerge é usada na UI. Função espelha a lógica do SQL apenas como spec/teste.
  - **Evidência (revisor):** Grep global no repo inteiro: unicas refs em codigo sao a definicao (src/lib/client-merge.ts:36) + o teste src/test/integration/merge-clients.test.ts (import + 5 chamadas). 0 refs em src/components|src/hooks|src/pages. graphify explain confirma degree=3 (contains, imports-from-test, calls isEmpty). A UI usa previewMerge (MergeClientsDialog.tsx:112), NAO resolveMergedFields. O merge real e a RPC SQL merge_clients (MergeClientsDialog.tsx:89). Confirmado: morto em producao, sobrevive so como spec/teste espelhando o COALESCE do SQL.
  - **Nota:** Auditor correto. E test-only. Se remover, remover tambem o describe correspondente em merge-clients.test.ts. MERGEABLE_FIELDS/isEmpty/previewMerge permanecem vivos (previewMerge e usado na UI), entao NAO deletar o arquivo inteiro.

### billing — Faturamento e Cobranca (Invoices/Boletos)
- **`useInvoice(id)`** — `src/hooks/useInvoices.ts:183` _(export)_
  - **Motivo:** Hook de fatura única exportado mas sem nenhum caller
  - **Evidência (revisor):** grep 'useInvoice\b' global: unico hit e a definicao (useInvoices.ts:183). 0 callers, 0 re-export, 0 teste. Distinto de useInvoices (plural), que e vivo.
  - **Nota:** Hook de fatura unica orfao. Confirmado.
- **`useInvalidateInvoices`** — `src/hooks/useInvoices.ts:212` _(hook)_
  - **Motivo:** Helper de invalidação sem callers; BillingInvoicesTab e useInvoiceActions duplicam invalidateQueries inline
  - **Evidência (revisor):** grep global: so definicao (212) + exemplo JSDoc (208) + CHANGELOG.md:546 + graphify. 0 callers. BillingInvoicesTab e useInvoiceActions duplicam invalidateQueries inline.
  - **Nota:** Helper de invalidacao sem consumidor. Confirmado.
- **`InvoiceWithErrors`** — `src/hooks/useInvoices.ts:55` _(export)_
  - **Motivo:** Type export sem importadores (era do BillingErrorsPanel removido/consolidado)
  - **Evidência (revisor):** grep global: so definicao (55) + CHANGELOG.md:549 + graphify. 0 importadores.
  - **Nota:** Type export orfao (residuo de BillingErrorsPanel). Confirmado.
- **`computeInvoiceDerivedState / getDerivedStateDisplay`** — `src/lib/billing-fsm.ts:67,198` _(funcao)_
  - **Motivo:** Só consumidos pelo próprio teste; a UI não deriva estado via FSM (usa StatusBadges + inline)
  - **Evidência (revisor):** grep global: def em billing-fsm.ts + consumo apenas em billing-fsm.test.ts. StatusBadges.tsx:19-21 cita os nomes SOMENTE dentro de bloco de comentario JSDoc (' * import { ... }'), nao e import real. 0 caller de producao.
  - **Nota:** So o teste consome. Confirmado morto fora de teste.
- **`canResendNotification / canRegenerateBoleto / canEmitNfse / canCancelInvoice / canForcePolling`** — `src/lib/billing-fsm.ts:114-172` _(funcao)_
  - **Motivo:** 5 helpers de permissão só usados no teste; InvoiceActionsPopover só importa canCancelBoleto e canMarkAsPaid e calcula o resto inline (isPendingOrOverdue etc.)
  - **Evidência (revisor):** grep global desses 5: apenas billing-fsm.ts (def) + billing-fsm.test.ts. InvoiceActionsPopover.tsx:9 importa SO canCancelBoleto e canMarkAsPaid (usados nas linhas 89-90) — esses dois sao vivos e o auditor corretamente os excluiu. Os 5 nao tem consumidor de producao.
  - **Nota:** 5 helpers so testados. Confirmado morto. (canMarkAsPaid/canCancelBoleto ficam vivos.)

### nfse — NFS-e e Certificados Digitais
- **`action 'decrypt'`** — `supabase/functions/certificate-vault/index.ts:157` _(edge)_
  - **Motivo:** Nenhum caller descriptografa a senha do certificado; a emissão usa o certificado dentro do próprio Asaas. A senha criptografada em certificates.senha_hash nunca é lida.
  - **Evidência (revisor):** Grep whole-repo por 'decrypt' como action: 0 callers. Unico caller de certificate-vault e CertificateManager.tsx:300-302 usando action 'encrypt'. As demais ocorrencias de 'decrypt' sao vault.decrypted_secrets (Postgres vault, conceito diferente) em migrations/CHANGELOG. Confirmado morto.
  - **Nota:** Alem da branch da action, o helper decryptPassword() (index.ts:80) so e chamado dentro dessa branch (index.ts:207) -> tambem morto. Remover os dois juntos. MAPA_DE_SETORES.md:379 ja registra como codigo morto.
- **`action 'get_status'`** — `supabase/functions/asaas-nfse/index.ts:1614` _(edge)_
  - **Motivo:** Consulta simples de status sem nenhum invocador; substituída por check_single_status (esse sim usado por NfseProcessingIndicator).
  - **Evidência (revisor):** Grep whole-repo (src+supabase): 'get_status' so aparece na definicao index.ts:1614 e em SYSTEM_DOCUMENTATION.md:435. Zero invoke callers (frontend ou edge-to-edge). Substituto check_single_status tem caller vivo em NfseProcessingIndicator.tsx:84. Confirmado morto.
- **`action 'list_services'`** — `supabase/functions/asaas-nfse/index.ts:641` _(edge)_
  - **Motivo:** Listagem de serviços municipais Asaas sem caller; a UI usa a tabela local nfse_service_codes (NfseServiceCodeCombobox).
  - **Evidência (revisor):** Grep whole-repo: 'list_services' so na definicao index.ts:641. Zero callers em qualquer lugar (nem webhook nem frontend). UI usa tabela local nfse_service_codes. Confirmado morto.
- **`action 'create_customer'`** — `supabase/functions/asaas-nfse/index.ts:653` _(edge)_
  - **Motivo:** Sem caller; o frontend usa 'sync_customer' (ClientForm) e 'create_test_customer' (AsaasConfigForm); a emissão usa ensureCustomerSync internamente.
  - **Evidência (revisor):** Grep whole-repo: 'create_customer' so em index.ts:653 + SYSTEM_DOCUMENTATION.md:438. Nao colide com create_test_customer/sync_customer (ambos vivos no frontend, confirmados na lista de actions invocadas). Zero callers. Confirmado morto.
- **`action 'retry_failed'`** — `supabase/functions/asaas-nfse/index.ts:2718` _(edge)_
  - **Motivo:** Sem caller; o reprocesso de nota é feito re-invocando 'emit'/'emit_standalone' (InvoiceProcessingHistory:205, NfseDetailsSheet:305).
  - **Evidência (revisor):** Grep whole-repo: 'retry_failed' so em asaas-nfse/index.ts (comentario 789, case 2718, label de log 2771, msg 2775). Zero invoke callers. Reprocesso real usa emit/emit_standalone. Confirmado morto.

### calendar — Calendario e Agendamento
- **`action "callback" (edge google-calendar)`** — `supabase/functions/google-calendar/index.ts:98` _(edge)_
  - **Motivo:** Nenhum handler no frontend captura ?code após o redirect do Google nem invoca action:'callback' -> loop OAuth quebrado, tokens nunca salvos.
  - **Evidência (revisor):** Grep global (todo o repo, excl. graphify-out) por action:'callback' / searchParams.get('code') / ?code= = 0 refs vivas. Frontend invoca a edge SÓ com action:'auth_url' (GoogleCalendarConfigForm.tsx:55-61, redirect_uri=origin+'/settings'). Nenhum arquivo em /settings lê ?code (grep 'code' em src/pages/settings = só FeatureFlagsPage, irrelevante). Nenhuma edge-to-edge nem cron chama callback (grep em supabase/functions só bate a própria index.ts:10,98).
  - **Nota:** OAuth dead-end confirmado: Google redireciona p/ /settings?code=&state, mas nada troca o code -> tokens nunca gravados. O 'case' existe e é alcançável em tese, porém nenhum caller no codebase o dispara.
- **`action "delete_event" (edge google-calendar)`** — `supabase/functions/google-calendar/index.ts:270` _(edge)_
  - **Motivo:** EventDetailsSheet faz delete direto na tabela, nunca chama a edge.
  - **Evidência (revisor):** Grep global 'delete_event' = só index.ts:10,270 + docs. EventDetailsSheet.deleteMutation faz supabase.from('calendar_events').delete().eq('id',...) direto (EventDetailsSheet.tsx:57-64). Zero invoke da edge.
  - **Nota:** Confirmado morto.
- **`prop onEdit (EventDetailsSheet)`** — `src/components/calendar/EventDetailsSheet.tsx:45` _(export)_
  - **Motivo:** CalendarPage renderiza EventDetailsSheet sem onEdit; não há fluxo de edição de evento (EventForm é só insert). Botão Editar nunca renderiza.
  - **Evidência (revisor):** Grep global 'EventDetailsSheet' = importado/renderizado SÓ em CalendarPage.tsx:27,233 (único consumidor). CalendarPage renderiza <EventDetailsSheet event/open/onOpenChange> SEM onEdit (linhas 233-237). onEdit só aparece dentro do próprio arquivo (interface:45, destructure:52, render condicional:153, onClick:157).
  - **Nota:** Como onEdit nunca é passado, o bloco {onEdit && (...)} nunca renderiza -> botão 'Editar' morto. Não há fluxo de edição (EventForm só faz insert).
- **`const canEdit`** — `src/pages/calendar/CalendarPage.tsx:57` _(funcao)_
  - **Motivo:** Variável computada (can('calendar','edit')) e nunca usada — drag/drop/resize (editable=true) não é gated por ela.
  - **Evidência (revisor):** Grep 'canEdit' em src/**/calendar/** = única ocorrência CalendarPage.tsx:57 (definição). Zero usos. Li o arquivo inteiro: não é referenciado depois. FullCalendarWrapper tem editable={true} hardcoded (FullCalendarWrapper.tsx:165), sem gate de permissão.
  - **Nota:** Variável can('calendar','edit') computada e descartada; drag/drop/resize não é gated.

### knowledge — Base de Conhecimento
- **`Botão 'Compartilhar' (Share2)`** — `src/components/knowledge/ArticleViewer.tsx` _(componente)_
  - **Motivo:** Botão renderizado sem onClick — UI morta/decorativa.
  - **Evidência (revisor):** Grep global de Share2/'Compartilhar': só ArticleViewer.tsx:180-183. É um <Button variant=outline size=sm> SEM onClick e sem wrapper clicável. Ao lado (L176-179) existe o botão 'Copiar link' funcional (handleCopyLink). Nenhum handler de share/Web Share API em lugar algum.
  - **Nota:** UI decorativa morta confirmada. A função de compartilhar já é coberta pelo 'Copiar link' adjacente — remover o Share2 ou dar-lhe onClick (navigator.share).
- **`Cards de 'Artigos Relacionados'`** — `src/components/knowledge/ArticleViewer.tsx` _(componente)_
  - **Motivo:** Buttons de artigo relacionado sem onClick — não navegam nem abrem nada.
  - **Evidência (revisor):** Grep global de Share2/'Compartilhar': só ArticleViewer.tsx:180-183. É um <Button variant=outline size=sm> SEM onClick e sem wrapper clicável. Ao lado (L176-179) existe o botão 'Copiar link' funcional (handleCopyLink). Nenhum handler de share/Web Share API em lugar algum.
  - **Nota:** UI decorativa morta confirmada. A função de compartilhar já é coberta pelo 'Copiar link' adjacente — remover o Share2 ou dar-lhe onClick (navigator.share).
- **`Atalho ⌘K`** — `src/components/knowledge/KnowledgeHero.tsx` _(componente)_
  - **Motivo:** kbd ⌘K puramente visual; não há keybinding que foque a busca.
  - **Evidência (revisor):** kbd ⌘K puramente visual (L48-50). Grep global metaKey|ctrlKey|KeyK|addEventListener('keydown')|CommandDialog: o ÚNICO keydown com metaKey/ctrlKey é sidebar.tsx:81 (SIDEBAR_KEYBOARD_SHORTCUT — tecla do sidebar, não 'k', não relacionado à KB). command.tsx (cmdk) existe como primitivo mas não há CommandDialog montado para a busca da KB. KnowledgeHero nem tem ref no <Input> para focar.
  - **Nota:** Confirmado: nenhum keybinding foca a busca. Implementar handler ⌘K (precisa de ref no input) ou remover o kbd.

### reports — Relatorios, Dashboards e Exportacao
- **`formatters`** — `src/lib/export.ts:66` _(export)_
  - **Motivo:** Objeto de formatadores (date/datetime/currency/boolean) para export nunca importado; nao flagado pelo MAPA
  - **Evidência (revisor):** grep global: unica ocorrencia em fonte e a definicao (export.ts:66). Os hits em graph.json (src_lib_export_formatters, edge 126226) e GRAPH_REPORT.md:589 sao apenas CONTAINS do grafo (arquivo contem simbolo), NAO uso. Zero imports. As funcoes exportToCSV/Excel/JSON nao chamam formatters; formatacao de data/moeda no export sai crua. MORTO.
  - **Nota:** Auditor certeiro; nao flagado pelo MAPA (so exportConfigs estava listado).
- **`trend (prop)`** — `src/components/dashboard/AnimatedStatCard.tsx:15-18 (prop) e 81-93 (render)` _(export)_
  - **Motivo:** Prop trend {value,isPositive} e bloco de render 'vs ontem' nunca passados por nenhum caller
  - **Evidência (revisor):** —
- **`imports nao usados (Button, Download)`** — `src/components/reports/ClientManagementReport.tsx:5,34` _(export)_
  - **Motivo:** Button e Download importados mas nunca usados no JSX (regra do escoteiro)
  - **Evidência (revisor):** —
- **`imports nao usados (Button, startOfMonth, endOfMonth, Building2)`** — `src/components/reports/TimeReportTab.tsx:5,38,40` _(export)_
  - **Motivo:** Symbols importados mas sem uso no corpo
  - **Evidência (revisor):** —

### gamification — Gamificacao
- **`badgeIcons (mapa de ícones)`** — `src/pages/gamification/GamificationPage.tsx:29-35` _(export)_
  - **Motivo:** Chaves do mapa são slugs de NOME (velocista, guardiao_sla, maratonista, cinco_estrelas, resolvedor) mas o lookup usa badge.icon (L191), cujos valores no seed são zap/shield/star/trophy/award/book-open. Interseção = ZERO, logo todos os 6 badges caem no fallback <Star>. O mapa inteiro é morto.
  - **Evidência (revisor):** Referenciado em GamificationPage.tsx:191 (badgeIcons[badge.icon||'']), mas as chaves (velocista/guardiao_sla/maratonista/cinco_estrelas/resolvedor) NÃO coincidem com NENHUM valor de badges.icon do seed (zap/shield/star/trophy/award/book-open — migration 20260119164953:773-778). Interseção = 0 → todo badge cai no fallback <Star>. O conteúdo do mapa nunca é consumido.
  - **Nota:** É referenciado (L191) mas a referência nunca resolve → funcionalmente morto. Bug de dados: chaves são slug de NOME, lookup usa .icon. Correção real = mapear por badge.icon (zap/shield/...) ou por badge.name.

### client-portal — Portal do Cliente
- **`PortalTicket.ticket_categories (campo) + join ticket_categories(name) no SELECT de tickets`** — `src/pages/client-portal/components/portal-types.ts:13 / src/pages/client-portal/ClientPortalPage.tsx:61` _(export)_
  - **Motivo:** Categoria é buscada no join da query de tickets e declarada na interface, mas nunca renderizada em nenhum componente do portal (ClientTicketsList/DetailPanel não exibem categoria). Peso morto na query.
  - **Evidência (revisor):** Grep global de `.ticket_categories` (leitura): 0 refs no portal. Leituras existem SÓ em componentes staff/knowledge com tipos próprios (src/pages/tickets/TicketsPage.tsx:721, src/components/tickets/TicketDetailsTab.tsx:553, src/components/settings/SLATab.tsx:409, src/components/knowledge/ArticleViewer.tsx:90, KnowledgeArticleList.tsx:110) — nenhum toca PortalTicket. Os 3 únicos consumidores de PortalTicket (ClientTicketsList.tsx, ClientTicketDetailPanel.tsx, ClientPortalPage.tsx) foram lidos por inteiro: categoria nunca é renderizada nem lida. Únicas refs = declaração (portal-types.ts:13) e o join no SELECT (ClientPortalPage.tsx:61). Nenhum teste consome. MORTO confirmado.
  - **Nota:** O join `requester:client_contacts!requester_contact_id(name)` no MESMO SELECT (linha 61) é vivo (ClientTicketsList.tsx:89 lê t.requester?.name) — só o `ticket_categories(name)` é peso morto, adicionando um fetch relacional sem consumo. A query de categorias em ClientPortalPage.tsx:105 é OUTRA coisa (alimenta o dropdown do form, viva); o auditor distinguiu corretamente.

### settings — Configuracoes, Feature Flags e UI de Integracoes
- **`retornos load/setSettings de useIntegrationSettings`** — `src/hooks/useIntegrationSettings.ts` _(export)_
  - **Motivo:** O hook retorna load e setSettings, mas nenhum ConfigForm em escopo os desestrutura (usam settings/patch/isActive/setIsActive/loading/loaded/save). Provável superfície morta.
  - **Evidência (revisor):** MORTO como superficie de RETORNO. Os 6 consumidores (Asaas:24, CheckMk:24, EvolutionApi:13, GoogleCalendar:10, TacticalRmm:16, Telegram:6) desestruturam apenas {settings, patch, isActive, setIsActive, loading, (loaded so no TacticalRmm), save}. Grep global de load/setSettings nos ConfigForms so retorna comentarios ('apos o load') e os useState LOCAIS de BancoInterConfigForm/ResendConfigForm — que NAO usam o hook. Nenhum consumidor usa os retornos load nem setSettings expostos em useIntegrationSettings.ts:98.
  - **Nota:** Confirmado morto SO no objeto de retorno (:98). Ambos sao usados INTERNAMENTE no hook: load e chamado no useEffect (:49) e setSettings dentro de load (:38/:42), save (:64) e patch (:95). Logo nao se deleta o corpo — remove-se apenas do return. Auditor disse '6 consumidores' e acertou; nao nomeou GoogleCalendar/Asaas, mas ambos confirmam a ausencia de load/setSettings.

### audit-security — Auditoria, Seguranca e Logs
- **`AUDITED_TABLES / AUDITED_ACTIONS`** — `src/components/audit/AuditLogFilters.tsx:7,17` _(export)_
  - **Motivo:** Exportados mas usados apenas no próprio arquivo (map interno); nenhum import externo — poderiam ser const locais não exportadas
  - **Evidência (revisor):** Grep global em todo o repo (**/*.{ts,tsx}, testes, config.toml, imports dinâmicos/lazy): só ocorrem em AuditLogFilters.tsx — definição (7,17) + uso local no map do JSX (56,68). Zero import externo, zero uso em *.test.*. Não são referenciados por FiltersState (que tipa table/action como `string` puro, não `typeof AUDITED_TABLES[number]`).
  - **Nota:** Símbolos VIVOS dentro do arquivo (alimentam os <SelectItem>); o que está morto é a palavra-chave `export` — nada fora do arquivo os consome. Correção segura = remover `export` e deixá-los como const locais. Auditor está correto.
- **`interface AuditLogFilters`** — `src/hooks/useAuditLogs.ts:4` _(export)_
  - **Motivo:** Interface exportada porém usada só como tipo do parâmetro do próprio hook; nenhum importador externo (só AuditLogRecord é importado de fora) — colide de nome com o componente AuditLogFilters
  - **Evidência (revisor):** Importadores de @/hooks/useAuditLogs: AuditLogsList.tsx (useAuditLogs + type AuditLogRecord), AuditLogRow.tsx (type AuditLogRecord), AuditLogDetail.tsx (type AuditLogRecord) e src/test/integration/audit-logs.test.ts (só useAuditLogs). NENHUM importa a interface `AuditLogFilters`. Usada apenas como tipo do parâmetro de useAuditLogs na linha 29, mesmo arquivo.
  - **Nota:** Export morto (símbolo vivo só localmente). A colisão de nome com o componente `AuditLogFilters` (de ./AuditLogFilters) é apenas cheiro de nomenclatura — os dois nunca são importados no mesmo módulo, então não há colisão real de runtime/tipo. Correção = remover `export`. Auditor está correto.

### infra — Infraestrutura, Build, PWA, Testes
- **`RouteChangeLoader`** — `src/components/layout/PageTransition.tsx:12` _(export/funcao)_
  - **Motivo:** Retorna null; 0 usos externos
  - **Evidência (revisor):** Grep global (repo inteiro, sem graphify-out): unica ocorrencia viva = a propria definicao em PageTransition.tsx:12. Nenhum import/JSX/uso dinamico. Retorna null. Unica outra mencao e docs/MAPA_DE_SETORES.md:979 que ja o lista como candidato a codigo morto (doc, nao uso). NAO importado em AnimatedRoutes (que so importa PageTransition).
  - **Nota:** Stub de feature desabilitada ('Disabled route change loader...'). Morto confirmado.
- **`RouteProgressBar`** — `src/components/layout/PageTransition.tsx:17` _(export/funcao)_
  - **Motivo:** Retorna null; 0 usos externos
  - **Evidência (revisor):** Grep global: unica ocorrencia = definicao em PageTransition.tsx:17. Zero imports/usos. Retorna null. Nenhuma referencia dinamica/string/JSX em todo o repo.
  - **Nota:** Stub de feature desabilitada ('Disabled progress bar...'). Morto confirmado, igual ao RouteChangeLoader.
- **`mockFetchOnce / restoreFetch (arquivo inteiro)`** — `src/test/mocks/http.ts` _(arquivo/funcao)_
  - **Motivo:** Nenhum teste importa; restoreFetch é no-op
  - **Evidência (revisor):** Grep global por 'mockFetchOnce|restoreFetch|mocks/http': apenas a definicao em http.ts + mencao documental em TESTING.md:24 ('http.ts mockFetchOnce() para chamadas externas') + nos do graphify-out. NENHUM *.test.* importa de mocks/http. Os testes de integracao usam mocks/supabase.ts e helpers/render.tsx, nao este arquivo. restoreFetch e no-op (corpo so comentario).
  - **Nota:** Arquivo inteiro orfao (ambos exports mortos) — pode deletar o arquivo, nao so os simbolos. TESTING.md:24 tambem ficaria desatualizado.
- **`example.test.ts`** — `src/test/example.test.ts` _(arquivo (teste))_
  - **Motivo:** Teste placeholder sem cobertura real (expect(true).toBe(true))
  - **Evidência (revisor):** Nenhum import o referencia (arquivos de teste sao entrypoints auto-descobertos pelo glob do Vitest, nao precisam de referencia). Conteudo = expect(true).toBe(true).
  - **Nota:** RESSALVA ADVERSARIAL: nao e 'inalcancavel' — o Vitest o EXECUTA a cada run como entrypoint. Porem cobre zero codigo de producao; deletar nao perde cobertura alguma. 'Morto' no sentido de inerte/removivel, nao de inacessivel. Confirmado como dead weight.
- **`placeholder.svg`** — `public/placeholder.svg` _(arquivo (asset))_
  - **Motivo:** Asset default do Lovable, não referenciado
  - **Evidência (revisor):** Grep global por 'placeholder\.svg' no repo inteiro: apenas artefatos do graphify-out (graph.json/manifest.json/cache) e a propria manifest do graphify. ZERO referencias em src/**, em index.html, no public/manifest.json (PWA) ou em qualquer .ts/.tsx/.html. Nao entra no precache do Workbox por referencia; so via globPatterns de public (asset estatico nao usado).
  - **Nota:** Asset scaffold padrao do Lovable, nao referenciado. Morto confirmado.

### ui-primitives — Primitivos de UI (shadcn)
- **`PageSkeleton`** — `src/components/ui/loading-skeleton.tsx:3` _(export)_
  - **Motivo:** Export nunca importado (so CardSkeleton e usado deste arquivo)
  - **Evidência (revisor):** rg global (excl. graphify-out e def): 0 refs. loading-skeleton.tsx e importado so por KnowledgeArticleList.tsx:15 e KnowledgeArticlePage.tsx:7, e AMBOS importam apenas { CardSkeleton }.
  - **Nota:** Codigo CUSTOM (nao vendored shadcn). Remocao segura — prioridade alta.
- **`TableSkeleton`** — `src/components/ui/loading-skeleton.tsx:20` _(export)_
  - **Motivo:** Export nunca importado
  - **Evidência (revisor):** rg global (excl. graphify-out e def): 0 refs vivas. Consumidores do arquivo (Knowledge*) so usam CardSkeleton.
  - **Nota:** Custom, nao vendored. Remocao segura.
- **`FormSkeleton`** — `src/components/ui/loading-skeleton.tsx:68` _(export)_
  - **Motivo:** Export nunca importado
  - **Evidência (revisor):** rg global (excl. graphify-out e def): 0 refs vivas.
  - **Nota:** Custom, nao vendored. Remocao segura.
- **`DashboardSkeleton`** — `src/components/ui/loading-skeleton.tsx:82` _(export)_
  - **Motivo:** Export nunca importado
  - **Evidência (revisor):** rg global (excl. graphify-out e def): 0 refs vivas.
  - **Nota:** Custom, nao vendored. Remocao segura.
- **`ListSkeleton`** — `src/components/ui/loading-skeleton.tsx:109` _(export)_
  - **Motivo:** Export nunca importado
  - **Evidência (revisor):** rg global (excl. graphify-out e def): 0 refs vivas.
  - **Nota:** Custom, nao vendored. Remocao segura. (5 dos 6 exports do arquivo estao mortos — so CardSkeleton vive).
- **`TableFooter, TableCaption`** — `src/components/ui/table.tsx` _(export)_
  - **Motivo:** Sub-exports shadcn vendored nunca usados fora do arquivo (baixa prioridade — parte de bloco vendored)
  - **Evidência (revisor):** —
- **`DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuShortcut`** — `src/components/ui/dropdown-menu.tsx` _(export)_
  - **Motivo:** Sub-exports shadcn vendored sem referencia externa (vendored — manter)
  - **Evidência (revisor):** —
- **`PaginationEllipsis`** — `src/components/ui/pagination.tsx` _(export)_
  - **Motivo:** Sub-export vendored sem referencia externa
  - **Evidência (revisor):** rg global: so em pagination.tsx. O modulo Pagination E usado (BillingInvoicesTab, TicketsPage, ClientsPage, BillingNfseTab), mas nenhum consome PaginationEllipsis.
  - **Nota:** Vendored shadcn — sub-export sem uso externo enquanto o resto do modulo vive; manter por convencao.
- **`SidebarInput, SidebarMenuBadge, SidebarMenuSkeleton, SidebarGroupAction, SidebarRail, SidebarMenuAction`** — `src/components/ui/sidebar.tsx` _(export)_
  - **Motivo:** Sub-exports do bloco sidebar shadcn (637 linhas) nunca usados (vendored — manter)
  - **Evidência (revisor):** —

### shared-lib — Libs e Hooks Compartilhados
- **`devLog`** — `src/lib/logger.ts:455` _(export)_
  - **Motivo:** Wrapper console dev-only nunca importado; substituído na prática pelo singleton logger
  - **Evidência (revisor):** Grep repo inteiro (sem glob, inclui supabase/ e testes): unica ocorrencia = definicao em logger.ts:455. Nenhum import { devLog }, nenhum devLog. em qualquer arquivo; unicas outras mencoes sao rotulos de no no graphify-out/graph.json e graph.html (artefatos, nao codigo). Sem import dinamico/lazy/JSX/config. Morto confirmado.
  - **Nota:** Wrapper console dev-only 100% orfao; o singleton `logger` (dev-gated no metodo log()) o substitui na pratica.
- **`Logger.paymentOperation`** — `src/lib/logger.ts:175` _(funcao)_
  - **Motivo:** Método público do logger sem nenhum caller
  - **Evidência (revisor):** Grep global 'paymentOperation' no repo: so a definicao (logger.ts:175) + rotulo no graph.json. Zero `logger.paymentOperation(`. Metodo publico da classe Logger sem caller. Irmao `billingOperation` e chamado (BillingInvoicesTab), este nao.
  - **Nota:** logger.ts nao roda em Deno (usa import.meta.env + @/integrations/supabase/client), entao edge functions nao o chamam; grep global confirma.
- **`Logger.nfseOperation`** — `src/lib/logger.ts:203` _(funcao)_
  - **Motivo:** Método público do logger sem nenhum caller
  - **Evidência (revisor):** Grep global 'nfseOperation': so definicao logger.ts:203 + rotulo graph.json. Zero callers em src/ e supabase/.
  - **Nota:** Morto.
- **`Logger.integrationOperation`** — `src/lib/logger.ts:238` _(funcao)_
  - **Motivo:** Método público do logger sem nenhum caller
  - **Evidência (revisor):** Grep global 'integrationOperation': so definicao logger.ts:238 + rotulo graph.json. Zero callers.
  - **Nota:** Morto.
- **`Logger.invoiceValidationLog`** — `src/lib/logger.ts:268` _(funcao)_
  - **Motivo:** Método público do logger sem nenhum caller
  - **Evidência (revisor):** Grep global 'invoiceValidationLog': so definicao logger.ts:268 + rotulo graph.json. Zero callers.
  - **Nota:** Morto.
- **`Logger.clearLogs`** — `src/lib/logger.ts:399` _(funcao)_
  - **Motivo:** Limpeza de logs locais sem caller
  - **Evidência (revisor):** Grep global '.clearLogs'/'clearLogs': 0 callers; so definicao logger.ts:399 + rotulo graph.json.
  - **Nota:** Morto.
- **`openStorageFileSafe`** — `src/lib/storage-utils.ts:141` _(export)_
  - **Motivo:** Wrapper com toast de openStorageFile nunca importado (só o par downloadStorageFileSafe é usado)
  - **Evidência (revisor):** Grep global 'openStorageFile': openStorageFileSafe aparece so na definicao (141). Os dois consumidores (NfseDetailsSheet.tsx:80 e BillingNfseTab.tsx:107) importam o `openStorageFile` CRU (nao o wrapper Safe). Nenhum import externo de openStorageFileSafe.
  - **Nota:** Morto. Assimetria real: o irmao downloadStorageFileSafe (wrapper Safe de download) E usado, mas o wrapper Safe de abrir nao — os componentes chamam openStorageFile sem try/catch/toast. Correcao ao grepEvidencia do auditor: a linha 143 nao e 'chamada interna a openStorageFileSafe', e openStorageFileSafe CHAMANDO openStorageFile.

### docs-config — Documentacao Raiz e Config
- **`.lovable/plan.md`** — `.lovable/plan.md` _(arquivo)_
  - **Motivo:** Plano de tarefa one-off já concluída (invite-user 409); não é doc de referência, não indexado, 0 refs
  - **Evidência (revisor):** grep global 'plan\.md': nenhuma referencia viva — so o indice do graphify (manifest.json/graph.json) e stat-index. Conteudo = plano one-off de tarefa ja concluida (bug 409 do invite-user + paginacao real, mesmo padrao ja em activate-invite-manually). Nao indexado por nenhum doc, nao e doc de referencia.
  - **Nota:** Confirmado orfao/obsoleto (task concluida, 0 refs). RESSALVA: e artefato de scratch dentro de .lovable/ (dir que tambem contem mcp/ — tooling do Lovable); baixissimo valor, remocao inofensiva mas nao urgente. Nao e 'codigo'.
- **`s3-storage.ts / S3StorageConfigForm.tsx / test-s3-connection`** — `src/lib/s3-storage.ts, src/components/settings/S3StorageConfigForm.tsx, supabase/functions/test-s3-connection` _(arquivo/edge)_
  - **Motivo:** Símbolos documentados no IMPLEMENTATION_GUIDE §2.2/§3.1/§3.3/§3.4 inexistentes no repo
  - **Evidência (revisor):** —

## Parte C — `revisar-com-usuário` (17) — dependem de banco/schema/pg_cron ou são intencionais

Itens onde a remoção segura exige confirmar algo no banco (que não podemos consultar/alterar) — colunas/tabelas/RPCs/enums órfãos no código, edges possivelmente chamadas por `pg_cron`, ou aliases defensivos por design.

### tickets — Chamados/Tickets e SLA
- **`tickets.sla_deadline (coluna) + notify-sla-breach`** — `supabase/functions/notify-sla-breach/index.ts:73` _(edge/coluna)_
  - **Motivo:** A funcao filtra tickets por sla_deadline nao-nulo, mas NENHUM ponto do repo escreve sla_deadline (sem default/generated/trigger/RPC). create_staff_ticket nao seta. Resultado: sempre 0 chamados processados; alertas de SLA inoperantes e metrica SLA do Dashboard sempre 100%/vazia
  - **Evidência/ressalva:** Grep global de 'sla_deadline' em todo o repo: TODAS as ocorrencias sao LEITURA ou DECLARACAO, nenhuma ESCRITA. Declaracao: migration 20260119164953_...f126f22.sql:154 'sla_deadline TIMESTAMPTZ,' (sem DEFAULT, sem GENERATED); index em 20260127000000_performance_indexes.sql; types.ts:5960/5994/6028. Leituras: Dashboard.tsx:70,142-150; TechnicianDashboard.tsx:60,65,116; notify-sla-breach index.ts; RPC de compliance em migration 20260220171956_...:112-123. Nenhum INSERT/UPDATE/trigger/RPC grava a coluna — create_staff_ticket, open_client_portal_ticket e startTicketMutation (TicketsPage:309-319) nao a setam. Confirmado: coluna e write-dead => filtro .not('sla_deadline','is',null).lte(...) sempre vazio => notify-sla-breach processa 0 chamados.

### billing — Faturamento e Cobranca (Invoices/Boletos)
- **`generate-invoice-payments (edge function)`** — `supabase/functions/generate-invoice-payments/index.ts` _(edge)_
  - **Motivo:** Órfã: nenhum invoke no frontend/edges, fora do config.toml e da tabela de cron. Superseda por generate-monthly-invoices (geração inline) + batch-process-invoices
  - **Evidência/ressalva:** 0 invoke() em src/** e supabase/functions/** (grep invoke('generate-invoice-payments') vazio). Nao esta em supabase/config.toml. Unica ref viva no codigo: IntegrationStatusPanel.tsx:263 — porem e um label ESTATICO num array hard-coded (nao invoca a fn; so exibe o nome como 'CRON'). Demais hits: docs/MAPA, SYSTEM_DOCUMENTATION, graphify cache/graph.json. Dir contem so index.ts (sem logic.ts/*_test.ts), reforcando legado. A geracao real usa generate-monthly-invoices (BillingInvoicesTab.tsx:272, ContractsPage.tsx:177).
- **`boleto_status === 'processando' (leitura morta)`** — `src/hooks/useInvoiceActions.ts:142` _(funcao)_
  - **Motivo:** Enum boleto_processing_status = pendente|gerado|enviado|erro; 'processando' nunca ocorre (checkArtifactReadiness). Mesma leitura morta em resend-payment-notification e batch-process-invoices
  - **Evidência/ressalva:** Enum boleto_processing_status em types.ts:7177/7378 = ['pendente','gerado','enviado','erro'] — sem 'processando'. Nenhuma edge escreve boleto_status='processando' (writes reais: pendente/gerado/enviado/erro — asaas-nfse, generate-monthly-invoices, poll-services, webhook-asaas-nfse). Os demais hits 'processando' sao da coluna NFS-e (nfse_status/nfse_history), NAO do boleto. Refs residuais so em doc stale (SYSTEM_DOCUMENTATION.md:236) e RPC de migration get_integration_health_stats (WHERE boleto_status IN ('pendente','processando')). Ramo sempre falso.

### nfse — NFS-e e Certificados Digitais
- **`action 'delete_record' (alias legado)`** — `supabase/functions/asaas-nfse/index.ts:2107` _(edge)_
  - **Motivo:** Alias mantido por compat (cai em archive_record, nunca apaga). Nenhum caller vivo — o frontend usa 'archive_record'.
  - **Evidência/ressalva:** Grep whole-repo: 'delete_record' so em CHANGELOG.md:109/113, comentario index.ts:2104 e case 2107 (fall-through para archive_record). Zero callers no frontend/edge. Confirmado morto.

### calendar — Calendario e Agendamento
- **`action "sync_event" (edge google-calendar)`** — `supabase/functions/google-calendar/index.ts:152` _(edge)_
  - **Motivo:** Nenhuma tela chama; CRUD escreve direto na tabela sem sincronizar.
  - **Evidência/ressalva:** Grep global 'sync_event' = só index.ts:10,152 + docs. Nenhum invoke no frontend. IntegrationStatusPanel.handleSync (o único ponto que faz invoke com action:'sync') só mapeia tactical_rmm/checkmk; google_calendar cai no default -> toast 'não disponível' (IntegrationStatusPanel.tsx:75-89). Além disso a action seria 'sync' e não 'sync_event'.
- **`enum event_type 'billing_reminder'`** — `src/integrations/supabase/types.ts:7398` _(export)_
  - **Motivo:** Só aparece em mapas de exibição (cores/labels); nenhum código insere evento desse tipo. EventForm nem oferece a opção (zod enum tem 5 valores).
  - **Evidência/ressalva:** Grep global 'billing_reminder' = só mapas de exibição (FullCalendarWrapper.tsx:23,32; EventDetailsSheet.tsx:29,38), def do enum em types.ts:7195,7398 e migration 20260120152857:16 (ALTER TYPE ADD VALUE). NENHUM writer: nenhum insert com event_type='billing_reminder' no frontend nem em supabase/functions. EventForm.tsx:34 zod .enum tem 5 valores (visit/meeting/on_call/unavailable/personal), sem billing_reminder.
- **`coluna calendar_events.invoice_id`** — `supabase/migrations/20260120152857_...sql:19` _(tabela)_
  - **Motivo:** Adicionada para lembretes de cobrança; índice depois removido (20260126233517); nenhum código lê/escreve.
  - **Evidência/ressalva:** Adicionada na migration 20260120152857 (linha 'ALTER TABLE calendar_events ADD COLUMN ... invoice_id'); índice idx_calendar_events_invoice_id criado e DEPOIS dropado em 20260126233517. Grep 'invoice_id' em src/components/calendar = 0. EventForm insert não seta invoice_id (schema zod nem tem o campo). Só aparece como coluna/FK em types.ts e nas migrations.
- **`colunas google_event_id / google_calendar_id / sync_enabled / last_sync_at`** — `supabase/functions/google-calendar/index.ts:197,259` _(tabela)_
  - **Motivo:** Só tocadas por sync_event/callback, ambos nunca invocados -> dead na prática.
  - **Evidência/ressalva:** Grep global: google_event_id/google_calendar_id só na edge (index.ts:197,219,222,259-260,283,287,289) — em calendar_events; escritos apenas por sync_event/delete_event (nunca invocados). sync_enabled só escrito por callback (index.ts:137, nunca invocado). last_sync_at (de google_calendar_integrations) = ZERO refs em qualquer código, inclusive na própria edge (os hits de last_sync_at pertencem a unifi/network/integration_settings). Nenhum leitor útil no frontend.

### knowledge — Base de Conhecimento
- **`not_helpful_count`** — `src/components/knowledge/*` _(export)_
  - **Motivo:** Coluna de banco existe mas nunca é exibida na UI (só helpful_count é mostrado).
  - **Evidência/ressalva:** —
- **`RPC increment_article_views (branch feliz)`** — `src/components/knowledge/ArticleViewer.tsx` _(funcao)_
  - **Motivo:** RPC chamada não existe (ausente das migrations e do types.ts Functions); o try sempre lança e cai no fallback update não-atômico. Ramo atômico é efetivamente morto.
  - **Evidência/ressalva:** Grep global de Share2/'Compartilhar': só ArticleViewer.tsx:180-183. É um <Button variant=outline size=sm> SEM onClick e sem wrapper clicável. Ao lado (L176-179) existe o botão 'Copiar link' funcional (handleCopyLink). Nenhum handler de share/Web Share API em lugar algum.

### reports — Relatorios, Dashboards e Exportacao
- **`exportConfigs`** — `src/lib/export.ts:79` _(export)_
  - **Motivo:** Objeto de colunas por entidade (tickets/clients/invoices/contracts/assets/managementReport) nunca consumido; cada caller define columns inline
  - **Evidência/ressalva:** grep global do repo: unica ocorrencia em codigo-fonte e a definicao (export.ts:79). Demais hits sao doc/knowledge-graph (docs/MAPA_DE_SETORES.md:679/695 ja marcam como 'possivelmente nao usado'; graphify-out/GRAPH_REPORT.md:589, graph.json/graph.html). Zero imports com o nome. Callers reais (TimeReportTab/ClientManagementReport/AdditionalChargesReportTab) definem columns inline no proprio JSX do ExportButton. MORTO.

### gamification — Gamificacao
- **`technician_badges (tabela)`** — `src/integrations/supabase/types.ts:5442` _(tabela)_
  - **Motivo:** Tabela existe no schema mas NENHUM código de app (frontend/edge) lê ou escreve. Não há lógica de premiação de badges por técnico; a página só mostra o catálogo global de badges. Badges são 'código morto funcional'.
  - **Evidência/ressalva:** Grep global só retorna schema/docs: types.ts:5442, migration 20260119164953 (CREATE TABLE L298 + RLS 'Staff can view earned badges' L707 / 'System can award badges' L708), CHANGELOG.md:703, docs/MAPA_DE_SETORES.md:712/723, PRODUCT_IDEAS.md:26. ZERO leituras/escritas em src/ e ZERO em supabase/functions/ (grep em functions exit=1). Nenhum trigger/cron/edge insere ou lê.
- **`badges.description (campo selecionado, não exibido)`** — `src/pages/gamification/GamificationPage.tsx:59` _(export)_
  - **Motivo:** Query seleciona 'description' dos badges mas a UI (L185-197) só renderiza name+icon; description nunca é exibida.
  - **Evidência/ressalva:** select inclui 'description' (L59) mas em src/pages/gamification/ apenas goal.description é renderizado (L226); badge.description nunca é referenciado (render de badges L185-197 usa só badge.name + badge.icon). Grep de '.description' na pasta confirma um único uso, o de goal.

### db-schema — Banco de Dados, Migrations e Schema
- **`increment_article_views (RPC)`** — `src/components/knowledge/ArticleViewer.tsx:66` _(rpc)_
  - **Motivo:** RPC chamada pelo frontend NÃO existe em nenhuma migration nem em types.ts; o try sempre falha e cai no catch (UPDATE views não-atômico, race condition). Branch .rpc morto — criar a RPC atômica ou remover a chamada.
  - **Evidência/ressalva:** Grep global: a RPC NAO existe em nenhuma migration (grep em supabase/migrations => 0) nem em types.ts (0). Unico caller real e ArticleViewer.tsx:66; docs/MAPA_DE_SETORES.md:626/637 ja registra a ausencia. Sem import dinamico/lazy/config.toml/cron/teste. Nao consegui refutar: a chamada .rpc nunca tem sucesso porque a funcao inexiste no banco -> PostgREST sempre retorna erro -> cai sempre no catch/fallback UPDATE.
- **`calculate_penalties (RPC)`** — `src/integrations/supabase/types.ts:6897` _(rpc)_
  - **Motivo:** RPC existe no banco/types mas nenhum caller em código (src, supabase/functions, relay-unifi). Possivelmente usada só dentro de outra função SQL/view; candidata a órfã se não referenciada em SQL.
  - **Evidência/ressalva:** Grep EXATO 'calculate_penalties' no repo inteiro => apenas 2 hits: a definicao (migration linha 75) e types.ts:6897. ZERO callers em src, supabase/functions e relay-unifi. Nenhum trigger/view/outra funcao SQL nas migrations a invoca. A edge function calculate-invoice-penalties/index.ts NAO chama a RPC: calcula multa/juros em TS proprio (logs [CALC-PENALTIES], variaveis fine/interest/total/daysOverdue). config.toml so lista a edge, nao a RPC.

### shared-lib — Libs e Hooks Compartilhados
- **`Logger.invoiceProcessingLog`** — `src/lib/logger.ts:308` _(funcao)_
  - **Motivo:** Método público do logger sem nenhum caller
  - **Evidência/ressalva:** Grep global 'invoiceProcessingLog': so definicao logger.ts:308 + rotulo graph.json. Zero callers.
- **`Logger.getLogs`** — `src/lib/logger.ts:390` _(funcao)_
  - **Motivo:** Getter de logs em sessionStorage sem consumidor (LogsViewerTab usa application_logs no banco, não este)
  - **Evidência/ressalva:** Grep global '.getLogs' e 'getLogs': nenhum consumidor em src/ (0 chamadas); so a definicao logger.ts:390 e rotulo graph.json. LogsViewerTab le application_logs no banco, nao este getter de sessionStorage.

## Parte D — Candidatos REFUTADOS pelo revisor (estão VIVOS — NÃO remover) (18)

- **`update-user-email`** — `supabase/functions/update-user-email/index.ts` — VIVO: Grep global do literal `update-user-email`: NENHUM supabase.functions.invoke em src/ (0 callers de UI). PORÉM ha referencias vivas: supabase/config.toml:36 (deploy, verify_jwt=false por MAPA:135), ADMIN_TOOLS.md:55 (matriz de permissoes: admin), CHANGELOG.md:753 e docs/MAPA_DE_SETORES.md:119,1399.
- **`confirm-user-email`** — `supabase/functions/confirm-user-email/index.ts` — VIVO: Grep global do literal `confirm-user-email`: NENHUM invoke em src/ (0 callers de UI). Referencias vivas: supabase/config.toml (deploy), ADMIN_TOOLS.md:56 (matriz: admin), CHANGELOG.md:753, docs/MAPA_DE_SETORES.md:119,1399.
- **`deep-link /tickets?open=<id> (push de send-ticket-notification)`** — `supabase/functions/send-ticket-notification/index.ts:248` — VIVO: REFUTADO como 'morto': a rota /tickets?open=<id> e GERADA por codigo VIVO em 3 pontos, nao so no push: src/components/dashboard/RecentTicketsList.tsx:115 navigate(`/tickets?open=${ticket.id}`) (clique no card do Dashboard), src/components/notifications/NotificationDropdown.tsx:24 return `/tickets?open=${relatedId}` (sino de notificacoes) e send-ticket-notification/index.ts:248 (push). Ha referencias vivas => nao e codigo morto.
- **`check-doc-expiries (agendamento)`** — `supabase/functions/check-doc-expiries/index.ts` — VIVO: REFUTADO. Ha cron ativo documentado: docs/MAPA_DE_SETORES.md:97 -> 'check-doc-expiries-daily | 0 9 * * * | check-doc-expiries', dentro do 'Snapshot de crons ativos (pg_cron)' verificado em 2026-06-29 via SELECT * FROM cron.job (linhas 90-91). O grep so falhou nas migrations porque o agendamento vive no banco (pg_cron/Lovable), nao versionado em SQL. Correto que nao ha invoke no frontend e nao ha cron.schedule nas migrations, mas a funcao roda diariamente as 09:00. Nao e codigo morto.
- **`company_settings.certificado_* (leitura no dashboard)`** — `src/pages/settings/CertificateDashboardPage.tsx:95` — VIVO: REFUTADO como codigo morto. (1) A pagina e ROTA VIVA: AnimatedRoutes.tsx:184 (ProtectedRoute admin/financial, lazy) + link no menu AppSidebar.tsx:89 (/settings/certificates) -> o codigo de leitura executa, nao e morto. (2) A premissa 'nenhuma escrita encontrada' e FALSA: CompanyTab.tsx onSubmit ESCREVE certificado_tipo e certificado_validade em company_settings (schema L66-67, payload L170-173 com spread ...data + certificado_validade: data.certificado_validade || null).
- **`send-notification (edge function)`** — `supabase/functions/send-notification/ (inexistente)` — VIVO: Nao existe como codigo. Glob supabase/functions/send-notification/** = vazio; Glob de *notification*/ retorna apenas resend-payment-notification, send-alert-notification, send-push-notification, send-ticket-notification, batch-collection-notification, send-nfse-notification (todos distintos; 'send-notification' nao e substring de nenhum). Grep global 'send-notification' = 0 hits em codigo (.ts/.tsx), 0 em supabase/config.toml, 0 em invoke()/rpc()/import. Unicos hits sao DOCUMENTACAO: CHANGELOG.md:816 e docs/MAPA_DE_SETORES.md (469, 479, 484, 503, 993, 1126, 1146, 1413). graphify: 'No node matching send-notification found'.
- **`Progresso de metas (Progress value=0)`** — `src/pages/gamification/GamificationPage.tsx:234-237` — VIVO: É JSX efetivamente renderizado (L234, dentro do card 'Metas Ativas'), alcançável quando goals.length>0 (goals do seed em migration ...164953:782-784). Não é símbolo órfão/sem referência.
- **`gamification (categoria de permissão)`** — `src/lib/permissions.ts:101,198` — VIVO: REFUTADO. PERMISSIONS_CONFIG.gamification (L101) e MODULE_METADATA.gamification (L198) SÃO consumidos por src/components/settings/RolePermissionsTab.tsx: ALL_MODULES=Object.keys(MODULE_METADATA) (L32) → ALL_MODULES.map (L265) renderiza uma linha para gamification com MODULE_METADATA[module].label/description (L271/275) e lê PERMISSIONS_CONFIG[module] (L118/129). O catálogo também alimenta usePermissions.ts/hasPermission (motor genérico de permissões).
- **`ContactBlockValue.for_someone_else`** — `src/components/client-portal/ContactBlock.tsx:12` — VIVO: VIVO. Lido em ContactBlock.tsx:30 (`!value.for_someone_else` no useEffect que força 'outra pessoa' sem telefone padrão), :46 (`value.for_someone_else ? value.phone : ""` em setOther) e :52 (`const isSelf = !value.for_someone_else`), que dirige `lockedFields` (:53) e desabilita os inputs de telefone (:107) e WhatsApp (:119). Inicializado em ClientTicketForm.tsx:69. É estado de UI load-bearing (controla travar/destravar campos), apenas não é enviado à RPC. O próprio auditor já reconheceu que não é morto de fato.
- **`IntegrationConfigCard (componente compartilhado)`** — `src/components/settings/integrations/IntegrationConfigCard.tsx` — VIVO: VIVO. Importado e renderizado por TelegramConfigForm.tsx:10 (import), :58 e :118 (JSX). graphify explain + grep global confirmam: unico consumidor em src, mas e uso real em producao (renderiza a UI do Telegram). Sem barrel/index, sem *.test.*, sem import dinamico/lazy. 0 outros consumidores — porem NAO e morto.
- **`prop saveLabel de IntegrationConfigCard`** — `src/components/settings/integrations/IntegrationConfigCard.tsx` — VIVO: Referenciada em IntegrationConfigCard.tsx:30 (tipo), :40 (default) e :87 (renderizada). Grep global de saveLabel: apenas essas 3 linhas. Nenhum call-site passa saveLabel — o unico consumidor do Card (TelegramConfigForm) nao passa. Ha uso vivo interno em :87.
- **`downloadStorageFile`** — `src/lib/storage-utils.ts:68` — VIVO: Grep global 'downloadStorageFile': def(68) + chamada VIVA em storage-utils.ts:115 dentro de downloadStorageFileSafe, que E importado/usado por BillingInvoicesTab.tsx (linhas 35,605,620,718,733). A funcao esta VIVA por caller interno; remove-la quebra o wrapper usado.
- **`userClientFromAuth`** — `supabase/functions/_shared/auth-helpers.ts:32` — VIVO: VIVO. Grep global no repo: def L32 + uso interno L59 (auth-helpers.ts); demais hits sao docs (MAPA_DE_SETORES.md) e artefatos gerados (graph.json/graph.html). E chamado por requireRole (L59), que e importado por 9 edges: create-user, delete-user, confirm-user-email, update-user-email, invite-user, resend-invite, revoke-invite, activate-invite-manually, detect-auth-anomalies. Nao ha 0 referencias vivas — ha referencia interna viva num caminho executado.
- **`getEnv`** — `supabase/functions/_shared/auth-helpers.ts:17` — VIVO: VIVO. Grep global: def L17 + 2 usos internos L26 (adminClient) e L33 (userClientFromAuth); demais hits sao so graph.json/graph.html gerados. adminClient e importado por multiplas edges (ex.: create-user, delete-user, confirm-user-email, update-user-email, detect-auth-anomalies), logo getEnv e alcancado transitivamente em caminho executado.
- **`AuthResult`** — `supabase/functions/_shared/auth-helpers.ts:39` — VIVO: VIVO. Grep global: def L39 + uso como tipo de retorno de requireRole em L55 (Promise<AuthResult>); demais hits so em graph.json/graph.html gerados. requireRole e importado por 9 edges, portanto a interface participa do contrato tipado externo (o AuthResult retornado e desestruturado nos callers via .ok/.status/.error/.userId/.roles).
- **`README.md`** — `README.md` — VIVO: grep global 'README\.md' fora de node_modules: 0 links em docs do projeto (so aparece em graphify-out/* gerado). POReM nao e codigo morto: README.md e a landing page convencional do repo GitHub, renderizada automaticamente — nao depende de link interno. Existe tambem relay-unifi/README.md (vivo, distinto). Conteudo do root e boilerplate Lovable com placeholders (REPLACE_WITH_PROJECT_ID) e contradiz a stack (instrui npm/nvm/Node; projeto usa bun/Vite).
- **`IMPLEMENTATION_GUIDE.md (feature S3)`** — `IMPLEMENTATION_GUIDE.md` — VIVO: REFUTADO parcialmente. O arquivo NAO esta orfao: e linkado por CLAUDE.md:198 (§8 Documentacao de Referencia). Contem conteudo VIVO: §2.1 batch-process-invoices (edge existe em supabase/functions/batch-process-invoices) + hook src/hooks/useBatchProcessing.ts (existe) + tabela invoice_documents (existe em migrations 20260205*). O que esta OBSOLETO sao apenas as secoes S3/UI: §2.2 test-s3-connection, §3.1 InvoiceActionIndicators.tsx, §3.2 BillingBatchProcessing.tsx, §3.3 S3StorageConfigForm.tsx, §3.4 s3-storage.ts — todos inexistentes (Glob 0).
- **`useSecureAction.ts`** — `src/hooks/useSecureAction.ts` — VIVO: Glob src/**/useSecureAction.* = 0 arquivos; grep em src (codigo) = 0. O simbolo NAO existe como codigo — logo nao ha 'codigo morto' a remover. E o inverso: 3 docs afirmam que ele existe/e usado — SECURITY.md:20, docs/MAPA_DE_SETORES.md:116 E TAMBEM SYSTEM_DOCUMENTATION.md:876 (auditor citou so 2).

## Parte E — Divergências vs MAPA_DE_SETORES.md e docs (consolidado)

### auth
- MAPA (linhas 119, 135, 1399) cita a edge 'resolve-username' como parte do módulo - ela NÃO existe (dir supabase/functions/resolve-username ausente). A função real de resolução por username é 'login-with-username'.
- MAPA §135 lista verify_jwt=false para 'resolve-username' (inexistente) e não registra que 'login-with-username' (a real) não está em config.toml, logo cai no default verify_jwt=true (funciona via anon key, mas contraria a descrição do MAPA).
- MAPA descreve update-user-email e confirm-user-email como parte ativa do fluxo de usuários, mas ambas estão órfãs: 0 chamadas na UI (só citadas em ADMIN_TOOLS.md/CHANGELOG).
- MAPA conta 'Autenticacao, Usuarios e Permissoes (15)' - o número de edges bate (15), porém a lista contém 'resolve-username' no lugar de 'login-with-username'.
- MAPA (linhas 122, 1367) trata auth-email-hook como integração ativa de emails transacionais, mas CHANGELOG.md:824 registra 'deployado mas silencioso (webhook Send Email Hook não configurado no painel Supabase)' - estado real é incerto/inativo.

### tickets
- MAPA esta em grande parte CORRETO e ate ja documenta os principais riscos deste modulo — poucas divergencias reais. Ja registra: sla_deadline nunca escrito (L180), 3 edges fora do config.toml herdando verify_jwt=true (L183), escrita duplicada de historico useTicketAttendance vs TicketsPage (L185), check-no-contact usar updated_at (L187), notify-sla-breach so alertar se houver assigned_to (L188), mismatch de contrato do push (L1185) e Telegram camelCase (L1135). Tudo confirmado no codigo.
- MAPA L166 (lista de componentes) OMITE componentes existentes do modulo: KBSuggestions, TagsInput, TagBadge, TicketLinksSection, TicketMobileCard, TicketTypeBadge, RequesterContactCard.
- MAPA nao sinaliza que a instancia de TicketRatingDialog no TicketsPage e morta (isRatingOpen nunca vira true) — avaliacao pelo staff nesta tela nao existe (so no portal).
- MAPA nao registra que o deep-link de push /tickets?open=<id> (send-ticket-notification:248) nao e tratado pelo TicketsPage (que so le ?action=new) — clique no push nao abre o chamado.
- MAPA nao registra que o Kanban (TicketsKanbanView) nao tem colunas no_contact nem closed, entao chamados 'Sem Contato' somem da visao kanban.
- Maturidade 'parcial' no indice (L23) confere com o estado real do modulo.

### clients-doc
- MAPA §5.12/tabela (linhas 233,1000) diz 'cnpj-lookup sem token/rate-limit/timeout' — DESATUALIZADO: a edge já tem AbortController timeout 8s + tratamento de 429/502/504 + JSON inválido (cnpj-lookup/index.ts:34-84).
- MAPA tem contradição interna sobre o cron de check-doc-expiries: linha 97 lista 'check-doc-expiries-daily 0 9 * * *', mas linha 235 diz 'cron nao encontrado nas migrations'. Confirmado: NÃO há cron.schedule em supabase/migrations (agendamento, se existir, é externo/Lovable — não verificável sem banco).
- MAPA (linhas 228,241,1441) marca como RISCO ALTO/pendente que merge_clients não migra doc_* — CONFERE com o código: a migration mais recente 20260427092735 migra 13 tabelas mas nenhuma doc_* nem doc_alerts/doc_sync_log; risco permanece aberto (MAPA correto, não resolvido).
- MAPA (linhas 230,243) aponta bug de cache do useDocSync.invalidateAll com queryKeys que não casam — CONFERE: invalidateAll usa ['doc-table','doc_devices',clientId] (useDocSync.ts:94-97) mas useDocTableCrud monta ['doc_devices',clientId,'all'] (useDocTableCrud.ts:35); tabelas não re-renderizam pós-sync.
- MAPA não menciona o SEGUNDO caminho de exclusão de cliente: ClientsPage.tsx:169-183 faz hard-delete cru (.from('clients').delete()) sem checagem de bloqueios, paralelo ao RPC seguro delete_client_safely usado em DeleteClientButton — redundância/risco não documentado.
- MAPA (linha 215) lista useClientMonitoredDevices.ts como hook do módulo Clientes, mas ele é consumido por tickets/portal do cliente (TicketForm, ClientPortalPage, DeviceSelector), não pela UI de Clientes/Documentação.
- MAPA (linha 214) lista os componentes do dossiê de forma parcial ('DocSectionSecurity, DocTableCredentials, DocTableLicenses...'); o módulo real tem 11 DocTable* + 5 DocSection* + 3 shared (Field/SourceBadge/StatusBadge) — contagem/inventário incompleto.

### contracts
- MAPA (L278/L287) afirma 'Agendamento ausente no código (sem cron.schedule nas migrations)'. Confere para migrations (só criam economic_indices/contract_adjustments), MAS o cron.schedule EXISTE em DEPLOYMENT_PLAYBOOK.md:161 (check) e :170 (fetch) — 'ausente no código' é impreciso; está no playbook, não em migration.
- Horário do cron diverge entre docs: MAPA §Crons (L96) diz check-contract-adjustments '0 10 * * *' (bate com comentário do edge 'Runs daily at 10h UTC'), mas DEPLOYMENT_PLAYBOOK.md:161 diz '0 7 * * *'. Fonte real (cron.job no DB) NÃO verificada (regra: não consultar banco).
- MAPA (L262) lista EconomicIndicesWidget como frontend do módulo Contratos, mas o componente só é montado no setor Billing (BillingPage:199 -> BankReconciliationTab:225); nenhuma página/rota de contracts o consome.
- Demais afirmações do MAPA conferem com o código: duplicação edge vs client-side (L276), edge não grava applied_by nem adjustment_percentage (L277), UI nunca chama a edge (L271/L276), verify_jwt=false nas 3 edges (L281), check-contract-adjustments não lê economic_indices (L1353), cron do fetch só no playbook sem migration (L1349).

### billing
- MAPA §3 (linha 312) lista generate-invoice-payments como edge ATIVA do módulo; na prática está órfã (0 invoke, fora de config.toml e da tabela de cron 95-102). MAPA:324 só a cita como 'duplicação de lógica', não como morta.
- MAPA:323/1449 afirma que billing-fsm.ts está 'alinhada' e resta só limpeza de leituras mortas; NÃO registra que 9 dos 11 exports da FSM (computeInvoiceDerivedState, getDerivedStateDisplay, canResendNotification, canRegenerateBoleto, canEmitNfse, canCancelInvoice, canForcePolling) só são consumidos pelo teste — a UI usa apenas canCancelBoleto+canMarkAsPaid. A investida de centralização está praticamente inerte.
- MAPA não registra os exports mortos de useInvoices.ts (useInvoice, useInvalidateInvoices, InvoiceWithErrors); além disso useInvoiceActions/BillingInvoicesTab duplicam invalidateQueries inline em vez de usar useInvalidateInvoices.
- MAPA:1407 conta 'Faturamento e Cobrança (12)' incluindo admin-cancel-asaas-payment (fora do escopo passado) e generate-invoice-payments (órfã) — a contagem não reflete o que está efetivamente cablado.
- MAPA lista os edges do módulo (312) sem banco-inter/webhook-banco-inter (classificados noutra seção como 'Pagamento externo'), mas banco-inter continua sendo invocado a partir do código do módulo (useInvoiceActions:86,238,259; BillingInvoicesTab:354,886) como branch de provider legado — a fronteira do módulo no MAPA está desatualizada.
- CONVERGE (confirmação, não divergência): MAPA:1073/1086/1429 já registra webhook-banco-inter fora do config.toml (verify_jwt=true) — confirmado ausente de config.toml.
- CONVERGE: MAPA:331 (renegotiate MAX+1 race), :332 (DelinquencyReport ignora fine/interest → subestima Total Vencido, confirmado em DelinquencyReportPage:154 soma só amount), :334 (batch-process-invoices sem idempotência) e :330 (notify-due-invoices não cobre overdue) — todos confirmados no código.

### nfse
- Contagem de linhas: MAPA §3.6 (linha 366) diz asaas-nfse '~2689 linhas'; o arquivo real tem 3010 linhas.
- Risco obsoleto: MAPA linha 385 lista 'STATUS_MAP divergente (CANCELLATION_DENIED -> autorizada vs erro)', mas o código real já mapeia CANCELLATION_DENIED -> 'erro' (webhook-asaas-nfse/index.ts:61). Divergência já corrigida, ainda listada como risco aberto.
- Risco parcialmente obsoleto: MAPA linha 381 diz que send-nfse-notification só assina paths 'nfse-files/' e 'links do webhook podem quebrar'. O resolveStoragePathBackend atual trata também o prefixo 'nfse/' (send-nfse-notification/index.ts:28-30), resolvendo ambos os formatos (webhook grava 'nfse/<id>.pdf'; check_single_status grava 'nfse-files/...'). Mitigado.
- Código morto subestimado: MAPA linha 379 cita apenas a action 'decrypt' como morta; existem 4 outras actions sem caller não citadas — get_status, list_services, create_customer, retry_failed (+ alias legado delete_record).
- Componentes: MAPA linha 362 enumera os componentes de billing/nfse mas omite NfseServiceCodeCombobox (existe e é usado por NfseAvulsaDialog e NfseEditForm).
- Concordância confirmada (não é divergência): duplicação de fonte de certificado (Manager grava 'certificates' vs Dashboard lê 'company_settings.certificado_*') e ausência de cron de validade de certificado (MAPA 378, 380) batem com o código; check-doc-expiries cobre documentação de clientes, não o certificado A1.

### monitoring
- MAPA §2/linha 101 lista cron 'unifi-sync-hourly' (0 * * * *) -> unifi-sync, mas NÃO existe cron.schedule para unifi-sync/checkmk-sync/tactical-rmm-sync em supabase/migrations (grep 0 resultados). Pode ser gerenciado no dashboard Supabase (não verificável em leitura); o próprio MAPA linha 820 admite 'IntegrationStatusPanel lista crons hard-coded'. DÚVIDA a confirmar no banco/pg_cron (não consultado).
- MAPA §3.7 (linha 415) lista 'src/components/services/ServiceForm.tsx' como componente do módulo Monitoramento, contradizendo a própria NOTA (linhas 411/429) de que ServiceForm/useServiceCodeUsageStats/poll-services são financeiro/NFS-e. Inconsistência interna: esses 3 confirmadamente NÃO pertencem ao RMM.
- MAPA §3.7 (linha 416) lista useServiceCodeUsageStats.ts e useDocDeviceSync/useDocSync como hooks de Monitoramento; na prática useServiceCodeUsageStats é NFS-e (usado só em ServiceCodeSelect/NfseServiceCodeCombobox) e os useDoc* pertencem ao módulo Clientes/Documentação.
- Ponto onde o MAPA ACERTA (sem divergência, apenas confirmação): bug controllerId vs controller_id (5.9/1239), realtime inexistente na tela (430), dedup divergente tactical vs checkmk (436), tactical resolve todos alertas ao voltar online (437), tactical-rmm-sync com verify_jwt=true default divergindo de checkmk/unifi (1296), UnifiConfigForm sem clientId em IntegrationsTab (812/1240) — todos verificados como reais no código.

### notifications
- send-notification: MAPA a trata como edge existente e afirma que 'grava message_logs' (linhas 993 e 1126) ao mesmo tempo que a chama de 'código morto' (469, 1413). Realidade: NÃO existe nenhum arquivo/diretório send-notification no repo — é referência fantasma; a afirmação de que grava message_logs é incorreta.
- Contagem 'Notificações e Comunicação (10)' (MAPA 469/1413) inclui a phantom send-notification e a batch-collection-notification (escopo faturamento); edges reais de transporte/webhook do módulo = 9 existentes (8 do escopo + as webhooks). O total infla por conta do item inexistente.
- send-email-resend '(+16 consumidoras)' (MAPA 992): a contagem real de invokers é ~17 (forgot-password, reset-password, invite-user, resend-invite, resend-confirmation, notify-due-invoices, resend-payment-notification, batch-collection-notification, send-nfse-notification, send-ticket-notification, send-alert-notification, check-no-contact-tickets, generate-monthly-invoices, generate-invoice-payments, webhook-asaas-nfse, webhook-banco-inter, ResendConfigForm).
- CONFERE (não é divergência, apenas confirmação): MAPA já identifica corretamente que webhook-resend-status/telegram/whatsapp-status estão fora de config.toml herdando verify_jwt=true (linhas 1107/1159/1429), que webhook-telegram-status é stub (1136) e que send-telegram não grava message_logs (1126). O código confirma os três pontos; a correção proposta ainda NÃO foi aplicada.

### calendar
- MAPA (docs/MAPA_DE_SETORES.md §14, ~L515-552 e §Integrações ~L1206-1223) está SURPREENDENTEMENTE ALINHADO ao código: já documenta o callback não capturado, sync órfã, e artefatos mortos (billing_reminder, invoice_id, onEdit, canEdit) — confirmado, sem contradição.
- MAPA L522 lista tabelas do módulo como 'calendar_events, google_calendar_integrations, integration_settings, clients (read-only), invoices (FK invoice_id nao usada)' mas OMITE a FK calendar_events.ticket_id, que existe no schema (types.ts:568 calendar_events_ticket_id_fkey) — divergência menor de completude.
- MAPA L538 diz 'Edge nao valida JWT/identidade para sync_event/delete_event'. Nuance: google-calendar NÃO está em supabase/config.toml (grep=0), logo verify_jwt assume o default true (JWT exigido no gateway); o que falta é checagem de identidade por-usuário no código (usa service role e confia no user_id do body). O JWT em si é exigido.
- Checklist do MAPA (L552 'Limpar artefatos mortos: billing_reminder, invoice_id, reminder_sent, onEdit, canEdit') continua ABERTO — nenhum foi removido no código atual; nota: coluna 'reminder_sent' citada no MAPA não foi encontrada em migrations/types (grep=0), pode já não existir.

### inventory
- docs/MAPA_DE_SETORES.md (§ Inventário, L560-602) está NOTAVELMENTE ALINHADO com o código — poucas divergências. CONFIRMADO: o 'BUG CRÍTICO' que o MAPA descreve na L578 é real e continua NÃO remediado. Prova: InventoryPage.tsx:139 seleciona 'license_key, max_activations, current_activations, status' de software_licenses_safe, mas a view (migration 20260204131545 L14-29 e types.ts:6826-6841) só expõe id, client_id, name, vendor, total_licenses, used_licenses, purchase_date, expire_date, purchase_value, notes, created_at, updated_at, license_key_masked. As colunas pedidas não existem => PostgREST 400 quebra a aba Licenças.
- MAPA L579 (inconsistência de tipos): CONFIRMADO — o type LicenseWithClientSafe e o render usam used_licenses/total_licenses (InventoryPage.tsx:438-439) que o select nem pede.
- MAPA L580 (mascaramento incoerente): CONFIRMADO — InventoryOverview lê a tabela base software_licenses (InventoryOverview.tsx:97,165), não a view safe (aqui só nome/data, sem chave, então baixo risco).
- MAPA L581 (AssetForm sem 'software'/'license' no Select): CONFIRMADO — enum asset_type inclui software/license (InventoryPage.tsx:81-82) mas o Select do AssetForm.tsx:210-216 omite ambos.
- MAPA L583 (cast desnecessário de ip_address): CONFIRMADO — assets.ip_address é coluna tipada real (types.ts:196), então o cast '(asset as Record<string,unknown>)?.ip_address' em AssetForm.tsx:67 é desnecessário.
- Divergência não listada no MAPA: existe um CRUD de ativos PARALELO em src/components/clients/ClientAssetsList.tsx (assetSchema/form/DocDeviceLinkDialog/useClientBranchOptions próprios, from('assets') em L197,354,359,428) — duplica AssetForm; o MAPA não menciona esse caminho redundante.

### knowledge
- docs/MAPA_DE_SETORES.md §3.11 está, incomum, EM DIA e majoritariamente CORRETO: paths, lista dos 10 componentes de knowledge/, ausência de edge functions, tabelas (knowledge_articles/knowledge_categories/article_feedback/ticket_categories/storage knowledge-images) e dependências (KBSuggestions/TicketResolveDialog em Tickets) conferem com o código.
- CONFIRMADO (não é divergência): MAPA:626 'RPC increment_article_views NÃO existe' — verificado: ausente das migrations (só generate_slug/unaccent) e do types.ts; ArticleViewer.tsx:66 sempre cai no fallback não-atômico.
- CONFIRMADO: MAPA:627 rota /knowledge e /knowledge/:slug ambas requireStaff (AnimatedRoutes.tsx:168-169) enquanto KBSuggestions (usada no ClientTicketForm do portal) linka /knowledge/:slug — cliente vê sugestão mas o link é barrado; is_public tem efeito prático limitado.
- CONFIRMADO: MAPA:629-632 riscos reais — MarkdownPreviewRenderer monta <a href>/<img src> direto do regex sem allowlist (XSS via javascript:/data:) em MarkdownPreviewRenderer.tsx:49-52,133-137,171-176; filtro .or() por interpolação sem escaping em KnowledgePage.tsx:59 e KBSuggestions.tsx:33-35.
- NÃO VERIFICADO nesta auditoria (fora do escopo primário, sem acesso a banco): MAPA:628 sobre artigos criados via TicketResolveDialog usarem category_id/client_id legados; MAPA:634 dependência de extensão unaccent (a função generate_slug usa unaccent em migrations 20260309.../20260414..., mas a instalação da extensão não foi confirmada).

### reports
- MAPA (linha 679 e checklist 695) lista exportConfigs como 'possivelmente nao usados' — CONFIRMADO morto (0 refs). Alem disso o export 'formatters' em src/lib/export.ts:66 tambem esta morto (0 refs) e NAO e mencionado pelo MAPA.
- MAPA linha 671 aponta bug em AdditionalChargesReportTab (tipos AdditionalChargesReportTabProps e ReportData nao declarados/importados) — CONFIRMADO: o arquivo usa ambos (L15 e L26) sem nenhuma declaracao/import, so nao quebra por falta de type-check. MAPA correto.
- MAPA nao registra a prop morta 'trend' em AnimatedStatCard nem imports nao usados (Button/Download em ClientManagementReport; Button/startOfMonth/endOfMonth/Building2 em TimeReportTab).
- Riscos do MAPA nao verificaveis nesta auditoria (regra: sem consulta ao banco): RPCs SECURITY DEFINER sem guarda de role (l.673) e get_client_management_report 'tem guarda' — corpo das RPCs nao inspecionado; as 6 RPCs existem no contrato gerado types.ts (L6984-7023). Restante da secao 3.12 (paginas, componentes, ausencia de edge functions, aba Servicos placeholder, rotas/roles) confere com o codigo.

### gamification
- MAPA:724 subestima o bug de ícones: diz que 'seed usa trophy/award/book-open que caem no fallback'. Na verdade os 6 badges caem no fallback, pois badgeIcons usa chaves de NOME (velocista, guardiao_sla...) e o lookup é por badge.icon (zap/shield/star/...) — interseção zero, inclusive star/zap/shield também falham (GamificationPage.tsx:29-35,191).
- MAPA:703/739 diz 'restrito a staff' e cita guarda de role, mas o enforcement real é apenas requireStaff (rota) + feature flag; a categoria de permissão 'gamification' (permissions.ts:101,198) existe mas NUNCA é aplicada (0 usos de can('gamification')).
- MAPA:716 afirma 'Sem edge function nem integração externa' e trata get_technician_ranking como exclusivo do setor, mas o mesmo RPC é consumido também por TVDashboardPage.tsx:97 e ReportsPage.tsx:116 (fora do módulo) — a RPC não é privativa da gamificação.
- MAPA:712 lista technician_badges como tabela do setor sem sinalizar que ela tem 0 referências no código de app (morta); só types.ts a referencia.
- MAPA:726 lista a inconsistência de período (página all-time vs mini período) como risco — CONFIRMADO no código (GamificationPage.tsx:42 epoch vs TechnicianMiniRanking.tsx:25 startDate); apenas registrando que procede.
- MAPA:723 ('technician_badges e progresso de metas são código morto funcional') e MAPA:727 (RPC SECURITY DEFINER sem filtro de role) — CONFIRMADOS pelo código; sem divergência.

### client-portal
- MAPA §3.14 obs (linha 773) diz 'Financeiro declarado esqueleto no roadmap' — DIVERGENTE: ClientPortalFinancialTab está funcional (3 cards de totais, tabela de faturas, cópia de boleto/código de barras/PIX e download de NFS-e). Não é esqueleto.
- MAPA checklist (linha 783) 'Verificar GRANT EXECUTE da versao hardened da RPC' — pode ser fechado: o GRANT EXECUTE existe na migration base 20260512043108:115 e o harden usa CREATE OR REPLACE (preserva grants).
- MAPA está, no geral, fiel ao código real da §3.14 (lista de componentes linha 750, ausência de edge functions linha 754, fluxo de dados linha 759 conferem). As observações 767 (statusConfig sem renegotiated/lost), 765 (.maybeSingle com >1 contato) e 764 (sem notificação ao staff) foram CONFIRMADAS no código — não são divergências.

### settings
- MAPA §3.15 já documenta corretamente os 2 principais achados (linha 812 bug do UnifiConfigForm sem clientId; linha 813 bug lógico de useFeatureFlag no ramo rollout<=0; linha 816 adoção parcial do IntegrationConfigCard só no Telegram) — nesse ponto o MAPA CONFERE com o código.
- MAPA §3.15 linha 799 lista 'useSavedViews.ts' como hook do módulo, mas nenhum arquivo do escopo de Configurações/Flags/Integrações importa useSavedViews — atribuição aparentemente stale/incorreta para este setor.
- MAPA §3.15 linha 798 lista apenas IntegrationsTab/integrations/*/EmailTemplatesTab; omite as demais abas que fisicamente vivem em src/components/settings (AuditLogsTab, LogsViewerTab, ClientMappingsTab, NotificationRulesTab, SystemTab, SLATab, CategoriesTab, TagsTab, DepartmentsTab, RolePermissionsTab, CompanyTab, MessageLogsTab, MessageMetricsDashboard, invites) — provavelmente atribuídas a outros setores, mas a listagem do módulo fica incompleta.
- MAPA não registra que a rota /settings/feature-flags está SEM ponto de entrada na UI (nenhum link/nav aponta para ela; só acessível por URL direta) — a linha 833 apenas pede conferir o ProtectedRoute, não menciona a rota órfã de navegação.
- MAPA menciona redação de segredos em audit_logs só para integration_settings (linha 863); confirma-se que a AuditLogsTab da UI (src/components/settings/AuditLogsTab.tsx) exibe new_data/old_data cru (3 primeiras chaves) sem qualquer redação client-side, enquanto AuditLogsPage promete redação — inconsistência entre as duas superfícies de auditoria.

### audit-security
- MAPA §847 lista os componentes do setor (AuditLogsList/Filters/Row/Detail/Diff, AnomaliesBanner, LogsViewerTab) mas OMITE o legado src/components/settings/AuditLogsTab.tsx, que continua wired como aba 'Auditoria' em SettingsPage.tsx:60,166 — o MAPA sugere um único viewer quando há dois em produção
- MAPA §856 diz 'sanitiza segredos só em integration_settings', porém o disclaimer da UI em AuditLogsPage.tsx:15 afirma genericamente que 'senhas, tokens, segredos são automaticamente redatados' (todas as tabelas) — a cópia da UI super-promete cobertura de redação além do que o backend faz
- MAPA §98/§131 registra cron detect-auth-anomalies-daily '0 11 * * *' como ATIVO/RESOLVIDO; a migration 20260425173521...:97-104 apenas faz unschedule (nunca cron.schedule) — o agendamento existe só no DB ao vivo (não verificável nesta auditoria read-only)
- MAPA §848 diz 'AnomaliesBanner/LogsViewerTab usam useQuery inline' — confere; mas não sinaliza a divergência de dados abaixo (level/module) que afeta o LogsViewerTab

### db-schema
- Contagem de migrations desatualizada: MAPA diz '163 migrations' (linha 12 e §3.17 linha 892), mas o filesystem tem 164 arquivos .sql (a mais recente 20260710210000_uq_nfse_history_active_per_invoice.sql, registrada no CHANGELOG linha 87 porém a contagem não foi incrementada).
- types.ts: MAPA cita '7427 linhas' (linha 895); arquivo real tem 7439 linhas (drift menor de ~12 linhas, sugere types regenerado após a edição do MAPA).
- CONSISTENTE (não é divergência, apenas confirmo): MAPA já registra que a RPC increment_article_views NÃO existe (linhas 626/637) — minha auditoria confirma (0 defs em migration/types).
- MAPA linha 918 marca hermes_*/unifi_relay_*/vault_upsert_secret como 'RPCs TEMPORARY a verificar' — confirmo que hermes_take/comment/resolve_ticket e vault_upsert_secret existem em types.ts mas não têm caller em src/supabase/functions/relay (invocadas por bot Hermes/edges service_role fora do código versionado), portanto não são órfãs de app mas o ciclo de vida segue não auditável por leitura de código.

### infra
- MAPA §3.18 (linha 946) afirma que os testes exercitam logic.ts de 4 edges incluindo detect-auth-anomalies — FALSO: detect-auth-anomalies só tem index.ts+logic.ts (sem *_test.ts) e NÃO está em vitest coverage.include; os testes src cobrem 3 edges (generate-monthly-invoices, notify-due-invoices, resend-confirmation)
- MAPA (linhas 957/978) alega 'theme-color divergente' entre index.html e manifest — na prática coincidem (#ffb300 em ambos: index.html:25 e manifest.json:8); só background_color difere (manifest #0f1114; index.html não define)
- MAPA (linha 963) trata mocks/http.ts apenas como 'restoreFetch no-op' — na verdade o arquivo inteiro é órfão: nem mockFetchOnce nem restoreFetch são importados por qualquer teste
- MAPA §3.18 lista corretamente RouteChangeLoader e example.test.ts como código morto a auditar (linha 979), mas omite RouteProgressBar (também no-op/0 refs) e public/placeholder.svg (0 refs)
- MAPA foca coverage.include só em edges; na realidade coverage.include tem 5 entradas incluindo src/lib/ticket-payload.ts e src/pages/Login.tsx (vitest.config.ts:16-21)
- Nota de alinhamento: MAPA (linha 942) inclui src/components/ui/sidebar.tsx no módulo — confere (primitivo shadcn usado por AppSidebar); vitest include é src/** apenas, então as *_test.ts sob supabase/functions NÃO rodam neste Vitest (só via imports nos testes de integração src)

### ui-primitives
- MAPA_DE_SETORES.md nao possui um setor dedicado 'Primitivos de UI (shadcn)'; primitivos aparecem apenas de passagem no setor Fundacao, citando so sidebar.tsx e confirm-dialog.tsx.
- MAPA nao enumera nenhum dos 7 componentes CUSTOM que vivem em src/components/ui/ (ColmeiaLogo, HoneycombLoader, EntityHistoryTimeline, DraftRecoveryBanner, loading-skeleton, currency-input) — omissao no mapa.
- MAPA nao registra o codigo morto de loading-skeleton.tsx (5 de 6 skeletons sem uso) nem a duplicacao dos dois sistemas de toast (Radix Toaster + Sonner ambos montados em App.tsx).

### shared-lib
- MAPA L945-946 (setor Fundação/Infra) afirma 'Nenhuma edge function propria', mas src/lib/mcp compila para a edge function real supabase/functions/mcp via mcpPlugin() (vite.config.ts:48) — o servidor MCP e suas 4 tools estão inteiramente ausentes do MAPA
- MAPA L518 lista 'use-mobile.ts' e 'useAuth.ts'; arquivos reais são use-mobile.tsx e useAuth.tsx (extensão .tsx)
- MAPA não documenta em lugar nenhum os utilitários compartilhados src/lib/phone.ts, src/lib/date.ts, nem retryWithBackoff/devLog do logger — lacuna de cobertura do inventário
- MAPA trata logger.ts como caminho de app-logging (L847-856) sem sinalizar que ~7 métodos de negócio + getLogs/clearLogs + devLog são código morto (0 callers)

### shared-edge
- A edge `mcp` NAO aparece em nenhum ponto de docs/MAPA_DE_SETORES.md: ausente da lista de edges de Auth (L119), ausente da tabela de integracoes Supabase 'auth-helpers, auth-email-hook, certificate-vault + ~50' (L1002) e nao ha secao MCP. Integracao Lovable mcp-js/OAuth nao documentada.
- O MAPA cataloga exaustivamente edges sem entrada em config.toml que herdam verify_jwt=true (asaas, banco-inter, whatsapp-status, resend-status, send-push, etc. — §7.2 e varias linhas), mas OMITE que `mcp` tambem esta fora do config.toml herdando verify_jwt=true — inconsistente com o proprio rastreamento de risco do MAPA.
- MAPA L119 lista os helpers _shared (auth-helpers/email-helpers/email-templates) na secao Auth mas nao cita _shared/notification-logger.ts ali (aparece so na secao Notificacoes L465) — cobertura fragmentada.

### docs-config
- Contagem de edges: MAPA §6 'Mapa de Edge Functions (60 funcoes)' e CLAUDE.md §5 '~60 edge functions' — real = 57 dirs deployáveis (ls supabase/functions excluindo _shared)
- MAPA §6 (Faturamento, 12) lista 'admin-cancel-asaas-payment' — NÃO existe em supabase/functions
- MAPA §3.1 (fluxo) e §6 (Auth, 15) citam 'resolve-username' — real é 'login-with-username' (resolve-username ausente)
- Edges reais ausentes do MAPA §6: 'mcp' e 'login-with-username' (mcp não documentado em lugar nenhum)
- MAPA §7.2 fala em 'send-email-smtp fantasma' e SYSTEM_DOCUMENTATION §6.2 trata send-email-smtp como a função de e-mail — real é 'send-email-resend'; não há dir send-email-smtp
- DEPLOYMENT_PLAYBOOK §3 (crons) contradiz o snapshot real em MAPA §2.1: cita poll-boleto-status/poll-asaas-nfse-status (real: poll-services), escalate-alerts e check-certificate-expiry (inexistentes; real: check-doc-expiries), generate-monthly-invoices '0 6 1 * *' e check-contract-adjustments '0 7' (real: diário 0 11 e 0 10)
- IMPLEMENTATION_GUIDE.md descreve storage S3-compatível externo (endpoint/access_key/secret_key, edge test-s3-connection) — MAPA §3.15/DEPLOYMENT_PLAYBOOK §9 dizem storage = Supabase/Lovable Cloud bucket 'nfse-files'; a UI S3 não existe no código
- TESTING.md diz '5 fluxos críticos' e lista create-ticket.test.tsx — real = 8 arquivos em src/test/integration e create-ticket.test.tsx não existe (há audit-logs, delinquency-page, merge-clients, user-management adicionais)
- CLAUDE.md §8 (índice de docs de referência) está incompleto: omite ADMIN_TOOLS.md, BACKUP_PROCEDURE.md, PRODUCT_IDEAS.md e README.md
- MAPA §7.7 marcado '✅ RESOLVIDO' e §7.11 lista 'send-notification orfa' — send-notification de fato não existe mais no repo (não apenas órfã); a nota está desatualizada quanto ao estado

## Parte F — Achados adicionais do revisor (morto/riscos que o auditor perdeu)

### auth
- canAny (src/hooks/usePermissions.ts:38) — MORTO TRANSITIVO: unico consumidor global e PermissionGateAny (PermissionGate.tsx:77), que ja e morto. Grep confirma 0 outros usos. Remover junto com PermissionGateAny.
- canAll (src/hooks/usePermissions.ts:42) — MORTO TRANSITIVO: unico consumidor global e PermissionGateAll (PermissionGate.tsx:106), tambem morto. Remover junto com PermissionGateAll. Efeito domino: ao apagar os 2 gates mortos, canAny e canAll ficam orfaos.
- Import morto de getAllowedActions em usePermissions.ts:2 deve ser removido junto com o export em permissions.ts:152 (mesma limpeza).
- Contraprova (nao sao mortos): getActions (usePermissions.ts:46) esta VIVO em ProfilePage.tsx:125; MODULE_METADATA/ACTION_METADATA (permissions.ts:165,224) VIVOS em ProfilePage.tsx e RolePermissionsTab.tsx. O auditor corretamente NAO os marcou.

### tickets
- Amplificacao do candidato #1 (SLA inerte) alem do que o auditor citou: TechnicianDashboard.tsx:60,65,116 ordena e sinaliza 'vencido' por sla_deadline — como e sempre null, .order(nullsFirst:false) joga tudo para o fim e nenhum chamado e marcado como estourado. Alem disso a RPC de compliance de SLA na migration 20260220171956_...:112-123 calcula total_with_deadline via 'sla_deadline IS NOT NULL' => sempre 0 => retorna 100% de compliance fixo. Toda a superficie de metrica de SLA (Dashboard + TechnicianDashboard + RPC de relatorio) esta morta, nao so notify-sla-breach.
- Risco (vivo-mas-quebrado, nao morto): TicketRatingDialog.tsx:82-88 faz insert em technician_points com 'await' SEM checar erro (fire-and-forget). No caminho do portal (cliente avaliando), a policy RLS exige is_staff => insert e bloqueado e o erro e engolido silenciosamente => no fluxo mais comum os pontos nunca sao concedidos ao tecnico. Confere com docs/MAPA_DE_SETORES.md:722.

### clients-doc
- Nenhum export morto adicional em src/lib/client-merge.ts: MERGEABLE_FIELDS, MergeableField, FieldResolution e previewMerge continuam vivos (previewMerge usado em MergeClientsDialog.tsx:112). So resolveMergedFields esta orfao. isEmpty e interno (nao exportado).
- Ressalva de escopo: a auditoria de morto cobriu apenas os 2 candidatos fornecidos; nao fiz varredura exaustiva do modulo inteiro por outros orfaos. Dentro do que foi tocado, nada mais morto detectado.

### contracts
- Nenhum codigo morto encontrado no modulo — CONFIRMO a lista vazia do auditor. Todos os simbolos tem referencia viva: ContractAdjustmentDialog (ContractsPage.tsx:37,659 e ContractAdjustmentCard.tsx:9,202), ContractRenegotiationDialog/ConfigSheet/HistoryList (usados por ContractAdjustmentCard), ContractAdjustmentCard+Section (ContractForm.tsx:32-33,785,800), useLatestEconomicIndex (ContractAdjustmentDialog.tsx:22,59), useContractAdjustmentHistory (ContractAdjustmentCard.tsx:8,64). Edges: apply-contract-adjustment invocado por check-contract-adjustments/index.ts:108; check-contract-adjustments listado em IntegrationStatusPanel.tsx:262 + config.toml:14; fetch-economic-indices invocado por EconomicIndicesWidget.tsx:44 + config.toml:18. Os 3 edges registrados em supabase/config.toml.
- RISCO DE SEGURANCA (nao dead code): apply-contract-adjustment tem verify_jwt=false (config.toml:5) + CORS '*' (index.ts:4-6) e nenhuma checagem de auth interna. E um endpoint publico que aplica reajuste arbitrario (UPDATE contracts.monthly_value + contract_services + INSERT contract_adjustments) recebendo so contract_id e index_value. Deveria ser invocado apenas internamente pelo cron; hoje qualquer um pode inflar/alterar valores de contrato.
- REDUNDANCIA/FONTE DE VERDADE DUPLA (nao dead code): o reajuste manual (ContractAdjustmentDialog.tsx:84-126, mutation client-side) reimplementa o MESMO write que apply-contract-adjustment/index.ts:58-132, sem compartilhar codigo. E ja divergem: o Dialog grava adjustment_percentage (FIXO?parsed:null) e user_id no contract_history; o edge NAO grava adjustment_percentage nem user_id. Manutencao de duas logicas de reajuste em paralelo.
- POSSIVEL INCONSISTENCIA DE DADOS: renegociacao altera contracts.monthly_value mas nao toca contract_services (ContractRenegotiationDialog.tsx:47-58), enquanto o reajuste por indice atualiza os servicos proporcionalmente. Apos uma renegociacao, a soma de contract_services fica dessincronizada do monthly_value do contrato.
- DUVIDA (nao verificavel sem banco — read-only, nao consultei): o agendamento pg_cron de check-contract-adjustments (diario 10h) e de fetch-economic-indices (semanal, descrito 'so no playbook') NAO esta versionado no repo (nenhuma migration/cron encontrada). Precisa confirmar no banco se os jobs pg_cron existem e estao ativos; se fetch-economic-indices nao roda por cron, economic_indices so e populado manualmente pelo EconomicIndicesWidget.

### billing
- InvoiceProcessingHistory.tsx:124 — 4o site da leitura morta boleto_status==='processando' que o auditor nao listou (ele citou so 3: useInvoiceActions, resend-payment-notification, batch-process-invoices).
- boleto_status==='registrado' TAMBEM e leitura morta da mesma classe: o enum boleto_processing_status NAO tem 'registrado' e nenhuma edge o escreve; aparece em InvoiceProcessingHistory.tsx:121 e no RPC de migration get_integration_health_stats (boleto_status='registrado', linha 54). Auditor nao apontou.
- billing-fsm.ts esta QUASE TODO morto: so canCancelBoleto e canMarkAsPaid tem caller de producao (InvoiceActionsPopover). computeInvoiceDerivedState, getDerivedStateDisplay, os 5 helpers de permissao e os tipos InvoiceDerivedState/DerivedStateDisplay nao tem consumidor fora do teste — candidato a deletar quase o arquivo inteiro mantendo so os 2 helpers vivos + seu teste.
- StatusBadges.tsx:19-21 — comentario JSDoc de exemplo referencia computeInvoiceDerivedState/getDerivedStateDisplay que o componente nunca usa (StatusBadges deriva estado inline); comentario obsoleto.
- SYSTEM_DOCUMENTATION.md:236 documenta boleto_status como TEXT com valores (pendente, processando, gerado, enviado, erro) — doc stale que contradiz o enum real (4 valores, sem 'processando'). Fonte provavel do ramo morto.
- supabase/functions/generate-invoice-payments/ contem apenas index.ts (sem logic.ts nem *_test.ts), fora do padrao do repo (index+logic+test) — reforca estruturalmente que e legado orfao.

### nfse
- decryptPassword() em supabase/functions/certificate-vault/index.ts:80 e codigo morto que o auditor nao listou explicitamente: so e referenciado dentro da branch da action 'decrypt' (index.ts:207), que ja e morta. Deve ser removido junto com a action decrypt.
- Cross-check completo actions definidas x invocadas (23 cases em asaas-nfse): todas as nao-invocadas pelo frontend sao ou os 5 candidatos (get_status, list_services, create_customer, retry_failed, delete_record) ou reissue_nfse (vivo via webhook). Nenhuma action morta adicional em asaas-nfse alem das ja apontadas.
- Regras validadas por amostragem e CONFIRMADAS no codigo: (a) idempotencia emit shouldBlockNewEmission em logic.ts:6,17-21 (NFSE_BLOCKING_STATUSES=[autorizada,processando,pendente], bypass por nfse_history_id/force_new_emission); (b) normalizeServiceCode index.ts:68-72 (replace /[.\s\-]/g, mantem zeros a esquerda); (c) cancelamento index.ts:1789-1808 (justificativa 15-500 chars -> INVALID_JUSTIFICATION 400; ja CANCELLED -> ALREADY_CANCELLED 409). Fluxos check_single_status (NfseProcessingIndicator:84) e certificado A1 (CertificateManager:300-302 action encrypt) tambem confirmados.

### monitoring
- Nenhum código morto confirmado no módulo. Varredura global: as 4 edges (checkmk-sync/tactical-rmm-sync/unifi-sync/send-alert-notification) e as ações test/sync/list_folders/list_clients/list_sites têm referência viva — MonitoringPage.tsx:205/209/220 (Sincronizar), ClientMappingsTab.tsx:192/294/322-323, CheckMkConfigForm/TacticalRmmConfigForm/UnifiConfigForm (invoke), trigger net.http_post→send-alert-notification, e RPCs unifi_relay_* usados por relay-unifi/relay-unifi.ts. UptimeCharts, GroupedAlertsTable, useUnifiedNetworkDevices, network_topology, mapDeviceType/mapAlarmSeverity — todos referenciados.
- RISCO (não é morto) config.toml: checkmk-sync e unifi-sync estão com verify_jwt=false (chamáveis sem autenticação, executando sync que faz fetch externo + escrita no banco com service role), enquanto tactical-rmm-sync e send-alert-notification NÃO constam no config.toml (default verify_jwt=true). Inconsistência de hardening entre edges equivalentes do mesmo módulo.
- BUG LATENTE GroupedAlertsTable.tsx: prop onAcknowledge é tipada como obrigatória ((alertId:string)=>void), mas MonitoringPage.tsx:506 passa undefined quando !canManageMonitoring. O botão 'Reconhecer' por linha (284 e 434) sempre renderiza e chama onAcknowledge(alert.id) sem guarda → usuário staff sem permissão 'monitoring/manage' que clique lança 'undefined is not a function' (a barra em massa 'Reconhecer Selecionados' está protegida por canManageMonitoring, o botão por linha não).
- GAP de convenção (§6.6 CLAUDE.md): nenhuma das 4 edges de monitoramento tem logic.ts nem *_test.ts (só index.ts); a lógica pura testável (isHostOnline, mapServiceStateToLevel, detectDeviceType, calculateAverage, mapAlarmSeverity, mapDeviceType) está embutida no index.ts sem testes. Não é código morto, é dívida de teste.

### notifications
- DOC OBSOLETA/INCORRETA (nao codigo morto, mas precisa correcao) em docs/MAPA_DE_SETORES.md: descreve send-notification como codigo existente e com afirmacoes falsas - L479 'send-notification (orquestrador) sem chamadores; logica duplicada inline nos gatilhos' e L484 'send-whatsapp/telegram dedicados e reimplementados em send-notification' (NAO ha arquivo algum para conter logica duplicada); L503 checklist '[ ] Decidir destino de send-notification (remover ou adotar)' (nada a remover); L469 e L1413 contam-no entre as edge functions do modulo ('10'). CHANGELOG.md:816 registra-o como historico ('sem referencias no codigo'), esse e aceitavel. Recomendacao: corrigir/remover as mencoes no MAPA para refletir que a funcao nao existe.
- Nao ha 'orquestrador' de notificacao no repo: a escrita in-app/multicanal e feita inline pelas edges gatilho (send-alert-notification, notify-sla-breach, notify-due-invoices, etc.), como o proprio auditor afirmou nos fluxos. Portanto a suposta 'duplicacao vs send-notification' descrita no MAPA e inexistente por construcao.
- Nao explorei exaustivamente todos os edges do dominio (send-ticket-notification, send-nfse-notification, resend-payment-notification, batch-collection-notification) quanto a orfandade - fora do candidato dado. Ficam como duvida para auditoria dedicada, sem consulta ao banco.

### calendar
- RPC public.get_calendar_tokens (migration 20260129235822:161, tipo em types.ts:6988): SECURITY DEFINER que retorna access_token/refresh_token do próprio usuário; NENHUM caller (0 supabase.rpc). Órfã do fluxo de sync nunca ligado — o auditor não a listou.
- Feature Google Calendar morta ponta-a-ponta: das 4 actions da edge, só 'auth_url' é invocada (GoogleCalendarConfigForm), e mesmo essa é um beco sem saída (callback nunca tratado). Ou seja, toda a integração OAuth+sync (edge google-calendar inteira + tabela google_calendar_integrations + get_calendar_tokens + colunas google_*/sync_enabled/last_sync_at + enum billing_reminder + invoice_id) é um subsistema abandonado. Candidato a remoção em bloco.
- google_calendar_integrations como caminho de dados morto: só populada pelo callback (nunca invocado); lida por checkUserConnection e apagada por handleDisconnect. Sem callback, nunca há linha -> 'Conectado' inatingível na prática.
- Campos de OAuth preparados e sem consumo real: redirect_uri e state=user_id são montados em auth_url (index.ts:85,90) mas o retorno nunca é processado (sem handler de callback).
- Sem validação de horário no EventForm: end_time pode ser < start_time e ambos são fixados no mesmo dia (start_date), então plantões/eventos que cruzam a meia-noite são impossíveis de registrar — bug latente, não só código morto.

### inventory
- RISCO (byproduct da query quebrada): o tipo LicenseWithClientSafe em InventoryPage.tsx:43-58 declara campos que a query nunca busca (created_at, updated_at, license_key_masked, purchase_date, purchase_value, notes) e omite os que sao de fato selecionados (status, max_activations, current_activations) — tipo enganoso/inconsistente com a realidade, mascarando o bug em tempo de compilacao.
- RISCO: enquanto a query de Licencas estiver quebrada, as acoes de linha Editar/Excluir da aba Licencas e o deleteLicenseMutation (InventoryPage.tsx:194-207, 452-472) sao inatingiveis na pratica (a lista nunca popula). Nao e codigo morto por definicao (o LicenseForm continua acessivel pelo botao 'Nova Licenca', que grava direto em software_licenses e funciona), mas edit/delete de licenca estao mortos-em-uso ate a query ser corrigida.
- GAP menor no AssetForm: o assetSchema aceita asset_type 'software' e 'license' (L27), mas o <Select> de tipo (L209-217) so oferece computer/notebook/server/printer/switch/router/other. Assim os valores 'software' e 'license' nunca podem ser criados/editados pela UI (embora tenham label em InventoryPage.assetTypeLabels L81-82 e sejam validos no banco) — dois ramos de enum sem caminho de escrita na tela.
- RISCO de type-drift (nao confirmavel sem banco — anotado, nao consultado): AssetForm.tsx:67 le ip_address via cast '(asset as Record<string, unknown>)?.ip_address', sugerindo que 'ip_address' pode nao existir no tipo gerado de 'assets'; ainda assim o payload de insert/update inclui ip_address (L115). Se a coluna nao existir na tabela assets, o insert/update pode falhar silenciosamente por coluna desconhecida. Requer verificacao do schema de assets.

### knowledge
- UI decorativa morta não listada pelo auditor: breadcrumb em ArticleViewer.tsx:120 e :122 ('Base de Conhecimento' e o nome da categoria) tem cursor-pointer + hover:text-foreground (aparenta clicável) mas SEM onClick — não navega para nada. Mesmo padrão dos demais achados.
- Campo morto de select: a query relatedArticles seleciona 'slug' (ArticleViewer.tsx:53) que nunca é consumido, pois o card relacionado (L207) não navega. Subproduto direto do card sem handler — ajustar junto ao consertar/remover o card.

### reports
- Nenhum candidato a morto ADICIONAL alem dos 5 do auditor foi encontrado na amostragem dos arquivos do modulo (ClientManagementReport: apenas Button+Download mortos; demais imports lucide/recharts/useMemo em uso).
- Observacao de escopo (nao e morto novo): exportConfigs + formatters formam um bloco morto contiguo de ~70 linhas (export.ts:66-136), enquanto exportToCSV/exportToExcel/exportToJSON/downloadFile permanecem vivos via ExportButton. Remover so o trecho 66-136 e seguro.
- Ruido de knowledge-graph: as ocorrencias de exportConfigs/formatters/AnimatedStatCard em graphify-out/*.json|md|html sao artefatos do grafo (CONTAINS), nao consumidores de codigo — nao devem ser contadas como referencia viva.

### gamification
- RISCO (flag bypass) que o auditor perdeu: ReportsPage.tsx e TVDashboardPage.tsx expõem o ranking de técnicos sem gate de gamification_enabled, contrariando o guard de rota/sidebar/widget que escondem o módulo — comportamento inconsistente da feature flag.
- RLS policy 'System can award badges' (INSERT em technician_badges, migration ...164953:708) é órfã: nenhum código/edge/trigger a exerce — reforça o status morto da tabela technician_badges.
- Card de Metas é 100% decorativo mesmo com a flag ON: além do Progress hardcoded 0, nenhuma query calcula progresso e nada consome gamification_goals.target_value/period para premiar — placeholder sem valor funcional (não é 'morto' por ser renderizado, mas é fluxo inerte).
- Duplicação de fonte da verdade dos limiares de nível: levelConfig (GamificationPage.tsx:21-27) e getLevel (L78-84) repetem os mesmos cortes (0/501/1501/3501/7001) em dois lugares — risco de divergência ao ajustar faixas; candidato a consolidação.

### client-portal
- PortalTicket.client_id (portal-types.ts:11) e PortalTicket.requester_contact_id (:12): declarados na interface mas NUNCA lidos dos objetos ticket retornados (o filtro por cliente/contato é feito na query via clientData, não sobre o ticket). São campos de tipo ociosos — mesma categoria do ticket_categories que o auditor pegou, porém sem custo extra de query (vêm de graça no `*`). O auditor não os listou.
- ClientPortalPage.tsx:61 usa `.select("*, ticket_categories(name), requester:...")` — over-fetch: puxa TODAS as colunas de tickets para o portal (payload inclui colunas internas não tipadas em PortalTicket); RLS ainda protege, mas o payload é amplo. Trocar `*` pela lista de colunas realmente usadas (id, ticket_number, title, description, status, priority, created_at, resolved_at, satisfaction_rating) + o join requester elimina de uma vez o join ticket_categories morto e enxuga o payload. (Sugestão de limpeza — read-only, não apliquei.)
- Nenhum outro export morto encontrado no módulo: statusLabels/statusColors/priorityLabels (portal-types.ts) todos consumidos; isContactBlockValid consumido em ClientTicketForm.tsx:86; PortalTicket importado apenas nos 3 componentes esperados; NewTicketDialog só repassa props (sem refs a PortalTicket/ticket_categories/for_someone_else).

### settings
- CODIGO MORTO que o auditor perdeu — useFeatureFlag.ts:51-59: 'return Boolean(flag.enabled_for_roles?.length>0 || flag.enabled_for_user_ids?.length>0) ? true : true;'. O ternario retorna true nos DOIS ramos, entao toda a expressao Boolean(...) (o teste de length de roles/user_ids) e no-op — nunca altera o resultado. O bloco inteiro pct<=0 e equivalente a 'if (pct <= 0) return true;'. Dead branch + calculo inutil.
- Nota de superficie (nao-morto, mas relacionado): no useIntegrationSettings o retorno 'loaded' e usado por apenas 1 dos 6 consumidores (TacticalRmmConfigForm:16, para a migracao de sync_interval). Continua VIVO, mas e o unico retorno de baixissimo uso alem de load/setSettings — se um dia remover load/setSettings, vale reavaliar loaded junto.

### audit-security
- Nenhum export/símbolo morto adicional encontrado no módulo além dos 2 candidatos. Componentes de auditoria (AuditLogsList/Row/Detail/Diff), AnomaliesBanner, LogsViewerTab e detect-auth-anomalies estão todos com caller vivo.
- Regras validadas por amostragem (todas presentes no código): audit_logs append-only via RLS UPDATE/DELETE USING(false) (migration 20260425173521...:82-95) OK; trigger audit_user_roles_trigger em user_roles INSERT/UPDATE/DELETE, SECURITY DEFINER (mesma migration:50-77) OK; 'Até' inclusivo T23:59:59.999Z (useAuditLogs.ts:41) e setHours(23,59,59,999) (AuditLogsTab.tsx:68-70) OK; detect-auth-anomalies exige admin OU Bearer service-role/cron (index.ts:12-21) OK; 4 categorias órfão/zumbi/não-confirmado>7d/sem-papel (logic.ts:30-49) OK; anomalias>0 => notifica todos admins type=auth_anomaly (index.ts:42-57) OK; stale>25h via STALE_HOURS=25 (AnomaliesBanner.tsx:26,58) OK; total via rows[0].total_count (useAuditLogs.ts:52) OK.
- Observação menor (não é morto): em AuditLogsTab, getTableLabel mapeia 'assets' e 'invoices' mas o <Select> de Tabela só oferece integration_settings/tickets/clients/contracts — labels sem opção de filtro correspondente (inconsistência cosmética, ainda usados quando o registro vem dessas tabelas).

### db-schema
- REDUNDANCIA (fonte-unica, viola CLAUDE.md §6.0.2): a RPC calculate_penalties e a edge function calculate-invoice-penalties/index.ts implementam a MESMA regra fiscal (multa fixa % + juros pro-rata 1%/30d). A edge nao usa a RPC — reimplementa em TS. Consolidar em uma so fonte (edge chamar a RPC, ou remover a RPC orfa). Este e o motivo provavel de calculate_penalties ter virado orfa: foi substituida pela edge e nunca removida.
- RISCO LATENTE (nao e 'morto', mas quebra ao passar): o fallback de increment_article_views (ArticleViewer.tsx:71-75) faz UPDATE views = (article.views||0)+1 com valor lido no cliente — nao-atomico, perde incrementos concorrentes. Como a RPC atomica nunca existiu, ESTE e o caminho real de contagem de views hoje. Se for criar a RPC atomica, e onde corrigir a race.
- OBSERVACAO: DeleteClientButton.tsx:56/72 chama .rpc('delete_client_safely' as never) com cast 'as never' embora a funcao EXISTA em types.ts:6946 — cast desnecessario/obsoleto (limpeza do escoteiro), nao afeta o fluxo.

### infra
- Verificacoes de sustentacao (todas confirmadas no codigo): PageTransition (export principal) esta VIVO — importado e usado em AnimatedRoutes.tsx:5,120,137 (apenas os dois stubs Route* estao mortos); busca global AppLayout.tsx:91-95 usa /^#?\d+$/ -> /tickets?search= senao /clients?search= (regra confere); vite.config.ts:56,60,62 tem navigateFallback:null + NetworkFirst 'supabase-cache' (regra confere).
- Consequencia de manutencao ao remover mocks/http.ts: TESTING.md:24 e docs/MAPA_DE_SETORES.md:963,979 referenciam esses simbolos mortos (example.test.ts, RouteChangeLoader, mocks/http restoreFetch no-op) como pendencia de limpeza — a doc ja reconhece o codigo morto, entao remover exige atualizar esses 2 docs para nao ficarem stale.
- Nenhum codigo morto ADICIONAL relevante encontrado alem dos 5 candidatos dentro do escopo do modulo (infra/build/PWA/testes) na amostragem feita — os candidatos do auditor cobrem o que existe; sem falsos positivos e sem omissoes detectadas.

### ui-primitives
- DropdownMenuRadioItem (src/components/ui/dropdown-menu.tsx:114, export L169) — export MORTO que o auditor OMITIU. rg global: aparece so em dropdown-menu.tsx; 0 refs fora de ui/. Mesma familia vendored dos outros dropdown sub-exports listados (CheckboxItem/RadioGroup/Shortcut). Confirmado sem uso externo.
- loading-skeleton.tsx: 5 dos 6 exports estao mortos (Page/Table/Form/Dashboard/List); apenas CardSkeleton vive (KnowledgeArticleList.tsx:73, KnowledgeArticlePage.tsx:56-57). Como e arquivo CUSTOM (nao bloco vendored shadcn), o arquivo poderia ser reduzido a CardSkeleton — prioridade de limpeza MAIOR que os sub-exports shadcn.
- Distincao de prioridade que o auditor nao separou: os 5 skeletons custom sao dead code real e removivel; os ~10 sub-exports shadcn (table/dropdown/pagination/sidebar) sao blocos VENDORED — tecnicamente 0 refs externas, mas a convencao do projeto (CLAUDE.md, vendored) e mante-los intactos. So os primeiros justificam remocao imediata.

### shared-lib
- Superficie morta COERENTE em src/lib/logger.ts: paymentOperation, nfseOperation, integrationOperation, invoiceValidationLog, invoiceProcessingLog, getLogs, clearLogs e o export devLog formam ~130 linhas mortas contiguas/relacionadas — toda a familia 'xxxOperation'/log de invoice esta orfa EXCETO billingOperation. Podem ser removidos em bloco com seguranca (nenhum caller em src/ ou supabase/).
- Contra-checagem adversarial dos IRMAOS dos candidatos (para pegar falso-morto que o auditor pudesse ter incluido ou eu descartado): TODOS vivos — logger.debug/info/warn/error, authInit/authLogin/authLogout/authError (useAuth.tsx), generateExecutionId (BillingInvoicesTab:266), billingOperation (BillingInvoicesTab, persistToDb=true), componentError (ErrorBoundary.tsx:28); e em storage-utils getSignedUrl (NfseShareMenu:101), openStorageFile (NfseDetailsSheet/BillingNfseTab), downloadStorageFileSafe (BillingInvoicesTab). Conclusao: o auditor NAO super-sinalizou; a fronteira morto/vivo esta correta.
- Nenhum caller oculto encontrado para os 9 mortos confirmados: sem import dinamico/lazy, sem uso via string, sem referencia em *.test.*, supabase/config.toml, crons ou JSX. As unicas 'outras' ocorrencias sao rotulos de no em graphify-out/graph.json e graph.html (artefatos gerados, nao codigo executavel).

### shared-edge
- Nenhum codigo morto adicional encontrado nos modulos compartilhados. Auditei TODOS os exports de _shared via grep global fora de _shared: auth-helpers (corsHeaders, jsonResponse, adminClient, requireRole, rateLimit, logAudit) todos importados externamente; email-helpers (getEmailSettings, wrapInEmailLayout, replaceVariables, formatCurrencyBRL, formatDateBR, escapeHtml, applyNotificationMessage, applyNotificationMessageText, buildPaymentSectionHtml, getEmailTemplate, EmailTemplate) todos com importadores externos vivos (generate-monthly-invoices, notify-due-invoices, batch-collection-notification, resend-payment-notification, send-nfse-notification, send-ticket-notification, invite-user, resend-invite, resend-confirmation); notification-logger (logInvoiceNotification, InvoiceNotificationLog) importado pelas edges de fatura.
- Os 3 candidatos do auditor sao os UNICOS exports de auth-helpers sem importador externo — o auditor foi preciso no levantamento, apenas errou o rotulo: sao 'export desnecessario' (nivel lint), nao 'codigo morto'. Custo-beneficio de remover o export e negativo (risco de futuro consumidor + zero ganho de bundle por tree-shaking). Recomendacao: NAO remediar.
- Regras de seguranca do MCP conferidas e corretas: list_open_tickets exclui closed/resolved/cancelled (mcp/index.ts:30), search_clients sanitiza %/_ contra ilike-injection (L97), e todo handler retorna 'Not authenticated' quando !ctx.isAuthenticated() (L27/58/94/127). Todos os tools rodam user-scoped (RLS) via Bearer — confirmado.

### docs-config
- DRIFT DE DOC (nao apontado com precisao): useSecureAction e citado como hook EXISTENTE em 3 arquivos — SECURITY.md:20, docs/MAPA_DE_SETORES.md:116 e SYSTEM_DOCUMENTATION.md:876 (auditor listou so 2). Todos falsos; o hook nao existe em src/.
- IMPLEMENTATION_GUIDE.md §3.1 InvoiceActionIndicators.tsx e §3.2 BillingBatchProcessing.tsx tambem sao componentes inexistentes (Glob 0), alem dos simbolos S3 — a poda do doc deve incluir essas duas secoes de UI.
- Risco de manutencao: .lovable/plan.md e um scratch one-off versionado no git (task concluida). Como .lovable/ tambem hospeda mcp/ (config Lovable), a limpeza deve mirar so plan.md, sem tocar em .lovable/mcp/.
- README boilerplate cria risco de instrucao errada para novos devs (manda 'npm i'/'npm run dev' num projeto bun/Vite) — defeito de conteudo, prioridade de correcao maior que a de 'remocao'.

### Correções do revisor a fluxos/regras afirmados

**auth:**
- Amostragem confirmou os fluxos: Login username -> Login.tsx:60 invoke('login-with-username') OK; forgot-password -> ForgotPassword.tsx:25 OK; bootstrap-admin -> Setup.tsx:84 OK; reset admin -> ResetPasswordDialog.tsx:64 OK; convite -> InviteStaffDialog:39/InviteClientDialog:57/ClientUsersList:101 OK; create-user -> CreateUserDialog:26 OK; delete-user -> UserActionsMenu:32 e ClientUsersList:157 OK. Nenhuma correcao necessaria nesses fluxos.
- Amostragem confirmou as regras: rate limit de login 10/min por IP (login-with-username/index.ts:10-11 RATE_LIMIT_MAX=10, janela 60s) OK; erros genericos 'invalid_credentials' anti-enumeracao (index.ts:47,56,70,82,90,99), com excecao 'email_not_confirmed' 403 (index.ts:89) OK; resolucao client_contacts.username(lower)->email com fallback profiles, ignorando emails .internal (index.ts:64-82) OK; e-mail nunca retorna ao cliente, so tokens (index.ts:94-97) OK; must_change_password redireciona /reset-password?forced=1 (ProtectedRoute.tsx:36-38) OK. Regras do auditor estao corretas.
- Ressalva (bug de doc, nao do auditor): ADMIN_TOOLS.md:44 lista 'confirmacao manual de e-mail; atualizacao de e-mail' como funcionalidades da pagina /settings/users, porem nenhum componente da UI invoca confirm-user-email/update-user-email. A doc esta a frente da implementacao (features nunca cabladas na UI).

**tickets:**
- Candidato #3 mal classificado como 'morto': o deep-link /tickets?open=<id> e VIVO (3 produtores: RecentTicketsList.tsx:115, NotificationDropdown.tsx:24, send-ticket-notification:248) porem QUEBRADO — TicketsPage.tsx:180-189 so consome action=new e ignora o param 'open'. O defeito e um handler ausente no consumidor, com escopo maior que 'push' (atinge tambem clique no Dashboard e no sino de notificacoes), nao codigo morto.
- Candidato #2 impreciso: o COMPONENTE TicketRatingDialog nao e morto — e aberto de fato no portal do cliente (ClientPortalPage.tsx:199). Morto so a instancia em TicketsPage e o estado isRatingOpen. Enunciar 'componente morto' seria incorreto.
- Fluxo 'Iniciar atendimento' CONFIRMADO integralmente em TicketsPage.tsx:290-350: fecha sessoes orfas (:296-300) -> INSERT ticket_attendance_sessions (:303-305) -> UPDATE tickets(status=in_progress, assigned_to, started_at, first_response_at, asset_id, asset_description) (:309-319) -> INSERT ticket_history (:324-327); AssetSelectionDialog usa rpc get_ticket_form_data (AssetSelectionDialog.tsx:86; RPC existe em types.ts:7021, tambem usada em TicketDetailsTab.tsx:146). Sem correcao.
- Regra 'avaliacao >=4 concede pontos (5=15, 4=10) e status closed' CONFIRMADA em TicketRatingDialog.tsx:46-89 (status:'closed' :51; pointsToAward = rating===5?15:10 :81). Regra 'notify-sla-breach cooldown 60/janela 30' CONFIRMADA em notify-sla-breach/index.ts:16 (WARNING_MINUTES=30) e :19 (NOTIFICATION_COOLDOWN_MINUTES=60). Sem correcao.

**clients-doc:**
- check-doc-expiries deve ser RECLASSIFICADO de 'candidato a morto' para VIVO (cron agendado): docs/MAPA_DE_SETORES.md:97 registra o job pg_cron 'check-doc-expiries-daily' (0 9 * * *), snapshot verificado 2026-06-29. O padrao de invocacao e Cron -> HTTP -> check-doc-expiries (Deno.serve, index.ts:76), sem invoke de frontend, exatamente como o fluxo afirmado descreve.
- Inconsistencia interna da doc (nao e codigo morto): MAPA_DE_SETORES.md:235 diz 'cron nao encontrado nas migrations' e :245-246 mantem checklist aberto ('Verificar agendamento e auth do cron'), contradizendo o snapshot vivo em :97. A verdade e a :97 (banco = fonte da verdade). Os itens :235/:245 estao stale.
- Fluxos e regras amostrados batem com o codigo: fiscalChanged->asaas-nfse sync_customer->regenerate_payment (ClientForm.tsx:331,372-373,392-394) e o erro uq_clients_normalized_document + window.confirm de duplicata (ClientForm.tsx:450,464,487); gate isAdmin + RPC detect_duplicate_clients (DuplicatesBanner.tsx:36,42,44,51); UNIQUE sede/nome por cliente e nao-excluir-sede (ClientBranchesList.tsx:199,208,240) + ViaCEP (:124); severidade critical(<0/<=7d)/warning(<=30d)/info (check-doc-expiries/index.ts:63-68). Nenhuma correcao necessaria nesses.
- Regra afirmada 'estrategia hibrida B+A espelhada em client-merge.ts:36-64 (resolveMergedFields)' e verdadeira como espelho, mas ATENCAO: essa lib NAO e a fonte de verdade em runtime - o override>destino>source real roda no SQL merge_clients (COALESCE). client-merge.ts so alimenta o previewMerge da UI; resolveMergedFields nem isso.

**contracts:**
- Regra 'FIXO auto-aplica no D-0 via apply-contract-adjustment' esta INCOMPLETA: o gate exige tambem adjustment_percentage truthy (check-contract-adjustments/index.ts:107 -> `bucket==='d-0' && adjustment_index==='FIXO' && contract.adjustment_percentage`). FIXO com percentual null/0 NAO auto-aplica; cai no lembrete D-0 (warning).
- Regra 'adjustment_percentage so persiste para FIXO (null caso contrario)' vale para os writes do FRONTEND (ContractAdjustmentDialog.tsx:100 e ContractAdjustmentConfigSheet.tsx:51). Mas o EDGE apply-contract-adjustment NAO grava adjustment_percentage em caso algum (index.ts:84-91 atualiza so monthly_value, adjustment_date, adjustment_index) — nao zera nem seta; o valor antigo permanece. A regra nao se aplica ao caminho do cron/edge.
- Regra dos buckets 'overdue D+1..D-30' esta com sinal trocado: o codigo e `diffDays<0 && diffDays>=-30` (check-contract-adjustments/index.ts:86), ou seja D+1..D+30 (ate 30 dias APOS o vencimento). Alem disso o bucket overdue dispara TODO dia nessa janela (idempotencia e por dia+bucket; como diffDays muda a cada dia, ha ate 30 notificacoes 'Reajuste vencido' consecutivas).
- Flow 'Renegociacao ... NAO cria contract_adjustments nem mexe em adjustment_date' — confirmado, e complemento: tambem NAO reajusta contract_services (ContractRenegotiationDialog.tsx:47-58 so faz UPDATE contracts.monthly_value + INSERT contract_history action='renegotiation').
- Regra 'Proxima data = vigencia(ou hoje)+1 ano' — confirmada no frontend (ContractAdjustmentDialog.tsx:65,98 usa effectiveDate+1 ano). Confirmo tambem a ressalva do auditor: no edge usa new Date() (agora)+1 ano (apply-contract-adjustment/index.ts:81-82), ignorando qualquer vigencia enviada.
- Nit de doc (sem impacto): o comentario de useContractAdjustmentHistory.ts:17 diz "action in ['adjustment','renegotiation']", mas a query filtra apenas ['renegotiation'] (linha 36) — os adjustments vem da tabela contract_adjustments, entao o comentario esta desatualizado, nao ha bug.

**billing:**
- IntegrationStatusPanel.tsx:260-264 esta DESATUALIZADO: o card 'Geracao de Faturas' aponta fn:'generate-invoice-payments' com badge 'Automatico (CRON)', mas o cron real de geracao mensal e generate-invoices-daily -> generate-monthly-invoices (confirmado: invoke('generate-monthly-invoices') em BillingInvoicesTab.tsx:272 e ContractsPage.tsx:177). UI engana o operador e mantem falsa a impressao de que a fn orfa esta ativa.
- Fluxos amostrados CONFIRMADOS no codigo: markAsPaid->invoke('manual-payment') (useInvoiceActions.ts:51); batch 'Faturar Agora'->invoke('batch-process-invoices') (useBatchProcessing.ts:29); 'Gerar Faturas Mensais'->invoke('generate-monthly-invoices') (BillingInvoicesTab.tsx:272); ManualPaymentDialog->manual-payment (ManualPaymentDialog.tsx:79).
- Regras amostradas CONFIRMADAS: dedup contrato+reference_month excluindo so 'cancelled' + fail-closed (generate-monthly-invoices/index.ts:314-324); multa 2% + juros 1% a.m. pro-rata dias/30 (calculate-invoice-penalties/index.ts:70-73); renegociacao so status='overdue' (renegotiate-invoice/index.ts:83), 2-12 parcelas (linha 60), numero via MAX+1 com race admitida em ponytail comment (linhas 106-115); auto-retry filtra boleto_status='erro' + asaas_payment_id IS NULL + created_at>30min + attempts<3 (auto-retry-failed-boletos/index.ts:71-74). Sem correcoes nessas regras.

**nfse:**
- Fluxo 'Dashboard de certificados': a afirmacao 'le company_settings.certificado_* (fonte legada, nao escrita)' e imprecisa. certificado_tipo e certificado_validade SAO escritos por CompanyTab.tsx:170-173 (sempre com defaults A1/null, pois nao ha input de UI); apenas certificado_arquivo_url e certificado_uploaded_at nunca sao escritos por codigo vivo (so migration 20260308225517). O efeito liquido (sempre 'Nao Configurado') se mantem porque nenhuma validade real e capturada.
- Fluxo 'Reemissao assincrona' validado e correto, MAS reforca uma armadilha de metodo: reissue_nfse NAO aparece entre as actions invocadas pelo frontend (grep src) — seria falso-positivo de morto se auditado so pelo frontend. Esta VIVO via edge-to-edge: webhook-asaas-nfse/index.ts:454 invoke('asaas-nfse',{action:'reissue_nfse'}). Todo veredicto de morto em actions precisa cobrir chamadas edge-to-edge (o que fiz: greps foram whole-repo).

**monitoring:**
- Nenhuma regra/fluxo do auditor está errado — todos confirmados no código nas linhas citadas. CheckMK: isHostOnline (index.ts:51-54, state==0/'0'=UP), mapServiceStateToLevel:57 (2=critical,1=warning,3=info,default info), detectDeviceType:29 (label cmk/device_type > convenção hostname), alert_levels crit/warn ON-por-default e unknown só se ===true:299-302, dedup por device_id+status+title:400-406 e 431-437, cria device só com mapping (senão unmapped):454/463-464. Tactical: offline level = overdue_dashboard_alert?critical:warning:386, resolve TODOS alertas ativos do device sem filtro de título:393-400, métricas = média das últimas 10 leituras (slice(-10)):300-330, dedup só device_id+status:372-377 (de fato inconsistente com CheckMK, como o auditor apontou). UniFi: mapAlarmSeverity via sets CRITICAL/WARNING_ALARMS:29-45, dedup device_id+status+service_name:678-684, gate de intervalo now-last_sync_at>=sync_interval_hours só no modo sync-all (sem controllerId):1057-1062. send-alert-notification: filtro type==INSERT && status==active:233, destinatários por notify_on_<level> com fallback a todo staff admin/manager/technician:266-279, e-mail só quando level!=='info':354. Relay: is_staff(auth.uid()):117/200, MAC obrigatório:121-123, post_alert dedup device_id+status+service_name:208-217.
- Precisão do fluxo de e-mail: o item 'send-email-resend (só critical/warning)' está correto — send-alert-notification chama supabase.functions.invoke('send-email-resend') na linha 398 (não monta/manda Resend inline), dentro do guard level!=='info' (354).
- Completude do fluxo do trigger: a trigger AFTER INSERT trigger_notify_on_alert/notify_on_monitoring_alert (migration 20260119181153) dispara em TODO insert de monitoring_alerts (qualquer status/level) e faz net.http_post fixando 'type':'INSERT'; a filtragem status=active é feita no edge (send-alert-notification:233), não no trigger. Fluxo do auditor está correto, mas convém explicitar que a trigger é incondicional.

**notifications:**
- TODOS os fluxos e regras amostrados foram confirmados no codigo (sem erros): EMAIL supressao/skipped/rate-limit/sanitizacao (send-email-resend/index.ts 43-53,56-70,96-102,177-209); Resend webhook fail-closed+Svix HMAC+idempotencia+STATUS_RANK+suppressed upsert (webhook-resend-status/index.ts 47-51,67-85,107-113,152-167,179-225,228-234); Push role_filter+defaults por tipo+remocao so em 404/410 (send-push-notification/index.ts 381-394,424-449,480-494); WhatsApp 10-15 digitos+truncate 4096+retry 3x [0,3000,10000] so 5xx/rede+message_logs so se userId (send-whatsapp/index.ts 129-138,153-215,228-241); Telegram fallback default_chat_id+parse_mode Markdown+sem message_logs (send-telegram/index.ts 63,65,79-89).
- INCOMPLETUDE MENOR na regra de sanitizacao de e-mail: alem de script/on*/javascript:/iframe/embed, o sanitizeHtml tambem remove 'data:text/html' (send-email-resend/index.ts:49). O auditor omitiu esse item. Nao e erro, so lista incompleta.
- OBSERVACAO no fluxo Telegram descrito pelo MAPA: docs 993/1126/1146 dizem 'send-notification/send-alert-notification gravam message_logs' - send-notification nao existe, logo somente send-alert-notification e valido.

**calendar:**
- CORREÇÃO ao candidato 'google_event_id/google_calendar_id/sync_enabled/last_sync_at': o auditor tratou as 4 como 'só tocadas por sync_event/callback' e apontou index.ts:197,259. Impreciso: (a) as colunas vivem em DUAS tabelas — google_event_id/google_calendar_id em calendar_events (tocadas por sync_event/delete_event); sync_enabled/last_sync_at em google_calendar_integrations. (b) last_sync_at NÃO é tocada por nenhum código, nem pela edge (a edge escreve token_expires_at, não last_sync_at). (c) sync_enabled é escrita SÓ pelo callback (index.ts:137). Conclusão (morto) permanece, mas os writers não são os mesmos para as 4.
- PRECISÃO no enum billing_reminder: correto que não há writer, mas convém distinguir 'morto como produtor' de 'valor de enum ainda existente no Postgres'. O valor não some do banco só apagando os mapas de exibição; remoção real exige migração de enum. Marquei confirmadoMorto=true no sentido de código (sem origem de dados).
- FLUXO '/settings?code=&state -> SEM handler' — CONFIRMADO por grep (0 handlers de ?code/callback). Ressalva adicional: como o callback nunca roda, a tabela google_calendar_integrations nunca recebe linhas via OAuth, então a UI 'Conectado/Desconectar' (checkUserConnection, GoogleCalendarConfigForm.tsx:41-45) na prática nunca mostra 'Conectado' — é um caminho de dados morto, não só a action.
- FLUXO drag/drop/resize sem gate — CONFIRMADO: FullCalendarWrapper.tsx:165 editable={true} hardcoded; updateEventMutation atualiza start_time/end_time direto (CalendarPage.tsx:83-115). canEdit não participa.
- REGRA start_time/end_time — CONFIRMADA e agravada: EventForm.tsx:93-94 monta AMBOS a partir de data.start_date ('${data.start_date}T${data.start_time}' e '...T${data.end_time}'), logo é impossível cruzar meia-noite e não há validação de fim<início (evento com end_time<start_time é aceito).

**inventory:**
- SEM CANDIDATOS A MORTO: a lista de candidatos do auditor veio vazia ([]), portanto nao ha veredicto de codigo morto a emitir. Concentrei a revisao em refutar/validar os fluxos e regras afirmados.
- CONFIRMA a anotacao 'QUERY QUEBRADA' do fluxo de Licencas: InventoryPage.tsx:137-141 faz .from('software_licenses_safe').select('id, name, vendor, license_key, expire_date, max_activations, current_activations, client_id, status'). A view NAO possui essas colunas — pelos tipos gerados (types.ts L6826-6841) e pela migration 20260204131545 (L11-29) a view expoe apenas: client_id, created_at, expire_date, id, license_key_masked, name, notes, purchase_date, purchase_value, total_licenses, updated_at, used_licenses, vendor. Logo 'license_key', 'max_activations', 'current_activations' e 'status' NAO existem -> PostgREST retorna 400, o useQuery lanca erro e a aba Licencas fica SEMPRE vazia ('Nenhuma licenca encontrada'). Alem disso, mesmo que a query passasse, a tabela renderiza license.used_licenses/total_licenses (InventoryPage.tsx:438-439) que nem sao selecionados. Bug VIVO de correcao, nao morto.
- CORRECAO na regra 'Deep-link de ticket (offline/alerta) ... usa priority=high — InventoryOverview.tsx:336-343': priority='high' so e setado no caminho de DISPOSITIVO OFFLINE (InventoryOverview.tsx:341). O deep-link de ALERTA (InventoryOverview.tsx:417-435) NAO seta priority — monta params apenas com action=new, title, description e (condicional) client_id. Portanto a parte '(alerta)' da regra esta incorreta: tickets a partir de alerta sao criados sem priority=high.
- PRECISAO no fluxo de Ativos: o DocDeviceLinkDialog nao pertence a InventoryPage — e importado e renderizado dentro de AssetForm.tsx (import L19, JSX L397-406). Dispara SOMENTE na criacao de ativo novo (nao na edicao): apos o insert, AssetForm re-consulta assets por client_id+name (mais recente, limit 1) para obter o id novo (L139-160) e adia o onSuccess ate o dialog fechar (return na L161). Cadeia '-> DocDeviceLinkDialog -> doc_devices' esta correta, so a atribuicao a InventoryPage e imprecisa.
- VALIDADAS e corretas as demais regras amostradas: get_license_key e SECURITY DEFINER + admin-only (RAISE EXCEPTION migration 20260129235822 L137/L145) e grava audit_logs LICENSE_KEY_ACCESS (L154); view software_licenses_safe com security_invoker=on mascara como '****'||RIGHT(license_key,4) AS license_key_masked (migration 20260204131545 L11-29); LicenseForm nunca pre-preenche a chave (license_key:'' L104) e so envia no update se keyChanged && data.license_key (L183-189); rascunho exclui license_key (excludeFields L119); validacoes used<=total (L45-50) e expire>=purchase (L51-62) existem; contadores/lista de 'a vencer' usam expire_date entre agora e +30d (InventoryOverview L99-100 e L162-168); Reconhecer faz update monitoring_alerts.status='acknowledged' (L180-184); MonitoringPage invoca checkmk-sync/tactical-rmm-sync/unifi-sync (L205/209/220).

**knowledge:**
- Regra 'KBSuggestions só é renderizado em chamado external no TicketForm — TicketForm.tsx:402' está INCOMPLETA. Em TicketForm.tsx:402-404 sim (ticketType==='external' && title.length>=5). MAS há um 2º caller: ClientTicketForm.tsx:177 renderiza KBSuggestions apenas com title.length>=5, SEM condição 'external' (portal do cliente). O gate 'external' vale só dentro do TicketForm.
- Refinamento do flow de views: o fallback 'update knowledge_articles' é não-atômico E usa valor stale do cliente (views=(article.views||0)+1, ArticleViewer.tsx:73), sujeito a race entre abas/usuários; L159 exibe o valor otimista (article.views+1), não o do banco. Como a RPC atômica não existe, esse fallback race-prone é o ÚNICO caminho efetivo hoje.
- Confirmações OK por amostragem: debounce 300ms (KnowledgePage.tsx:48), busca or(title.ilike,content.ilike) (L59), ordenação client-side popular=views/helpful=helpful_count/alphabetical=localeCompare pt-BR/recent=updated_at (L76-90); ArticleFeedback exige login (L43-45) e faz update-se-existe/insert por UNIQUE (article_id,user_id) (L54-67); KBSuggestions >=10 chars, palavras>3 (máx 6), só is_public, order views desc, limit 4, debounce 800ms (KBSuggestions.tsx:15-49) — todos batem.

**reports:**
- Regra 'Usuario client puro redirecionado para /portal (Dashboard.tsx:40-44)': CONFIRMADA, mas incompleta. O gate real (L37-44) e isClientUser = roles inclui 'client' OU 'client_master', e redireciona so quando NAO ha papel de staff (isStaffUser = admin/manager/technician/financial). O auditor citou apenas 'client'; ha tambem 'client_master' e a exclusao explicita de staff.
- Regra 'Candidatos a contrato = 3+ notas avulsas (AdditionalChargesReportTab.tsx:91-93)': CONFIRMADA; o texto real esta na L92 ('Clientes com 3+ notas avulsas no periodo - considere migrar para contrato recorrente'). Faixa 91-93 do auditor cobre corretamente.
- Fluxo /reports RPCs: CONFIRMADO — get_ticket_report_stats/get_invoice_report_stats/get_technician_ranking referenciados em ReportsPage.tsx e definidos em migrations (20260123..., 20260213..., 20260220...). get_additional_charges_report e get_client_management_report tambem presentes. Sem correcao.
- Regra ExportButton desabilita com data.length===0: CONFIRMADA literalmente em ExportButton.tsx:27 (disabled={disabled || data.length === 0}).
- Regra Export CSV BOM: CONFIRMADA — downloadFile em export.ts:51 prefixa '﻿' ao Blob; escape de aspas em export.ts:16-18. Sem correcao.

**gamification:**
- REGRA 'Visibilidade do módulo 100% via feature flag gamification_enabled' está ERRADA/INCOMPLETA: o ranking (get_technician_ranking, saída central da gamificação) também é renderizado em ReportsPage.tsx (BarChart 'Ranking de Técnicos', RPC L116, render L412-416) e em TVDashboardPage.tsx (slide 'ranking', RPC L97, render L375-391) SEM checagem de useFeatureFlag('gamification_enabled') (grep 'gamification'/'useFeatureFlag' nesses dois arquivos = 0 hits). Com a flag OFF o ranking ainda aparece em Relatórios e no TV Dashboard.
- Mapa de FLUXOS incompleto: lista só 2 consumidores do RPC (GamificationPage all-time top10 + Dashboard mini top5). Existem 4 consumidores: falta ReportsPage.tsx (top 10, período do relatório) e TVDashboardPage.tsx (top 8, hoje).
- Confirmado o RPC get_technician_ranking (migration 20260123141354:92-120): SECURITY DEFINER, GROUP BY p.full_name (colisão de homônimos), ORDER points DESC, WHERE created_at>=start_date, SEM guarda de role — todas as regras afirmadas conferem.
- Confirmadas as regras de pontuação em TicketRatingDialog.tsx: rating>=4 pontua (L73), 5★=15/4★=10 (L81), insert em technician_points{user_id=ticket.assigned_to} (L82-87) com await solto sem checagem de erro (L82).
- badgeIcons: descrição do auditor (interseção zero) está correta; ajuste de rótulo — é bug de dados (icon vs slug de nome), não apenas 'mapa morto', pois a referência em L191 existe e sempre resolve para o fallback.

**client-portal:**
- Fluxo 1 (query client-user) — refinamento não citado pelo auditor: `contactIsWhatsapp` é derivado em ClientPortalPage.tsx:48 como `!!(contact.notify_whatsapp || contact.whatsapp)`, mas `contact.whatsapp` também é usado como FALLBACK DE TELEFONE na linha 47 (`contact.phone ?? contact.whatsapp`). Dupla semântica: se a coluna `whatsapp` guarda um número, `!!contact.whatsapp` é sempre truthy → o toggle 'tem WhatsApp?' default vem sempre marcado quando há número. Possível quirk de UX (não confirmado no banco — DÚVIDA ANOTADA, não consultei o schema).
- Regra 'Telefone obrigatório (isContactBlockValid) — gate no submit' (ContactBlock.tsx:127-128, ClientTicketForm.tsx:86): correto, mas é gate DENTRO do mutationFn (ClientTicketForm.tsx:86-88 lança Error antes da RPC), não um bloqueio pré-submit; o botão Submit NÃO fica disabled com telefone inválido — Zod (título/descrição/prioridade) passa, o form submete e o erro de telefone só aparece via toast. Comportamento ok, apenas a descrição 'gate no submit' subestima que o Zod não cobre o telefone.
- Demais fluxos/regras conferidos e corretos: rota /portal → ProtectedRoute allowedRoles=['client','client_master'] (AnimatedRoutes.tsx:149); viewMode filtra requester_contact_id p/ não-master ou 'my' (ClientPortalPage.tsx:64); openCount/closedCount (:113-114); aba 'Aguardando Avaliação' = resolved sem satisfaction_rating (ClientTicketsList.tsx:31); comentário só se !resolved/!closed (ClientTicketDetailPanel.tsx:107); portal lê/insere só is_internal=false (:30,:46-51); Zod 5-255/20-10000/enum (ClientTicketForm.tsx:32-34).

**settings:**
- Regra 'Ordem de avaliacao de flag' (useFeatureFlag.ts:36-63) esta INCOMPLETA/enganosa. Entre 'rollout>=100->true' e o bucket existe a ramificacao pct<=0 (linhas 51-59): uma flag habilitada com rollout_percentage null ou 0 retorna TRUE para TODOS os usuarios — nao cai no bucket nem retorna false. O 'senao bucket FNV-1a(userId:key)%100 < rollout' so vale para 0 < pct < 100. Alem disso ha guarda 'if (!userId) return false' (:61) antes do bucket (usuario anonimo/sem sessao -> false), omitida no resumo do auditor.
- Flow do Unifi confirmado como QUEBRADO exatamente como descrito: IntegrationsTab.tsx:99 renderiza <UnifiConfigForm/> sem clientId (import :15). Sem correcao a fazer no enunciado do fluxo — apenas confirmado.

**audit-security:**
- Fluxo 'logger.ts (persistToDb) -> insert application_logs': verdadeiro mas incompleto/enganoso. O logger GENÉRICO (logger.log/persistLog, linhas 48-58) grava SOMENTE em sessionStorage (máx 100, MAX_LOGS=100 linha 38, slice(-100) linha 53). O insert em application_logs só ocorre nos métodos especializados quando chamados com `persistToDb=true` (default=false, linhas 144/181/212/246/274) e no invoiceProcessingLog (308) via método privado que insere em application_logs (351). Ou seja, a MAIORIA do log de frontend nunca chega ao banco — só edge functions e chamadas explícitas com persistToDb.
- Fluxo 'Settings aba Auditoria -> AuditLogsTab [caminho paralelo/redundante]': confirmado e VIVO (não é morto). AuditLogsTab é montado em SettingsPage.tsx:27 (lazy) + :166 (aba 'audit'). Ele roda supabase.from('audit_logs').select(...).limit(100) sem RPC, sem paginação e sem nome de usuário — coexistindo com /settings/audit-logs (AuditLogsPage->AuditLogsList->useAuditLogs->rpc list_audit_logs_with_user, paginado e com user_name via join). Redundância real de duas telas para a mesma leitura (viola §6.0.2 fonte única) — candidato a consolidação, mas NÃO é código morto.

**db-schema:**
- INCOMPLETO (nao errado): o fluxo 'get_technician_ranking' foi creditado so a /reports/ReportsPage.tsx, mas a RPC tem 4 callers vivos: ReportsPage.tsx:116, TVDashboardPage.tsx:97, TechnicianMiniRanking.tsx:23 e GamificationPage.tsx:41. A RPC esta MUITO viva; a lista subestima o alcance.
- VALIDADAS/CORRETAS (amostragem): open_client_portal_ticket -> ClientTicketForm.tsx:89 OK; get_ticket_report_stats/get_invoice_report_stats -> ReportsPage.tsx:90/103 OK; delete_client_safely -> DeleteClientButton.tsx:56/72 OK; create_staff_ticket -> TicketForm.tsx:219 OK; auto_reconcile_bank_entries -> BankReconciliationTab.tsx:94 OK; increment_article_views -> ArticleViewer.tsx:66 com fallback UPDATE knowledge_articles.views OK.
- REGRAS confirmadas literalmente em types.ts: invoice_status = pending|paid|overdue|cancelled|lost|renegotiated (types.ts:7201-7207), SEM 'voided' — bate com o fix de dedup/gate de frequencia; app_role = admin|manager|technician|financial|client|client_master (types.ts:7159-7165). Ambas corretas.

**infra:**
- REGRA lazyWithRetry (AnimatedRoutes.tsx:15-28): o backoff NAO e exponencial — e LINEAR. Codigo: attempts++ e setTimeout(..., 1000 * attempts), gerando 1s apos a 1a falha e 2s apos a 2a (max 3 tentativas antes de throw). A afirmacao 'atraso exponencial (1s*tentativa)' esta correta no fator (1s*tentativa) mas o rotulo 'exponencial' e impreciso; e backoff linear/incremental.
- REGRA chunk-failure (App.tsx:46-49): confirmada (unhandledrejection casando 'Failed to fetch dynamically imported module'/'Loading chunk' -> toast + window.location.reload() apos 2000ms). Pequeno detalhe: o toast tem duration 3000ms (nao mencionado na regra); o reload e apos 2s como afirmado.

**ui-primitives:**
- Fluxo currency-input: CONFIRMADO na essencia, mas o rotulo 'InvoiceForm' esta impreciso — NAO existe componente chamado InvoiceForm no repo. Os consumidores reais de ui/currency-input.tsx (via graphify) sao: ContractForm, ServiceForm, NfseAvulsaDialog, NfseEditForm, EditInvoiceDialog, ContractRenegotiationDialog, ContractAdditionalChargeDialog, ContractServicesSection, NfseTributacaoSection. Todos passam por maskCurrencyBRL/parseCurrencyBRL (currency-input.tsx L21-23).
- Regra do chunk-fail (App.tsx): CONFIRMADO que usa Sonner e nao Radix, mas precisao — o toast vem de `toast` importado da lib crua 'sonner' (App.tsx:11), nao do wrapper ui/sonner. O bloco de chunk e L46-50 (nao L46-49): toast.error com duration 3000ms + setTimeout(reload, 2000) = reload em 2s. Ha ainda um toast.error generico em L52 para outros erros. Auditor descreveu 'reload apos 2s' corretamente.

**shared-lib:**
- Todos os 9 fluxos e 10 regras amostrados CONFEREM no codigo (sem correcao de conteudo). Verificados diretamente: (a) date.ts:60-62 T12:00:00 e isPastDate:114-120 setHours(0,0,0,0)+date<today OK; (b) utils.ts:30-43 formatPhone remove DDI 55 em 12-13 digitos, fixo=10 mobile=11 OK; (c) storage-utils.ts:8-31 resolucao de bucket por prefixo + http(s) direto + default nfse-files OK; (d) edgeFunctionError.ts:14-19 dois modos (error de rede em 14; data.success===false em 17) OK; (e) useFormPersistence.ts:41-48/68 hasValidData + excludeFields no restore(38) e save(68), chave form_draft_<key> em 22 OK; (f) logger.ts:425-451 retryWithBackoff 2^attempt*baseDelay, relanca no ultimo attempt OK; (g) mcp/index.ts:10,18-21 issuer de VITE_SUPABASE_PROJECT_ID (comentario explica SUPABASE_URL=proxy Lovable) OK; (h) mcp/tools/get-ticket.ts:19-24 readOnly/idempotent + isAuthenticated + token do usuario (Authorization Bearer ctx.getToken()) OK; (i) search-clients.ts:25 sanitiza wildcards query.replace(/[%_]/g,'') antes do ilike OK.
- Correcao ao candidato #10 (downloadStorageFile): o auditor o lista como candidato a morto ('export desnecessario'), mas o simbolo esta VIVO (chamado em storage-utils.ts:115). Nao e codigo morto; no maximo remocao do `export`. Reclassificar de 'morto' para 'export redundante (cosmetico)'.
- Enriquecimento (nao erro) do fluxo useFormPersistence: a lista '(TicketForm/ClientForm/InvoiceForm/...)' esta correta e o '...' cobre o resto — na pratica sao 10 consumidores: +EventForm, ArticleForm, LicenseForm, AssetForm, ServiceForm, ClientTicketForm, CompanyTab.
- Enriquecimento do fluxo useDebounce: alem das 5 paginas citadas, tambem em UsersList, AuditLogsList, ClientForm, TicketLinksSection, TicketCommentsTab, ReconciliationMatchDialog, KBSuggestions, EmailTemplateEditor — hook amplamente vivo.

**shared-edge:**
- Regra 'applyNotificationMessage injeta blockquote personalizado (email-helpers.ts:197-201)': impreciso. O codigo (L191-195) injeta um <div> estilizado com border-left, NAO um elemento HTML <blockquote>. O comportamento de insercao (antes de </body>, ou append no fim se nao houver </body>) esta correto. Nitpick de nomenclatura, sem impacto funcional.
- Fluxo MCP 'supabaseForUser(Bearer token)': o client user-scoped e criado com SUPABASE_PUBLISHABLE_KEY (nao com a anon key nomeada), sempre com header Authorization: Bearer <ctx.getToken()> — supabase/functions/mcp/index.ts:12-17. Equivalente/correto, so precisando o ajuste do nome da chave.
- Observacao sobre a regra do issuer MCP: no FONTE (src/lib/mcp/index.ts:10) o issuer vem de VITE_SUPABASE_PROJECT_ID (conforme afirmado, correto). Mas o arquivo que roda na edge (supabase/functions/mcp/index.ts) e AUTO-GERADO (banner L1-5) com o projectRef ja inlinado como literal 'silefpsayliwqtoskkdz' (L142). Qualquer analise de 'morto/edicao' sobre supabase/functions/mcp/index.ts e moot: nao editar a mao, e regenerado pelo plugin Vite a partir de src/lib/mcp.

**docs-config:**
- Candidato 3 (IMPLEMENTATION_GUIDE.md) mal classificado pelo auditor: o arquivo NAO tem 0 refs — e linkado em CLAUDE.md:198 (§8) e contem conteudo vivo (§2.1 batch-process-invoices edge + useBatchProcessing.ts + tabela invoice_documents). Correcao: nao e doc-morto, e doc-com-secoes-S3-obsoletas; podar so §2.2/§3.1-3.4.
- Candidatos 4 e 5 (useSecureAction, s3-storage, S3StorageConfigForm, test-s3-connection) sao 'simbolos fantasma' (arquivos inexistentes), NAO codigo morto. Nao ha artefato para remover; o defeito real e drift de documentacao (docs descrevem codigo que nao existe). Classificacao 'codigo morto' e imprecisa.
- README.md nao e removivel: e a landing page do repo GitHub (uso externo ao grafo de links interno). 'Zero refs internas' nao implica morto. Correcao de rota: corrigir stack (npm/nvm->bun) e placeholder, nao deletar.
- Regra feature-flag CONFIRMADA em src/hooks/useFeatureFlag.ts: ordem enabled(L37)->user_ids(L40)->roles(L43-44)->rollout_percentage(L49) — bate com FEATURE_FLAGS.md. Hash FNV/rollout presente no mesmo arquivo.
- Regras de unicidade CONFIRMADAS por migrations reais: uq_nfse_history_active_per_invoice (supabase/migrations/20260710210000_*.sql) e uq_clients_normalized_document / idx_invoices_contract_month_unique (migrations 20260129/20260425). Nenhuma correcao necessaria.
- Fluxo de onboarding e chain de docs CONFIRMADOS: todos os docs citados existem (ADMIN_TOOLS, SECURITY, TESTING, FEATURE_FLAGS, DEPLOYMENT_PLAYBOOK, REGRAS_DE_COBRANCA, MAPA_DE_SETORES, SYSTEM_DOCUMENTATION). RBAC 6 roles confirmado (client_master/technician/financial em types.ts + componentes).


---

## Parte A — Inventário, fluxos e regras por módulo (apêndice de referência)

### auth — Autenticacao, Usuarios e Permissoes

Módulo cobre identidade (login por email OU username via edge login-with-username), bootstrap do primeiro admin, convites staff/cliente com aceite por token, RBAC granular (PERMISSIONS_CONFIG + overrides em role_permission_overrides), gestão de usuários (CRUD + reset de senha + vínculo a empresa) e detecção de anomalias de cadastro (cron diário). Estado geral sólido e coeso: uma única edge por operação, RLS/requireRole no backend, auditoria consistente. Pontos fracos: 2 edges órfãs da UI (update-user-email, confirm-user-email), várias APIs de permissão especulativas sem uso, convenção logic.ts quase não aplicada, e MAPA_DE_SETORES.md desatualizado (cita edge inexistente).

**Fluxos (rota→componente→hook→edge→tabela):**
- Login email: /login -> Login.tsx -> useAuth.signIn -> supabase.auth.signInWithPassword -> auth.users/profiles/user_roles
- Login username: /login -> Login.tsx -> invoke login-with-username -> resolve client_contacts.username->email (fallback profiles) -> signInWithPassword server -> setSession(tokens)
- Bootstrap admin: /setup -> Setup.tsx (checa user_roles admin) -> invoke bootstrap-admin -> createUser + profiles + rpc try_bootstrap_admin + audit_logs
- Recuperar senha: /forgot-password -> ForgotPassword.tsx -> invoke forgot-password -> client_contacts/profiles/auth.users -> generateLink(recovery) -> send-email-resend
- Reset (recovery): /reset-password -> ResetPassword.tsx -> supabase.auth.updateUser + profiles.must_change_password=false
- Reset forçado: ProtectedRoute (profiles.must_change_password) -> /reset-password?forced=1 -> updateUser
- Reset admin: UserActionsMenu -> ResetPasswordDialog -> invoke reset-password -> auth.admin.updateUserById + profiles.must_change_password + audit_logs + send-email-resend
- Convite staff: /settings/users -> UsersPage -> PendingInvitesTab -> InviteStaffDialog -> invoke invite-user -> pending_invites + send-email-resend
- Convite cliente: InviteClientDialog OU clients/:id -> ClientUsersList -> invoke invite-user(client_id) -> pending_invites
- Aceite convite: /setup-account?token -> SetupAccount -> rpc get_invite_info -> auth.signUp -> signIn -> rpc accept_invite -> user_roles/client_contacts/profiles
- Ativar convite manual: PendingInvitesTab -> ActivateInviteDialog -> invoke activate-invite-manually -> auth.admin.createUser/updateUserById + rpc admin_accept_invite
- Reenviar/Revogar convite: PendingInvitesTab -> invoke resend-invite | revoke-invite -> pending_invites
- Criar usuário staff: CreateUserDialog -> invoke create-user -> auth.users + profiles + user_roles (remove role 'client' residual do trigger)
- Alterar papel: UserActionsMenu -> ChangeRoleDialog -> rpc change_user_role -> user_roles
- Vincular empresa: UserActionsMenu -> LinkClientDialog -> client_contacts.insert + user_roles(role 'client' se sem papel)
- Excluir usuário: UserActionsMenu | ClientUsersList -> invoke delete-user -> auth.admin.deleteUser + anonimiza client_contacts + audit_logs
- Listar usuários: UsersPage -> UsersList -> useUsers -> rpc list_users_for_admin
- Anomalias: UsersPage -> AnomaliesBanner -> le application_logs(module=auth,action=detect_anomalies) | invoke detect-auth-anomalies -> auth.users/profiles/user_roles -> application_logs + notifications (cron diário 8h Brasília)
- Permissões: usePermissions -> usePermissionOverrides(role_permission_overrides) + PERMISSIONS_CONFIG -> PermissionGate / ProtectedRoute
- OAuth consent: /.lovable/oauth/consent -> OAuthConsent -> supabase.auth.oauth.getAuthorizationDetails/approve/deny (redirect /login?next= se sem sessão)
- Emails de Auth: Supabase Auth -> webhook auth-email-hook -> React Email templates (_shared/email-templates) -> Lovable Email API

**Regras de negócio:**
- Bootstrap só quando não existe admin: pré-check + guarda 403 (bootstrap-admin/index.ts:105) e atomicidade anti-race via rpc try_bootstrap_admin com cleanup do user (index.ts:144-165); UI espelha check em Setup.tsx:65
- Login por username nunca expõe o email; erros genéricos 'invalid_credentials' contra enumeração (login-with-username/index.ts:47,70,82,89-90)
- Rate limit de login por IP: 10/min (login-with-username/index.ts:10-11,51)
- must_change_password redireciona para /reset-password?forced=1 (ProtectedRoute.tsx:36); setado em reset-password/index.ts:102-110; limpo em ResetPassword.tsx:90-97
- Reset de senha por admin restrito a role admin (reset-password/index.ts:55-61); senha temporária de 14 chars com 1 de cada classe (index.ts:9-25); email de aviso NÃO inclui a senha (index.ts:127,150)
- forgot-password: resposta neutra anti-enumeração para email (index.ts:69-74,150-153); para username sem email cadastrado retorna noEmail (index.ts:155-159)
- Convite exige client_id para client/client_master e proíbe client_id para staff (invite-user/index.ts:13-16)
- Emitir convite exige role admin/manager/financial (invite-user/index.ts:24), porém o schema aceita conceder qualquer role inclusive admin (index.ts:11)
- Bloqueia convite se já existe auth.user com o email (paginação real) ou convite pendente válido (invite-user/index.ts:49-79)
- Convite expira em 7 dias (invite-user email index.ts:135; validado em activate-invite-manually index.ts:46)
- accept_invite exige sessão autenticada; sem sessão a conta fica sem role/empresa e depende de ativação manual (SetupAccount.tsx:89-106)
- create-user restrito a admin (create-user/index.ts:55); remove role 'client' residual inserido pelo trigger handle_new_user quando é usuário de equipe (index.ts:104-106)
- delete-user: só admin (index.ts:9), proíbe excluir a própria conta (index.ts:24-26), anonimiza client_contacts (user_id=null,is_active=false) (index.ts:41-43)
- Resolução de permissão com overrides: allow explícito vence; deny só efetiva se nenhum outro role permite (usePermissions.ts:12-35)
- isStaff = admin/manager/technician/financial (useAuth.tsx:304-306); isTechnicianOnly = technician sem admin/manager/financial (usePermissions.ts:67-74)
- Detecção de anomalias: orphans=auth sem profile, zombies=profile sem auth, unconfirmed_old=>7d sem confirmar, roleless=auth+profile sem role (detect-auth-anomalies/logic.ts:30-49); banner alerta se última execução >25h (AnomaliesBanner.tsx:26)
- LinkClient atribui role 'client' apenas se o usuário não tem nenhum papel (client nem staff) (LinkClientDialog.tsx:50-60)
- Auto-refresh de token 5 min antes de expirar (useAuth.tsx:8,60-88)

**Observações / riscos:**
- Escalonamento de privilégio: invite-user permite que manager/financial concedam a role 'admin' (o enum do schema aceita 'admin' sem exigir que o requester seja admin) - invite-user/index.ts:11,24. Vale gate extra 'só admin concede admin'.
- delete-user faz HARD delete de auth.users (cascateia profiles/user_roles). CLAUDE.md §7 manda anonimizar em vez de deletar quando há registros financeiros/auditoria referenciando o usuário; client_contacts é anonimizado, mas outras FKs por user_id podem ficar órfãs. Revisar aderência à regra de anonimização.
- Convenção logic.ts (CLAUDE.md §6.6) quase não aplicada: só resend-confirmation e detect-auth-anomalies têm logic.ts; as outras 13 edges do módulo concentram toda a regra no index.ts.
- Import morto: usePermissions.ts:2 importa getAllowedActions sem usar (getActions usa PERMISSIONS_CONFIG diretamente).
- API de permissão especulativa sem uso: PermissionGateAny/All e canViewModule/canEditModule/canManageModule - candidatos a remoção (YAGNI).
- Dois pontos de UI para o mesmo backend de convite/exclusão (settings: InviteClient/StaffDialog + UserActionsMenu; clients: ClientUsersList) - não há duplicação de lógica de servidor (edge única), mas convites de cliente entram por dois caminhos.
- useAuth.signUp faz parte do contexto mas parece sem uso real (Login usa signIn; SetupAccount chama supabase.auth.signUp direto; Register é estática) - confirmar com grep antes de remover.
- useUsers.filters.tenantId documentado como 'futuro multi-tenant' e atualmente ignorado (single-tenant) - dead flexibility tolerada, anotar.
- Confirmar no banco (não consultado, somente leitura de código): existência/assinatura das RPCs get_invite_info, accept_invite, admin_accept_invite, change_user_role, list_users_for_admin, try_bootstrap_admin e das tabelas pending_invites, role_permission_overrides, application_logs - todas referenciadas pelo código do módulo.

**Arquivos com uso parcial/incerto/nulo:**
- `src/components/auth/PermissionGate.tsx` — parcial — Gate de UI por module/action; exporta PermissionGate + PermissionGateAny/All _(evid: PermissionGate usado em ~20 arquivos; PermissionGateAny/All com 0 uso em JSX)_
- `src/lib/permissions.ts` — parcial — Config RBAC (módulos/ações/roles), hasPermission, metadata; getAllowedActions _(evid: hasPermission/PERMISSIONS_CONFIG usados; getAllowedActions 0 refs)_
- `supabase/functions/update-user-email/index.ts` — nao — Atualiza email do usuário (admin) + profiles + audit _(evid: 0 refs em src (só ADMIN_TOOLS.md/CHANGELOG); config.toml:36)_
- `supabase/functions/confirm-user-email/index.ts` — nao — Lista status de confirmação / confirma email manualmente (admin) _(evid: 0 refs em src (só docs))_
- `supabase/functions/auth-email-hook/index.ts` — incerto — Webhook Supabase Auth 'Send Email' -> React Email templates -> Lovable Email API; +/preview _(evid: config.toml:6 verify_jwt=false; CHANGELOG.md:824 'deployado mas silencioso (hook não configurado)')_


### tickets — Chamados/Tickets e SLA

Modulo cobre o ciclo completo do chamado (criacao via RPC atomica, fila, atendimento com cronometro/sessoes, pausas, transferencia, resolucao com registro de tempo/KB, avaliacao) e exibicao de SLA em horario comercial calculado client-side. Codigo esta amplamente em uso e bem cabeado, mas ha duas nocoes DESCONEXAS de SLA: o display (sla-calculator.ts) versus a coluna tickets.sla_deadline que NUNCA e escrita em lugar nenhum do repo — o que torna notify-sla-breach um no-op operacional e zera as metricas de SLA do Dashboard. Ha ainda escrita duplicada de historico/sessoes (TicketsPage vs useTicketAttendance) e um TicketRatingDialog morto dentro do TicketsPage. O MAPA_DE_SETORES ja documenta a maioria destes riscos com precisao.

**Integrações:** Email: send-email-resend e send-email-smtp (via send-ticket-notification e notify-sla-breach), WhatsApp: Evolution API via send-whatsapp (integration_settings.evolution_api), Telegram: send-telegram (integration_settings.telegram) — obs: send-ticket-notification usa snake_case (chat_id/parse_mode) enquanto notify-sla-breach/check-no-contact usam camelCase (chatId/parseMode), Web Push: send-push-notification (obs: notify-sla-breach e check-no-contact enviam contrato {userId,title,body,url} divergente do esperado {type,role_filter/user_ids,data}), Supabase Storage: bucket ticket-attachments (anexos de comentarios), RPCs: create_staff_ticket (criacao atomica), get_ticket_form_data (tecnicos/categorias/ativos), Gamificacao: technician_points (avaliacao >=4), KB: knowledge_articles (sugestoes na abertura e artigo gerado na resolucao), Ativos/RMM: assets e monitored_devices (DeviceSelector/AssetSelectionDialog)

**Fluxos (rota→componente→hook→edge→tabela):**
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

**Regras de negócio:**
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

**Observações / riscos:**
- CRITICO: tickets.sla_deadline nunca e escrito no repo (0 writes) -> notify-sla-breach processa 0 chamados e metrica SLA do Dashboard (get_dashboard_stats) fica sempre 100%/vazia. Ou implementar trigger p/ preencher sla_deadline, ou reescrever notify-sla-breach usando sla-calculator.ts.
- Duas fontes de SLA desconexas: display client-side (sla-calculator.ts, horario comercial+pausas) vs sla_deadline absoluto (edge/dashboard). Nunca convergem.
- Fluxo de 'iniciar atendimento' duplicado: startTicketMutation (TicketsPage) e startMutation (useTicketAttendance) fazem quase o mesmo (sessao+status+historico) por caminhos paralelos — candidato a unificar.
- 3 edges (send-ticket-notification, notify-sla-breach, check-no-contact-tickets) nao estao em supabase/config.toml -> verify_jwt=true por default; as duas de cron precisam de JWT service-role senao retornam 401.
- check-no-contact-tickets usa updated_at para janelas 24h/48h: qualquer edicao do chamado reseta o relogio de lembrete.
- notify-sla-breach so cria notificacao in-app quando ha assigned_to; chamados na fila sem tecnico nao geram alerta de SLA.
- Kanban muda status por drag&drop sem passar pela maquina validTransitions do TicketDetailsTab nem pelos side-effects de sessao/pausa (inconsistencia de regras entre os dois caminhos de mudanca de status).
- TicketRatingDialog no TicketsPage e codigo morto (isRatingOpen nunca ativado); prop firstResponseAt do TicketResolveDialog e passada mas ignorada.

**Arquivos com uso parcial/incerto/nulo:**
- `supabase/functions/notify-sla-breach/index.ts` — parcial — Cron: alerta tecnico/gestores de SLA em risco/violado lendo tickets.sla_deadline _(evid: cron-only (sem invoke no front); filtra .not sla_deadline is null, mas sla_deadline nunca e escrito -> processa 0 chamados)_
- `src/components/tickets/TicketRatingDialog.tsx` — parcial — Avaliacao 1-5 estrelas: seta status closed e concede pontos ao tecnico se >=4 _(evid: vivo em ClientPortalPage.tsx:199; instancia em TicketsPage.tsx:855 nunca abre (setIsRatingOpen(true) inexistente))_


### clients-doc — Clientes e Documentacao Tecnica

Módulo cobre CRUD de clientes (lista cursor-based + form com auto-preenchimento CNPJ e validação WhatsApp), merge de duplicatas (detecção por CNPJ normalizado + RPC transacional), filiais (sede única), dossiê técnico em 14 seções (doc_* via React Query direto + RLS), alertas de vencimento (edge cron), sync TRMM/UniFi e export PDF. Está majoritariamente sólido e todos os arquivos do escopo estão em uso, mas há 3 problemas reais persistentes: merge_clients NÃO migra tabelas doc_* (risco de perda de dados no DELETE em cascata), invalidateAll do useDocSync usa queryKeys que não casam com useDocTableCrud (tabelas não re-renderizam pós-sync), e há dois caminhos de exclusão de cliente (um seguro via RPC, um hard-delete cru na lista).

**Integrações:** ReceitaWS (receitaws.com.br) via cnpj-lookup — auto-preenchimento de CNPJ (tier gratuito, rate-limit 3/min tratado), ViaCEP (viacep.com.br) — direto no frontend em ClientBranchesList (CEP->endereço), Tactical RMM — sync-doc-devices lê integration_settings + client_external_mappings, importa agents para doc_devices, UniFi (direct via /api/login e cloud via api.ui.com) — sync-doc-devices importa devices/VLANs/firewall/port-forward/VPN, validate-whatsapp (edge) — validação de número no ClientForm, asaas-nfse (edge) — sync_customer + regenerate_payment ao mudar dados fiscais do cliente, @react-pdf/renderer — geração do PDF do dossiê (import dinâmico), RPCs: detect_duplicate_clients, merge_clients, delete_client_safely (SECURITY DEFINER)

**Fluxos (rota→componente→hook→edge→tabela):**
- GET /clients -> ClientsPage -> useQuery(clients, cursor-based) + DuplicatesBanner(RPC detect_duplicate_clients) -> tabela clients
- ClientsPage -> ClientForm.searchCNPJ -> invoke('cnpj-lookup') -> ReceitaWS -> form.setValue (não persiste até salvar) -> insert/update clients
- ClientForm submit (edição fiscal) -> update clients -> invoke('asaas-nfse' sync_customer) + regenerate_payment de invoices pending/overdue -> tabelas clients/invoices
- DuplicatesBanner -> MergeClientsDialog (3 passos) -> RPC merge_clients(source,target,overrides) -> migra tickets/contracts/invoices/contacts/assets/branches/etc + audit_logs + client_history + DELETE source
- /clients/:id?tab=branches -> ClientBranchesList -> useClientBranches -> client_branches (CEP via ViaCEP); UNIQUE sede/nome tratada no onError
- /clients/:id?tab=documentation -> ClientDocumentation -> 14 seções: useDocSection (doc_infrastructure/telephony/support_hours) e useDocTableCrud (11 doc_* tabelas) -> supabase-js direto + RLS
- Dossiê -> DocSyncStatusBar/DocTableWorkstations -> useDocSync -> invoke('sync-doc-devices' {action,client_id}) -> TRMM/UniFi -> upsert doc_devices/doc_vlans/doc_firewall_rules/doc_vpn + doc_sync_log
- Cron -> check-doc-expiries -> varre doc_licenses/doc_domains/doc_internet_links/doc_software_erp/doc_external_providers -> doc_alerts + notifications -> useDocAlerts -> DocAlertsPanel
- Dossiê -> botão PDF -> useDocPdfGenerator (fetch paralelo doc_*) -> import dinâmico DocPdfExport/@react-pdf/renderer -> download blob
- /clients/:id?tab=network -> ClientNetworkTab -> useUnifiedNetworkDevices + network_sites/network_topology/doc_vlans/doc_firewall_rules -> NetworkTopologyMap
- ClientDetailPage header -> DeleteClientButton -> RPC delete_client_safely(preview) -> blockers(active_contracts/open_tickets/pending_invoices); confirmação -> delete_client_safely(execute)
- Inventário: AssetForm/ClientAssetsList -> DocDeviceLinkDialog -> useDocDeviceSync.findMatch/promoteToDoc/linkAsset -> assets.doc_device_id + doc_devices

**Regras de negócio:**
- Merge exige mesmo normalized_document e documento não-vazio (defesa) — supabase/migrations/20260427092735...:29-32
- Merge estratégia híbrida B+A: override > destino > source (COALESCE) — 20260427092735...:74-91; espelhada em client-merge.ts:36-64 (resolveMergedFields) e previewMerge:77-99
- Merge só admin (has_role admin) — 20260427092735...:15; DuplicatesBanner.tsx:35,51 (gate isAdmin)
- Merge só em pares; 3+ duplicatas bloqueadas com aviso — MergeClientsDialog.tsx:127-134 e disabled 258
- Merge exige digitar nome exato do source para confirmar — MergeClientsDialog.tsx:113,267
- Merge migra client_branches resolvendo conflito de sede única (rebaixa) e nome homônimo (' (migrada)') — 20260427092735...:109-136
- Filial: apenas uma is_main por cliente (UNIQUE uniq_client_branches_main_per_client) — ClientBranchesList.tsx:199-206
- Filial: nome único por cliente (uniq_client_branches_name_per_client) — ClientBranchesList.tsx:208-214
- Filial: não excluir a Sede se houver outras filiais — ClientBranchesList.tsx:240-248
- Filial: auto-preenche endereço/cidade/UF via ViaCEP no blur do CEP — ClientBranchesList.tsx:113-161
- Cliente: guarda de duplicata por normalized_document exige window.confirm antes de criar — ClientForm.tsx:461-496; erro 23505/uq_clients_normalized_document tratado — 446-458
- Cliente: mudança fiscal (CNPJ/nome/endereço/CEP) sincroniza Asaas e regenera boletos pending/overdue (evita cobrança duplicada) — ClientForm.tsx:328-413
- Cliente: CNPJ auto-preenchido via cnpj-lookup; edge valida 14 dígitos, timeout 8s, trata 429/502/504 — cnpj-lookup/index.ts:25-84
- Cliente: WhatsApp auto-validado (debounce 2s) via invoke('validate-whatsapp') — ClientForm.tsx:141-151,208-277
- Técnicos não veem document (CPF/CNPJ) nem financial_email — ClientsPage.tsx:344; ClientDetailPage.tsx:193; ClientForm.tsx:511,745
- Exclusão segura: RPC delete_client_safely bloqueia se houver contratos ativos/chamados abertos/faturas pendentes + confirmação por nome — DeleteClientButton.tsx:32-36,56-92
- Sync: campos manuais nunca sobrescritos (ram,primary_user,physical_location,notes,purpose,context,isolated) e flag '+manual' preservada — sync-doc-devices/index.ts:12,28-43
- Sync TRMM: match por trmm_agent_id (fallback nome), conflito de hostname registrado sem sobrescrever — sync-doc-devices/index.ts:106-148
- Asset->doc_device: match prioridade serial_number depois name(ilike) — useDocDeviceSync.ts:37-62
- Alertas: severidade critical(<0 ou <=7d)/warning(<=30d)/info; dedup por alerta ativo existente e resolve fora do limiar — check-doc-expiries/index.ts:63-68,123-215; dedup de notificação não-lida — 189-203
- daysUntil: badge destructive <=30d, warning <=60d — doc-utils.ts:12-24

**Observações / riscos:**
- RISCO DE PERDA DE DADOS (confirmado no código, impacto depende de FK): merge_clients (20260427092735) deleta o source sem migrar nenhuma tabela doc_* (doc_devices/credentials/licenses/domains/vlans/vpn/firewall/alerts/sync_log). Se as FKs client_id forem ON DELETE CASCADE, todo o dossiê técnico do cliente mesclado é apagado silenciosamente. Não pude confirmar o modo da FK (regra: sem consultar banco).
- BUG (confirmado): useDocSync.invalidateAll (useDocSync.ts:92-98) invalida chaves que não existem — prefixo literal 'doc-table' vs chave real de useDocTableCrud [tableName,clientId,'all']. Efeito: após sincronizar TRMM/UniFi, as tabelas de dispositivos/VLANs não atualizam sem refresh manual.
- REDUNDÂNCIA/RISCO: dois fluxos de exclusão de cliente — ClientsPage.tsx:171 hard-delete direto (sem bloqueio de contratos/faturas, sem anonimização) e DeleteClientButton via RPC delete_client_safely. O primeiro contraria a regra do projeto (não apagar registros financeiros; anonimizar) e ignora os blockers. Unificar no RPC seguro.
- cnpj-lookup e check-doc-expiries/sync-doc-devices não têm entrada em supabase/config.toml → verify_jwt=true (default). cnpj-lookup é chamado com JWT do usuário (ok); check-doc-expiries precisa de JWT/service-role no agendador (se agendado).
- resolveMergedFields (client-merge.ts) duplica em TS a lógica que a RPC SQL já faz; mantida só por teste. Baixa prioridade, mas é fonte-dupla de verdade da regra de merge.
- check-doc-expiries reabre/atualiza alertas O(N) com uma query de notificação por técnico dentro do loop (index.ts:189-203) — potencial N+1 em bases grandes; sem paginação/batch.
- ClientsPage.trade_name é lido via type-cast solto (as any) em vários pontos (nickname/trade_name) — types gerados podem estar desatualizados para colunas recém-adicionadas.

**Arquivos com uso parcial/incerto/nulo:**
- `src/lib/client-merge.ts` — parcial — Lógica pura de resolução de campos do merge (previewMerge + resolveMergedFields, estratégia híbrida B+A) _(evid: previewMerge usado em MergeClientsDialog; resolveMergedFields só em teste)_
- `supabase/functions/check-doc-expiries/index.ts` — incerto — Cron: varre 5 fontes doc_* (licenças/domínios/links/software/prestadores), cria/atualiza/resolve doc_alerts + notifica técnicos _(evid: nenhum invoke no frontend; agendamento não encontrado em migrations)_


### contracts — Contratos e Reajustes

Módulo funcional e majoritariamente em uso. O reajuste manual é feito 100% client-side no ContractAdjustmentDialog (INSERT contract_adjustments + UPDATE contracts/contract_services + INSERT contract_history); a edge apply-contract-adjustment é uma segunda implementação da MESMA regra, invocada apenas pelo cron check-contract-adjustments para auto-aplicar FIXO no D-0. fetch-economic-indices busca IGPM/IPCA/INPC do Banco Central e alimenta useLatestEconomicIndex e o EconomicIndicesWidget (setor Billing). Nenhum arquivo/símbolo do escopo está morto; os principais problemas são duplicação de regra, edges sem autenticação (verify_jwt=false) e agendamento fora das migrations.

**Integrações:** Banco Central do Brasil — SGS (séries IGPM=189, IPCA=433, INPC=188) via fetch-economic-indices, sem credenciais (fetch público), pg_cron + pg_net — agendamento de check-contract-adjustments e fetch-economic-indices (SQL documentado em DEPLOYMENT_PLAYBOOK.md; não presente em migrations), Asaas (indireto) — NextAsaasInvoicePreview mostra a próxima cobrança recalculada com o valor reajustado

**Fluxos (rota→componente→hook→edge→tabela):**
- Reajuste manual (edição): /contracts/edit/:id -> EditContractPage -> ContractForm(aba Reajuste) -> ContractAdjustmentCard -> ContractAdjustmentDialog(mutation client-side) -> INSERT contract_adjustments + UPDATE contracts + UPDATE contract_services + INSERT contract_history
- Reajuste manual (atalho lista): /contracts -> ContractsPage(dropdown 'Reajuste anual') -> ContractAdjustmentDialog -> mesmas tabelas (contract_adjustments/contracts/contract_services/contract_history)
- Buscar índice atual: ContractAdjustmentDialog -> useLatestEconomicIndex -> SELECT economic_indices(accumulated_12m) -> preenche percentual
- Renegociação: ContractAdjustmentCard -> ContractRenegotiationDialog -> UPDATE contracts.monthly_value + INSERT contract_history(action='renegotiation') (NÃO cria contract_adjustments nem mexe em adjustment_date)
- Editar configuração: ContractAdjustmentCard -> ContractAdjustmentConfigSheet -> UPDATE contracts(adjustment_date/adjustment_index/adjustment_percentage)
- Config na criação: /contracts/new -> NewContractPage -> ContractForm -> sections/ContractAdjustmentSection -> campos do form -> INSERT contracts
- Cron reajuste/lembretes: pg_cron -> check-contract-adjustments -> (FIXO D-0) invoke apply-contract-adjustment -> UPDATE contracts/contract_services + INSERT contract_adjustments/contract_history; caso contrário INSERT notifications + contract_history(action='adjustment_reminder'); lê user_roles(admin/financial) e clients
- Índices econômicos: pg_cron(semanal, só no playbook) OU EconomicIndicesWidget -> fetch-economic-indices -> API BCB SGS -> upsert economic_indices(onConflict index_type,reference_date)
- Widget de índices: BillingPage -> BankReconciliationTab -> EconomicIndicesWidget -> SELECT economic_indices / invoke fetch-economic-indices
- Timeline de reajustes: ContractAdjustmentCard -> useContractAdjustmentHistory -> SELECT contract_adjustments + contract_history(renegotiation) -> ContractAdjustmentHistoryList
- Histórico completo: ContractsPage/ContractQuickActions -> ContractHistorySheet -> SELECT contract_history + contract_service_history + invoices+nfse_history

**Regras de negócio:**
- Novo valor = monthly_value * (1 + pct/100) — ContractAdjustmentDialog.tsx:63 e apply-contract-adjustment/index.ts:58-59
- Próxima data de reajuste = data de vigência (ou hoje) + 1 ano — ContractAdjustmentDialog.tsx:65,98; edge index.ts:81-82 (usa now, não a vigência)
- Serviços reajustados proporcionalmente: unit_value*=mult, value=unit*qty — ContractAdjustmentDialog.tsx:110-116; edge index.ts:107-116
- adjustment_percentage só persiste para FIXO (null caso contrário) — ContractAdjustmentDialog.tsx:100; ContractAdjustmentConfigSheet.tsx:51
- FIXO auto-aplica no D-0 via apply-contract-adjustment — check-contract-adjustments/index.ts:107-119
- Buckets de lembrete: D-30(info), D-7(warning), D-0(warning), overdue D+1..D-30(warning) — check-contract-adjustments/index.ts:82-144
- Idempotência do lembrete: 1 por bucket por dia via contract_history(action='adjustment_reminder', changes.bucket) — check-contract-adjustments/index.ts:90-104,159-164
- Notificações só para roles admin/financial — apply/index.ts:135-138 e check/index.ts:66-69
- Renegociação exige valor diferente do atual e motivo; não altera data nem histórico de índice — ContractRenegotiationDialog.tsx:43-45,124-126
- accumulated_12m = produto dos 12 fatores mensais - 1, só a partir do 12º ponto (i>=11) — fetch-economic-indices/index.ts:94-101
- Séries BCB: IGPM=189, IPCA=433, INPC=188 — fetch-economic-indices/index.ts:18-22
- 'Buscar atual' preenche o percentual com o último accumulated_12m do índice — ContractAdjustmentDialog.tsx:76-80
- useLatestEconomicIndex desabilitado para FIXO — useLatestEconomicIndex.ts:13
- Validação edge: contract_id obrigatório e index_value numérico > 0 — apply-contract-adjustment/index.ts:28

**Observações / riscos:**
- DUPLICAÇÃO de regra: apply-contract-adjustment (edge) e ContractAdjustmentDialog.mutation (client-side) implementam o mesmo reajuste. A UI usa a versão client-side; a edge só roda no FIXO D-0. Diferenças reais: a edge NÃO grava applied_by (index.ts:63-73), NÃO seta adjustment_percentage (index.ts:84-91) e usa adjustment_date=hoje em vez da vigência escolhida.
- SEGURANÇA: config.toml marca as 3 edges com verify_jwt=false. apply-contract-adjustment usa service role e aceita contract_id+index_value de qualquer chamador não autenticado (index.ts:15-33) -> reajuste arbitrário sem auth. Sem checagem de secret/cron header em apply nem em fetch.
- FIXO D-0 não grava registro de idempotência 'adjustment_reminder' (o branch dá 'continue' em index.ts:118 antes do INSERT das linhas 159-164). A proteção contra reaplicar 2x depende apenas de apply mover adjustment_date +1 ano; há janela de corrida se apply falhar após o UPDATE parcial.
- TIMEZONE misto: o cron calcula buckets com adjustment_date+'T00:00:00Z' (UTC, check/index.ts:73,78) enquanto o card usa +'T12:00:00' local (ContractAdjustmentCard.tsx:75,130) -> possível off-by-one entre o status exibido na UI e o dia em que o cron dispara.
- RLS x UI: os botões Aplicar/Renegociar/Config no ContractAdjustmentCard (linhas 184-197) não têm PermissionGate; a RLS de contract_adjustments exige admin/financial (migration L108-110) -> staff comum vê os botões e recebe erro de RLS ao aplicar.
- Consistência valor x serviços: editar serviços após o reajuste pode sobrescrever o monthly_value reajustado (ContractServicesSection recalcula por soma dos serviços).
- fetch-economic-indices conta 'inserted' mesmo em updates de upsert (index.ts:116-118) — métrica exibida no toast do widget é enganosa; 'latest' retornado é o último ponto iterado do array.
- Nenhum arquivo/símbolo do escopo está órfão (0 candidatos a morto). apply-contract-adjustment tem exatamente 1 caller (check-contract-adjustments), portanto é redundância, não código morto.

**Arquivos com uso parcial/incerto/nulo:**
- `supabase/functions/apply-contract-adjustment/index.ts` — parcial — Edge que aplica reajuste (UPDATE contracts/services + INSERT adjustments/history + notificações) _(evid: invocada SÓ por check-contract-adjustments/index.ts:108 (FIXO D-0); UI nunca chama)_


### billing — Faturamento e Cobranca (Invoices/Boletos)

Módulo maduro e amplamente vivo: rota /billing (BillingPage → BillingInvoicesTab) e /billing/delinquency estão ativas, com geração mensal por contrato (frequências, janela days_before_due, first_billing_month, dedup) sólida e cobrança via Asaas (padrão) + Banco Inter (legado, ainda referenciado como branch de provider). Estado granular boleto/nfse/email + máquina de estados invoice. Achados principais: a edge generate-invoice-payments está órfã (0 invoke, fora de cron/config.toml), e a lib billing-fsm.ts está quase inerte — 9 dos 11 exports só são consumidos pelo teste, a UI real usa apenas 2 helpers e calcula o resto inline. Vários exports de useInvoices (useInvoice, useInvalidateInvoices, InvoiceWithErrors) são mortos. Duplicação de lógica de multa/juros e de geração de pagamento em 3-4 lugares.

**Integrações:** Asaas (asaas-nfse): provider padrão de boleto/PIX/NFS-e (create_payment/emit/cancel_payment) — chamado por generate-monthly-invoices, useInvoiceActions, batch-process, second-copy, renegotiate, auto-retry, Banco Inter (banco-inter + webhook-banco-inter): provider LEGADO, ainda referenciado como branch provider!=asaas em useInvoiceActions e BillingInvoicesTab.handleCancelBoleto, Resend (send-email-resend): e-mails de fatura/cobrança, Evolution API (send-whatsapp): cobrança WhatsApp, poll-services: consulta status de pagamento (Verificar Pagamento / Forçar Polling), Supabase Storage (buckets invoice-documents/nfse-files): PDFs de boleto/NFS-e via signed URL (7 dias), pg_cron (não versionado no repo): generate-invoices-daily, notify-due-invoices-daily, auto-retry-failed-boletos (documentado em MAPA:95-102)

**Fluxos (rota→componente→hook→edge→tabela):**
- /billing → BillingPage → BillingInvoicesTab → useInvoices → tabela invoices + view accounts_receivable (resumo) + nfse_history (badges)
- BillingInvoicesTab 'Gerar Faturas Mensais' → invoke generate-monthly-invoices → contracts(active,>0) → insert invoices → asaas-nfse(create_payment boleto/pix + emit nfse) → send-email-resend → invoice_notification_logs/notifications/invoice_generation_log/invoice_items
- cron generate-invoices-daily (11h) → generate-monthly-invoices (mesmo pipeline, sem role guard pois service role)
- InvoiceActionsPopover/InvoiceInlineActions → useInvoiceActions.handleGeneratePayment → asaas-nfse create_payment (ou banco-inter legado) → invoices.boleto_url/pix_code/boleto_status
- markAsPaid → useInvoiceActions.markAsPaidMutation → manual-payment → invoices.status=paid + financial_entries(receita) + audit_logs
- ManualPaymentDialog → manual-payment (valor/data/método, opcional emit nfse) → invoices + financial_entries
- SecondCopyDialog → calculate-invoice-penalties (multa/juros) + generate-second-copy → asaas-nfse create_payment(override value/due) → invoices.boleto_url/barcode + audit_logs
- RenegotiateInvoiceDialog → renegotiate-invoice → insert N invoices(parcelas, parent_invoice_id) + original status=renegotiated + asaas-nfse cancel_payment
- BillingInvoicesTab 'Faturar Agora' → useBatchProcessing → batch-process-invoices → (por fatura) asaas-nfse + resend-payment-notification → invoices status granulares
- DelinquencyReportPage → invoices(status=overdue)+clients → seleção → batch-collection-notification → send-email-resend/send-whatsapp → invoice_notification_logs
- cron auto-retry-failed-boletos (4x/dia) → invoices(boleto erro, sem asaas_payment_id) → asaas-nfse create_payment → invoices + audit_logs + notifications(3ª falha)
- cron notify-due-invoices (12h) → invoices pending a vencer → send-email-resend/whatsapp (não cobre overdue)
- webhook-banco-inter (legado) → boletos Inter antigos → invoices.status=paid
- poll-services (handleCheckPaymentStatus/handleForcePolling em useInvoiceActions) → consulta status boleto no provedor → invoices.status=paid

**Regras de negócio:**
- Dedup de fatura por contrato+reference_month, excluindo apenas 'cancelled' (fail-closed se erro) — generate-monthly-invoices/index.ts:314-324
- Gate de frequência: monthly=1,bimonthly=2,quarterly=3,semiannual=6,yearly=12 meses; pula se monthsSince<intervalo — index.ts:384-433
- Valor recorrente = monthly_value × intervalMonths para frequências >1 mês (charges adicionais não multiplicam) — index.ts:603-604
- Janela de geração antecipada: só gera se hoje >= vencimento − days_before_due (default 5) — index.ts:543-586
- first_billing_month: pula competências anteriores ao início de faturamento — index.ts:509
- Vencimento no passado avança a fatura para o mês seguinte (com novo dedup) — index.ts:449-506
- billing_day limitado ao último dia do mês (Math.min) — index.ts:441-442
- end_date guard: pula contrato 'active' com end_date no passado — index.ts:345-379
- Provider forçado a Asaas pós-migração 2026-05-07 (Inter só legado) — index.ts:731
- holdForNfse: retém e-mail para envio consolidado (boleto+nota) quando NFS-e é agendada — index.ts:836,930
- Multa 2% fixa + juros 1% a.m. pro-rata (dias/30) sobre amount — calculate-invoice-penalties/index.ts:70-73
- Mesma fórmula multa/juros duplicada na 2ª via — generate-second-copy/index.ts:94-96
- Renegociação só para status='overdue', 2-12 parcelas, cancela boleto Asaas original — renegotiate-invoice/index.ts:60,83,177
- Renegociação: número de parcela via MAX(invoice_number)+1 (race admitida em ponytail comment) — renegotiate-invoice/index.ts:106-115
- Baixa manual restrita a admin/financial; bloqueia paid/cancelled; grava paid_amount + financial_entries + audit — manual-payment/index.ts:55,109-121,144-170
- markAsPaid rápido usa invoice.amount como paid_amount (pagamento integral presumido) — useInvoiceActions.ts:565,46-56
- Cancelamento de fatura: cancela cobrança Asaas ANTES (fail-closed), sanitiza campos transitórios, audita, resolve nfse em erro — useInvoiceActions.ts:370-429
- Contador de vencidas = status='overdue' OU (pending com due_date<hoje) — useBillingCounters.ts:21
- Resumo 'Recebido' soma paid_amount (não amount) via view accounts_receivable, filtrado por paid_date no período — BillingInvoicesTab.tsx:197-222
- Auto-retry: boleto erro sem asaas_payment_id, created_at>30min, attempts<3; reagenda +3 dias úteis; alerta financeiro na 3ª falha — auto-retry-failed-boletos/index.ts:60-77,101-107,175-183
- Bloqueio de envio de notificação com artefatos incompletos (NFS-e sem pdf/xml, boleto em processamento) — resend-payment-notification/index.ts:104-144
- FSM de permissões (canMarkAsPaid/canCancelInvoice/canResendNotification etc.) por status — billing-fsm.ts:103-173
- Batch 'Faturar Agora' fixa boleto+nfse+email, sem pix/whatsapp — useBatchProcessing.ts:31-38
- 2ª via só para pending/overdue, novo vencimento hoje+5 dias — generate-second-copy/index.ts:76,119-122

**Observações / riscos:**
- Duplicação de regra de multa/juros (2% + 1% a.m.) em calculate-invoice-penalties e generate-second-copy — fonte de verdade única faltando (candidato a src/lib).
- Duplicação de lógica de geração de pagamento em 3-4 pontos: generate-monthly-invoices (inline), generate-invoice-payments (morta), useInvoiceActions.handleEmitComplete e batch-process-invoices.
- batch-process-invoices sem idempotência: reprocessar as mesmas faturas pode duplicar cobrança no Asaas (não checa asaas_payment_id existente antes de create_payment).
- renegotiate-invoice usa MAX(invoice_number)+1 — race sob concorrência gera invoice_number duplicado (ponytail comment já reconhece; upgrade = sequence no banco).
- Falta de checagem de role em batch-collection-notification, notify-due-invoices e generate-invoice-payments; batch-collection é chamada do frontend com token do usuário mas não re-valida papel na edge.
- webhook-banco-inter ausente do config.toml → verify_jwt=true bloquearia o callback do banco (impacto limitado a boletos Inter legados ainda abertos).
- Branch de provider 'banco_inter' morto no frontend: UI força Asaas (InvoiceActionsPopover gera sempre asaas), mas handleGeneratePayment/handleCancelBoleto ainda carregam o caminho Inter.
- markAsPaidMutation assume pagamento integral (paid_amount=amount); pagamento parcial exige 'Baixa Manual' — risco de baixa incorreta se operador usar 'Marcar como Pago (rápido)' num pagamento parcial.
- Leituras mortas de status 'processando' no boleto_status (enum não possui) em useInvoiceActions:142, resend-payment-notification e batch-process-invoices — inofensivas, candidatas a limpeza.

**Arquivos com uso parcial/incerto/nulo:**
- `src/hooks/useInvoices.ts` — parcial — Hook centralizado de listagem de invoices (filtros/fields) + useInvoice(id) + useInvalidateInvoices _(evid: useInvoices usado em BillingInvoicesTab:4 e ContractInvoicesSheet:2; useInvoice/useInvalidateInvoices/InvoiceWithErrors sem callers externos)_
- `src/lib/billing-fsm.ts` — parcial — FSM de fatura: computeInvoiceDerivedState + 8 helpers de permissão (canMarkAsPaid, canResendNotification...) + display _(evid: Só canCancelBoleto e canMarkAsPaid usados em prod (InvoiceActionsPopover:9,89-90); os outros 9 exports só aparecem em billing-fsm.test.ts)_
- `supabase/functions/generate-invoice-payments/index.ts` — nao — Gera boleto/pix para faturas pending sem pagamento (batch/single) — sem auth, default provider banco_inter _(evid: 0 invoke() no repo; ausente de config.toml e da tabela de cron (MAPA:95-102))_
- `supabase/functions/banco-inter/index.ts` — parcial — Integração legada Banco Inter (mTLS): gera/cancela boleto/pix — provider legado _(evid: invoke em useInvoiceActions:86,238,259 e BillingInvoicesTab:354,886 (branch provider!=asaas); migração 2026-05-07 fixou provider='asaas')_
- `supabase/functions/webhook-banco-inter/index.ts` — parcial — Webhook legado do Banco Inter (confirma pagamento de boletos Inter antigos) _(evid: Só recebe callbacks de boletos Inter legados; AUSENTE de config.toml → verify_jwt=true)_


### nfse — NFS-e e Certificados Digitais

Módulo de emissão/cancelamento/arquivamento de NFS-e delegada ao Asaas (idempotente por fatura via índice único + NFSE_BLOCKING_STATUSES), com sync por webhook (baixa PDF/XML, auto-emite no pagamento, reemissão pós-cancelamento) e polling (check_single_status). Toda a lógica de negócio vive no monólito asaas-nfse/index.ts (3010 linhas, mistura NFS-e + cobrança boleto/PIX). O frontend (BillingNfseTab e diálogos em src/components/billing/nfse/**) está coeso e em uso. Os certificados A1 (parse-certificate + certificate-vault + tabela certificates) servem hoje apenas como registro/monitoramento — a emissão fiscal usa o certificado dentro do próprio Asaas, então a senha criptografada e a action 'decrypt' nunca são consumidas. Estado geral: funcional, porém com código morto (5 actions + decrypt), duplicação de fonte de dados de certificado e um monólito que fere a regra de arquivos pequenos.

**Integrações:** Asaas API (sandbox/produção) — emissão/cancelamento de NFS-e e cobrança boleto/PIX; ASAAS_URLS em asaas-nfse/index.ts:160-163, Resend (via edge send-email-resend) — e-mail da NFS-e com PDF/XML anexos (send-nfse-notification:273), WhatsApp/Evolution (via edge send-whatsapp) — canal opcional de compartilhamento da nota (send-nfse-notification:351), Supabase Storage — buckets 'nfse-files' (PDF/XML da nota) e 'certificates' (.pfx/.p12), node-forge (esm.sh, PKCS12) — leitura do certificado A1 em parse-certificate, Web Crypto (PBKDF2/AES-GCM) usando SUPABASE_SERVICE_ROLE_KEY como key material em certificate-vault

**Fluxos (rota→componente→hook→edge→tabela):**
- Emissão via fatura (UI): BillingInvoicesTab/EmitNfseDialog -> invoke asaas-nfse(emit) -> ensureCustomerSync(clients) -> insere nfse_history('processando') -> POST /invoices Asaas -> espelha invoices.nfse_status(pendente/gerada)
- Emissão avulsa: BillingNfseTab -> NfseAvulsaDialog -> asaas-nfse(emit_standalone) [+ asaas-nfse(create_payment) p/ boleto] -> nfse_history / invoices
- Emissão automática na geração de fatura: generate-monthly-invoices(cron) -> asaas-nfse(emit) -> nfse_history (política: emite na geração; webhook é fallback)
- Auto-emissão no pagamento (fallback): Asaas PAYMENT_RECEIVED -> webhook-asaas-nfse -> asaas-nfse(emit) se contract.nfse_service_code e !auto_nfse_emitted -> nfse_history
- Sync de status: Asaas INVOICE_* -> webhook-asaas-nfse -> nfse_history(status/numero/pdf_url/xml_url) + invoices.nfse_status -> send-nfse-notification(email) só na 1ª autorização -> financial_entries
- Polling manual/agendado: NfseProcessingIndicator -> asaas-nfse(check_single_status) -> baixa PDF/XML nfse-files -> nfse_history; poll-services(cron) -> send-nfse-notification
- Cancelamento: NfseDetailsSheet -> details/NfseCancelDialog -> asaas-nfse(cancel) -> POST /invoices/{id}/cancel -> nfse_cancellation_log(REQUESTED->CANCELLED) + nfse_history
- Ajuste de valor da nota (cancelar+reemitir): EditInvoiceDialog -> asaas-nfse(cancel_and_reissue_nfse) -> doReissue -> asaas-nfse(emit,force_new_emission) -> nfse_history(nfse_substituta_id)
- Reemissão assíncrona: webhook-asaas-nfse(INVOICE_CANCELED + reissue_pending) -> asaas-nfse(reissue_nfse) -> doReissue -> nfse_history
- Vincular nota externa: BillingNfseTab/NfseDetailsSheet -> NfseLinkExternalDialog -> asaas-nfse(link_external) -> nfse_history(status='autorizada', codigo_retorno='LINKED_EXTERNAL')
- Arquivar/restaurar: NfseDetailsSheet -> details/NfseArchiveDialog -> asaas-nfse(archive_record/restore_record) -> nfse_history.is_active + nfse_event_logs
- Compartilhar: NfseShareMenu/NfseDetailsSheet -> send-nfse-notification(email/whatsapp) -> signed URLs bucket nfse-files -> invoice_notification_logs
- Certificado A1: CompanyTab/CertificateManager -> parse-certificate(node-forge) + certificate-vault(encrypt) -> tabela certificates + bucket certificates
- Dashboard de certificados: rota /settings/certificates -> CertificateDashboardPage -> lê company_settings.certificado_* (fonte legada, não escrita) -> sempre 'Não Configurado'

**Regras de negócio:**
- Idempotência por fatura: emit com invoice_id e sem nfse_history_id/force_new_emission é bloqueado se já existe nota viva (autorizada|processando|pendente) — asaas-nfse/logic.ts:6,17-21 aplicado em index.ts:778-784
- Garantia dura de unicidade: índice único parcial uq_nfse_history_active_per_invoice; colisão 23505 devolve a nota vencedora — asaas-nfse/index.ts:1104-1107
- Validação de dados do cliente p/ NFS-e: e-mail + endereço + CEP de 8 dígitos obrigatórios (erro CLIENT_INCOMPLETE_DATA) — asaas-nfse/index.ts:232-243
- Cancelamento exige justificativa de 15 a 500 caracteres e bloqueia se já CANCELLED (409 ALREADY_CANCELLED) — asaas-nfse/index.ts:1789-1808
- Cancelamento de nota autorizada usa POST /invoices/{id}/cancel (não DELETE); 404 tratado como já cancelada; status *DENIED => erro 422 — asaas-nfse/index.ts:1852-1873
- Arquivamento é soft-delete (is_active=false) exigindo motivo >=5 chars; delete_record nunca apaga (retenção fiscal 7 anos) — asaas-nfse/index.ts:2104-2124
- Reemissão escala as retenções federais proporcionalmente ao novo valor e liga a nota nova à antiga via nfse_substituta_id — asaas-nfse/index.ts:547-552,585-590
- effective_date da (re)emissão = max(hoje, 1º dia da competência) — asaas-nfse/index.ts:554-558
- Auto-resolução em cascata do código de serviço municipal: contrato -> fatura->contrato -> nfse_history -> company_settings.nfse_codigo_tributacao_padrao — asaas-nfse/index.ts:915-987
- Match de código de serviço extrai o código do início do campo description do Asaas (regex /^(\d{2}\.\d{2}\.\d{2})/), pois a API não retorna campo code — asaas-nfse/index.ts:1025-1033
- normalizeServiceCode remove . espaço e - mas NÃO zeros à esquerda (010701 permanece) — asaas-nfse/index.ts:68-72
- Cálculo de retenções: ISS retido sobre base=valorServico-deduções; valorLiquido=serviço-desconto-totalRetenções — src/lib/nfse-retencoes.ts:47-63
- Webhook: idempotência por webhook_events (event+id) gravado ANTES de processar — webhook-asaas-nfse/index.ts:718-740
- Webhook auth (fail-closed): token via query/header/integration_settings.webhook_token; nega se sem WEBHOOK_SECRET_ASAAS — webhook-asaas-nfse/index.ts:76-113
- Webhook envia e-mail da NFS-e só na 1ª autorização (oldStatus !== 'autorizada') e só com pdf_url E xml_url gravados — webhook-asaas-nfse/index.ts:391-410
- Webhook PAYMENT pago cria financial_entry idempotente por invoice_id; PAYMENT_REFUNDED reverte com lançamento 'estorno' negativo sem apagar a receita original — webhook-asaas-nfse/index.ts:530-547,619-685
- send-nfse-notification bloqueia envio sem pdf_url E xml_url; signed URLs de 7 dias; consolida boleto/PIX no mesmo e-mail — send-nfse-notification/index.ts:111-145,195
- Certificado: aceita só .pfx/.p12 até 5MB; senha criptografada server-side (AES-256-GCM/PBKDF2 100k) antes de gravar — CertificateManager.tsx:218-229 + certificate-vault/index.ts:30-78
- parse-certificate seleciona o certificado end-entity (não-CA) via basicConstraints; isExpiringSoon <=15 dias — parse-certificate/index.ts:78-88,105

**Observações / riscos:**
- Duplicação de fonte de dados de certificado CONFIRMADA: CertificateManager grava na tabela 'certificates'; CertificateDashboardPage lê company_settings.certificado_* (nunca escritos) — o dashboard sempre mostra 'Não Configurado'. Unificar a fonte de verdade.
- Promessa não implementada: CertificateDashboardPage afirma 'verificação diária' e alertas de vencimento em 30/15/7 dias (linhas 343-355), mas não há edge/cron de expiração de certificado A1 (check-doc-expiries é para documentação de clientes).
- Cadeia de certificado é registro/monitoramento apenas: a emissão fiscal usa o certificado dentro do Asaas, então a senha criptografada (senha_hash) e a action 'decrypt' do certificate-vault são código morto de fato.
- config.toml só declara send-nfse-notification (verify_jwt=false). webhook-asaas-nfse NÃO está declarado — se o default da plataforma for verify_jwt=true, o webhook externo do Asaas seria barrado antes de verifyWebhookAuth. Confirmar o deploy/verify_jwt no Lovable (não checável por regra de somente-leitura).
- parse-certificate não faz verificação de auth/role interna (confia no verify_jwt default); asaas-nfse roda 100% com service_role sem validar JWT/role do chamador.
- Monólito: asaas-nfse/index.ts (3010 linhas) mistura NFS-e e cobrança (boleto/PIX) no mesmo arquivo — fere a regra de arquivos pequenos/foco único; candidato a split (nfse vs payments).
- Duas famílias de seletor de código de serviço convivem: src/components/nfse/ServiceCodeSelect+ServiceCodeForm (contratos/serviços/empresa) e src/components/billing/nfse/NfseServiceCodeCombobox (diálogos NFS-e). Ambas leem nfse_service_codes; possível consolidação.
- certificate-vault usa SUPABASE_SERVICE_ROLE_KEY como material de chave do PBKDF2 — rotação da service key quebraria a descriptografia de senhas já gravadas (embora 'decrypt' hoje seja morto).
- CertificateManager.deleteMutation faz DELETE físico do certificado + arquivo no storage (não anonimiza); aceitável pois não é registro financeiro/auditoria, mas contrasta com a política de anonimização do projeto.
- Divergência de guardas mantida de propósito: contrato ativo pode emitir NFS-e só no pagamento (nfse_service_code sem nfse_enabled) — unificar geraria decisão de negócio (cf. MAPA linha 388).

**Arquivos com uso parcial/incerto/nulo:**
- `supabase/functions/certificate-vault/index.ts` — parcial — Cripto server-side da senha do certificado (AES-256-GCM/PBKDF2 100k) — actions encrypt e decrypt. _(evid: só 'encrypt' é chamado (CertificateManager:302); 'decrypt' tem 0 callers)_
- `src/pages/settings/CertificateDashboardPage.tsx` — parcial — Dashboard de validade de certificados — porém lê company_settings.certificado_* (campos legados NÃO escritos pelo Manager). _(evid: rota /settings/certificates (AnimatedRoutes:184); lê tabela errada → mostra 'Não Configurado')_


### monitoring — Monitoramento e Servicos (RMM/UniFi/CheckMK)

Módulo MSP que agrega devices de 3 fontes externas (Tactical RMM, CheckMK, UniFi) em monitored_devices e gera monitoring_alerts com notificação multicanal. A tela /monitoring lê via React Query, dispara sync manual das edges e permite reconhecer alertas / abrir ticket. Estado: funcional mas com bugs reais confirmados (param controllerId vs controller_id na unifi-sync; realtime prometido mas inexistente na tela) e escopo misturado no MAPA (poll-services/ServiceForm/useServiceCodeUsageStats são financeiro, não RMM). Sync UniFi 'direct' on-prem roda por worker externo (relay-unifi.ts) via RPCs unifi_relay_*, não pela edge.

**Integrações:** Tactical RMM — REST X-API-KEY (settings.url/api_key em integration_settings 'tactical_rmm'); endpoints /clients/, /agents/, /agents/{id}/checks/, CheckMK — REST API 1.0 Bearer 'username secret' (integration_settings 'checkmk'); host_config/host/service/folder_config collections, UniFi — direct (cookie unifises via /api/login, /api/s/{site}/stat/device, /rest/alarm, /stat/health) e cloud (api.ui.com/v1 /hosts,/devices,/sites X-API-KEY); credenciais em unifi_controllers (password_encrypted/cloud_api_key_encrypted), UniFi OS on-prem — via relay-unifi.ts na tailnet (Tailscale), auth como relay-unifi@ + RPCs unifi_relay_* (Vault UNIFI_RELAY_PASSWORD), Notificação de alerta — Evolution API (WhatsApp), Telegram Bot, Resend (via send-email-resend); prefs em profiles/client_notification_rules; log em message_logs

**Fluxos (rota→componente→hook→edge→tabela):**
- /monitoring -> ProtectedRoute(requireStaff) -> MonitoringPage -> useQuery supabase.from('monitored_devices').select('*,clients(name)') e from('monitoring_alerts') status=active -> render abas Dispositivos/Alertas/Gráficos
- MonitoringPage 'Sincronizar' -> checa integration_settings/unifi_controllers is_active -> invoke checkmk-sync + tactical-rmm-sync + unifi-sync (action=sync) -> fetch APIs externas -> upsert monitored_devices + insert/resolve monitoring_alerts -> invalidateQueries
- Alertas -> GroupedAlertsTable: 'Reconhecer' -> update monitoring_alerts status=acknowledged/acknowledged_at (MonitoringPage:150-177); 'Ticket' -> navigate('/tickets?action=new&title=...&client_id=...')
- INSERT monitoring_alerts -> trigger notify_on_monitoring_alert (net.http_post) -> send-alert-notification -> notifications(in-app) + WhatsApp(evolution_api)/Telegram + send-email-resend (só critical/warning) + message_logs
- Settings/Integrações -> CheckMk/TacticalRmm ConfigForm -> invoke checkmk-sync/tactical-rmm-sync (test/sync); ClientMappingsTab salvar mapeamento -> invoke tactical-rmm-sync+checkmk-sync sync -> resolve client_id via client_external_mappings
- ClientNetworkTab (cliente) -> UnifiConfigForm -> invoke unifi-sync (test/list_sites/sync, method direct|cloud) -> monitored_devices/network_sites/network_topology/unifi_sync_logs; useUnifiedNetworkDevices mescla doc_devices+monitored_devices(unifi)
- relay-unifi.ts (LXC) -> auth password relay-unifi@ -> RPC unifi_relay_list_controllers (só direct/ativos) -> UniFi OS via Tailscale -> unifi_relay_upsert_device/post_alert/log_sync -> monitored_devices/network_sites/monitoring_alerts/unifi_sync_logs

**Regras de negócio:**
- CheckMK: host online sse state==0 (UP) — checkmk-sync/index.ts:51 isHostOnline
- CheckMK: mapeia estado de serviço -> nível de alerta (2=critical,1=warning,3=info) — checkmk-sync/index.ts:57 mapServiceStateToLevel
- CheckMK: device_type inferido por label cmk/device_type ou convenção de hostname — checkmk-sync/index.ts:29 detectDeviceType
- CheckMK: importa alerta conforme alert_levels (crit/warn default ON, unknown default OFF) — checkmk-sync/index.ts:299-302
- Tactical/CheckMK: só CRIA device novo se houver mapeamento de cliente (senão conta como 'unmapped') — tactical-rmm-sync:404 / checkmk-sync:454
- Tactical: nível do alerta offline = critical se agent.overdue_dashboard_alert, senão warning — tactical-rmm-sync/index.ts:386
- Tactical: ao voltar online resolve TODOS os alertas ativos do device (sem filtro de título) — tactical-rmm-sync/index.ts:393-400
- Tactical: métricas CPU/RAM/disk = média das últimas 10 leituras dos checks — tactical-rmm-sync/index.ts:300-330
- CheckMK dedup de alerta por device_id+status+title — checkmk-sync:400-406,431-437; Tactical dedup só por device_id+status — tactical-rmm-sync:372-377 (inconsistente)
- UniFi: severidade de alarme por conjuntos CRITICAL/WARNING_ALARMS — unifi-sync:29-45 mapAlarmSeverity; dedup por device_id+status+service_name — unifi-sync:678-684
- UniFi sync-all: só sincroniza controller se now-last_sync_at >= sync_interval_hours — unifi-sync/index.ts:1057-1062
- send-alert-notification: só processa payload type=INSERT e record.status=active — send-alert-notification/index.ts:233
- send-alert-notification: destinatários por client_notification_rules.notify_on_<level>; se vazio, fallback para todo staff (admin/manager/technician) — :266-279
- send-alert-notification: e-mail (Resend) só para critical/warning, nunca info — :354
- Relay: RPCs exigem is_staff(auth.uid()) e MAC obrigatório; post_alert só cria se não houver alerta ativo idêntico (device_id+status+service_name) — migration 20260601120000:117,121,208-217

**Observações / riscos:**
- BUG confirmado: MonitoringPage.tsx:220 envia { controllerId: ctrl.id } mas unifi-sync/index.ts:885 lê body.controller_id -> o id chega undefined e cada chamada por-controller cai no ramo 'sincroniza todos os controllers vencidos'; com N controllers = N execuções redundantes do sync-all (risco de corrida).
- Realtime enganoso: MonitoringPage.tsx:7 e :101 afirmam que o realtime é tratado por useUnifiedRealtime, mas o hook só assina 'tickets' e 'notifications' (useUnifiedRealtime.tsx:261,268,275). A tela de monitoramento NÃO atualiza em tempo real; a migration 20260119181153 adicionou monitored_devices à publicação supabase_realtime, mas não há consumidor no frontend.
- Duplicação de caminho 'direct' do UniFi: a edge unifi-sync trata connection_method='direct' (unifi-sync:558) E o relay-unifi.ts também trata direct (UniFi OS). A partir do Supabase cloud a edge dificilmente alcança controllers on-prem, então o relay é o caminho real — dois fluxos para o mesmo fim. Lógica de mapeamento (CRITICAL_ALARMS/WARNING_ALARMS/mapAlarmSeverity/mapDeviceType) está copiada entre unifi-sync/index.ts:29-53 e relay-unifi.ts:34-57.
- Dedup de alertas divergente entre fontes: tactical (device_id+status) vs checkmk (device_id+status+title) vs unifi (device_id+status+service_name). Em tactical, alertas de tipos diferentes podem se suprimir; e o resolve-on-online do tactical (sem filtro de título) fecha alertas de serviço alheios.
- tactical-rmm-sync não grava last_sync_at no controller/integração (apenas o front invalida cache); dificulta agendamento por intervalo como o unifi-sync faz.
- Config divergente: checkmk-sync e unifi-sync têm verify_jwt=false + CORS '*' (rodam com service role); tactical-rmm-sync NÃO está em config.toml (verify_jwt=true default). send-alert-notification também não está em config.toml — funciona porque o trigger DB envia SERVICE_ROLE_KEY como Bearer.
- Matching frágil em useUnifiedNetworkDevices.ts:93-107: casa doc_devices x monitored_devices por nome/MAC em lowercase; unifi_device_id é usado só como gate booleano (linha 93), não como chave de correlação — pode gerar match incorreto ou duplicado.
- UnifiConfigForm exige prop clientId (UnifiConfigForm.tsx:54) mas IntegrationsTab.tsx:99 o renderiza sem clientId -> query/insert com clientId undefined na aba Rede de /settings (uso correto é por-cliente em ClientNetworkTab).

**Arquivos com uso parcial/incerto/nulo:**
- `src/components/settings/integrations/UnifiConfigForm.tsx` — parcial — Config de controllers UniFi POR CLIENTE (direct/cloud), test/list_sites/sync _(evid: uso correto por-cliente em ClientNetworkTab.tsx:92; uso quebrado sem prop clientId em IntegrationsTab.tsx:99 (aba Rede))_
- `src/hooks/useUnifiedNetworkDevices.ts` — parcial — Mescla doc_devices + monitored_devices(unifi) de um cliente para a aba de rede da documentação _(evid: usado só por ClientNetworkTab.tsx:27 (módulo Clientes/Documentação, não a tela de monitoramento))_
- `src/hooks/useUnifiedRealtime.tsx` — parcial — Provider realtime global (canal unified-realtime) _(evid: App.tsx; assina APENAS tickets (INSERT/UPDATE) e notifications (useUnifiedRealtime.tsx:261,268,275) — NÃO assina monitored_devices/monitoring_alerts, apesar de MonitoringPage afirmar o contrário)_


### notifications — Notificacoes e Comunicacao

Módulo saudável e amplamente usado. As 8 edge functions são primitivas de transporte (send-email-resend, send-push-notification, send-whatsapp, send-telegram, validate-whatsapp) e webhooks de status (resend/telegram/whatsapp), orquestradas por ~17 funções de negócio (send-ticket-notification, notify-sla-breach, notify-due-invoices, send-nfse-notification, etc.). O frontend cobre in-app (useNotifications+NotificationDropdown), Web Push nativo (usePushNotifications+sw-push.js) e preferências de canal (NotificationSettings). Achado principal: os 3 webhooks de status não estão em config.toml (herdam verify_jwt=true) e provavelmente rejeitam os provedores externos com 401; webhook-telegram-status é stub e send-telegram não grava message_logs. A edge "send-notification" citada nos docs NÃO existe no repositório.

**Integrações:** Resend (e-mail) — RESEND_API_KEY, RESEND_WEBHOOK_SECRET, integration_settings(resend: default_from_name/email); saída send-email-resend, entrada webhook-resend-status (Svix), Evolution API (WhatsApp) — integration_settings(evolution_api: api_url/api_key/instance_name), WEBHOOK_SECRET_WHATSAPP; send-whatsapp/validate-whatsapp, entrada webhook-whatsapp-status, Telegram Bot API — integration_settings(telegram: bot_token/default_chat_id), WEBHOOK_SECRET_TELEGRAM; send-telegram, entrada webhook-telegram-status (stub), Web Push (VAPID) — VAPID_PRIVATE_KEY (backend) + chave pública fixa no frontend/edge; push_subscriptions; sw-push.js, Tabelas: notifications (in-app), message_logs (e-mail/whatsapp), push_subscriptions, suppressed_emails, webhook_events, audit_logs, integration_settings, email_settings/company_settings/email_templates

**Fluxos (rota→componente→hook→edge→tabela):**
- IN-APP (leitura): AppLayout -> NotificationDropdown -> useNotifications -> SELECT/UPDATE/DELETE notifications (realtime via useUnifiedRealtime)
- IN-APP (escrita): edges orquestradoras (send-alert-notification:307, notify-sla-breach:143/260, notify-due-invoices:353, check-no-contact-tickets:154/228, webhook-asaas-nfse:179, generate-monthly-invoices:1123, apply-contract-adjustment:151) -> INSERT notifications
- WEB PUSH: ProfilePage -> NotificationSettings (Testar Push) -> invoke send-push-notification -> SELECT push_subscriptions (por user_ids/role_filter) -> POST endpoint push (VAPID) -> sw-push.js exibe; subscribe/unsubscribe via usePushNotifications -> push_subscriptions
- EMAIL (saída): edge consumidora monta HTML (email-helpers) -> invoke send-email-resend -> filtra .internal/suppressed_emails -> POST api.resend.com/emails -> INSERT message_logs (sent/failed/external_message_id)
- EMAIL (entrada): Resend/Svix -> webhook-resend-status -> valida HMAC + dedup webhook_events -> UPDATE message_logs (delivered/read/failed) + upsert suppressed_emails
- WHATSAPP (saída): edge/ConfigForm -> invoke send-whatsapp -> integration_settings(evolution_api) -> POST /message/sendText/{instance} -> message_logs (se userId)
- WHATSAPP (validação): ClientForm -> invoke validate-whatsapp -> POST /chat/whatsappNumbers -> {valid,exists,jid}
- WHATSAPP (entrada): Evolution -> webhook-whatsapp-status -> UPDATE message_logs (delivered_at/read_at) + audit_logs
- TELEGRAM (saída): edge/TelegramConfigForm -> invoke send-telegram -> integration_settings(telegram) -> POST api.telegram.org/bot<token>/sendMessage (sem message_logs)
- TELEGRAM (entrada): Telegram -> webhook-telegram-status -> valida segredo -> INSERT audit_logs (stub, sem processamento)

**Regras de negócio:**
- Supressão de e-mail: descarta placeholders '.internal' e endereços em suppressed_emails (hard bounce/spam); bloqueados são logados como 'failed' (constraint não tem 'suppressed') — send-email-resend/index.ts:177,180-201,190
- Retorno 200 'skipped' quando todos os destinatários são inelegíveis — send-email-resend/index.ts:204-209
- Rate-limit e-mail 10 req/s por IP (429) — send-email-resend/index.ts:56-70,96
- Sanitização de HTML (remove script/on*/javascript:/iframe/embed) e limites (subject 200, html 50000, 50 destinatários) — send-email-resend/index.ts:4-7,43-53
- Resend webhook fail-closed sem RESEND_WEBHOOK_SECRET; valida assinatura Svix HMAC-SHA256 — webhook-resend-status/index.ts:47-51,67-85
- Idempotência do webhook Resend por svix-id em webhook_events (at-least-once) — webhook-resend-status/index.ts:152-167,228-234
- Status só avança (STATUS_RANK), nunca regride; failed(bounce/complaint) sempre aplica — webhook-resend-status/index.ts:105-113,179-206
- Bounce/complaint alimentam suppressed_emails (upsert por email) — webhook-resend-status/index.ts:210-225
- WhatsApp: telefone válido 10-15 dígitos; mensagem truncada em 4096 — send-whatsapp/index.ts:129-135,138
- WhatsApp: retry 3x com delays [0,3000,10000]ms apenas em 5xx/rede; grava message_logs só se userId — send-whatsapp/index.ts:153-194,228-241
- validate-whatsapp: prefixa 55 se ausente e valida 12-13 dígitos — validate-whatsapp/index.ts:98-112
- Push: remove subscriptions apenas em 404/410 (gone), não em outros erros — send-push-notification/index.ts:341,481-493
- Push: alvo por user_ids ou role_filter (via user_roles); defaults/ações por tipo (ticket/alert/sla/test) — send-push-notification/index.ts:381-394,424-452
- Push re-sync: se o browser tem subscription mas o DB não, faz upsert em push_subscriptions — usePushNotifications.ts:108-127
- webhook-whatsapp-status mapeia ACK Evolution -> status message_logs (delivered_at/read_at) — webhook-whatsapp-status/index.ts:89-106
- Telegram: fallback para default_chat_id e parse_mode Markdown — send-telegram/index.ts:63,65
- Preferências locais (notify_push/notify_sound/alert_*) persistidas em localStorage; canais (email/whatsapp/telegram + números) no perfil/DB — ProfilePage.tsx:44 vs NotificationSettings.tsx:44-50

**Observações / riscos:**
- RISCO ALTO (confirmado no código): webhook-resend-status, webhook-telegram-status e webhook-whatsapp-status não estão em supabase/config.toml -> herdam verify_jwt=true. Provedores externos (Svix/Resend, Evolution, Telegram) não enviam JWT Supabase -> 401 no gateway antes da validação HMAC interna. Consequência: status delivered/read/bounce e alimentação de suppressed_emails via webhook podem nunca ocorrer. Só send-whatsapp tem verify_jwt=false entre as edges do módulo. (Não corrigível por mim: config.toml/deploy fora do escopo somente-leitura.)
- Chave VAPID pública duplicada e hardcoded em usePushNotifications.ts:9 e send-push-notification/index.ts:10 — duas fontes; se rotacionar uma sem a outra, o push quebra silenciosamente.
- send-telegram não grava message_logs (nem external_message_id) e webhook-telegram-status é stub -> canal Telegram fica sem rastreamento de entrega, ao contrário de email/whatsapp.
- Inconsistência menor: validate-whatsapp usa .single() em integration_settings (erro se 0 linhas) enquanto send-whatsapp usa .maybeSingle().
- corsHeaders é redefinido inline em quase todas as edges do módulo em vez de importar o de _shared/email-helpers.ts (que já exporta um mais completo) — pequena duplicação.
- send-push-notification e send-telegram usam import antigo std@0.168.0/http/server (serve) enquanto send-email-resend usa Deno.serve; validate-whatsapp usa std@0.190.0 — versões de runtime divergentes entre funções irmãs.
- message_logs constraint de status não inclui 'suppressed' (marcada com comentário ponytail em send-email-resend:190); e webhook-resend-status grava status 'read' em email.opened, colidindo semanticamente com 'read' de WhatsApp — ambos convivem no mesmo enum.

**Arquivos com uso parcial/incerto/nulo:**
- `supabase/functions/webhook-resend-status/index.ts` — parcial — Webhook de status Resend: valida Svix HMAC (fail-closed), dedup por svix-id em webhook_events, avança status sem regressão em message_logs, alimenta suppressed_emails em bounce/complaint. _(evid: endpoint externo (sem caller no código); AUSENTE de config.toml -> verify_jwt=true provavelmente bloqueia o provedor com 401)_
- `supabase/functions/webhook-telegram-status/index.ts` — parcial — Webhook Telegram: valida X-Webhook-Secret/HMAC (fail-closed) e grava audit_logs. Stub — não atualiza message_logs (Telegram sem read receipts). _(evid: endpoint externo; AUSENTE de config.toml -> verify_jwt=true; efetivamente no-op funcional)_
- `supabase/functions/webhook-whatsapp-status/index.ts` — parcial — Webhook Evolution: mapeia ACKs PENDING/SERVER_ACK/DELIVERY_ACK/READ/PLAYED -> UPDATE message_logs (delivered_at/read_at) + audit_logs. _(evid: endpoint externo; AUSENTE de config.toml -> verify_jwt=true provavelmente bloqueia Evolution com 401)_
- `supabase/functions/_shared/notification-logger.ts` — parcial — logInvoiceNotification -> insere em invoice_notification_logs (escopo faturamento, não deste módulo). _(evid: 3 importers no grafo, todos de faturamento; nenhum das 8 edges deste módulo o usa)_


### calendar — Calendario e Agendamento

Agenda interna funcional: CRUD de calendar_events feito 100% direto no Postgres via supabase-js (RLS por user_id), renderizado com FullCalendar. A integração Google Calendar está half-wired: o form de config gera a URL OAuth (action auth_url) e redireciona ao Google, mas NENHUM handler captura o ?code de volta em /settings nem chama a action callback — os tokens nunca são trocados/salvos. As actions sync_event/delete_event da edge existem porém nenhuma tela as invoca, então a sincronização é código morto na prática (CRUD não pluga na edge). Enum billing_reminder e coluna invoice_id são artefatos abandonados (nunca escritos).

**Integrações:** Google Calendar API v3 via OAuth2 (edge google-calendar): auth_url funcional; callback/sync_event/delete_event implementados porém NUNCA invocados pelo app., integration_settings(integration_type='google_calendar'): client_id/secret/redirect_uri, lido pela edge e pelo useIntegrationSettings no form., google_calendar_integrations: tokens por usuário (RLS owner) — escrito só no callback (morto); lido/deletado direto pelo GoogleCalendarConfigForm (checar conexão / desconectar)., FullCalendar (@fullcalendar/react + daygrid/timegrid/list/interaction) — render e interação da agenda interna.

**Fluxos (rota→componente→hook→edge→tabela):**
- /calendar -> ProtectedRoute(requireStaff) -> CalendarPage -> useQuery('calendar_events') select *,clients(name) por range (RLS user_id) -> FullCalendarWrapper (render)
- CalendarPage 'Novo Evento'/dateClick -> EventForm.submit -> supabase.from('calendar_events').insert (direto, user_id=auth) -> invalidate ['calendar-events']
- CalendarPage drag/drop/resize -> updateEventMutation -> update calendar_events(start_time,end_time) (editable sempre true, sem gate de permissão)
- EventDetailsSheet (bottom sheet) -> deleteMutation -> delete calendar_events by id (direto)
- /settings -> IntegrationsTab -> GoogleCalendarConfigForm 'Conectar' -> invoke('google-calendar', action:auth_url) -> redirect accounts.google.com -> volta /settings?code=&state=user_id -> [SEM handler: ?code ignorado, callback nunca chamado] -> tokens não salvos
- GoogleCalendarConfigForm mount -> select google_calendar_integrations by user_id (checa conexão) / 'Desconectar' -> delete google_calendar_integrations (direto)
- TechnicianDashboard -> useQuery('today-events') select calendar_events por user_id/dia (leitor separado do módulo, read-only)

**Regras de negócio:**
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

**Observações / riscos:**
- Integração Google Calendar está efetivamente NÃO-FUNCIONAL de ponta a ponta: sem handler de ?code em /settings, o OAuth nunca completa (tokens não salvos), então mesmo que sync_event fosse chamado não haveria integração. É a maior lacuna do módulo.
- CRUD totalmente desacoplado da sincronização: insert/update/delete escrevem direto em calendar_events e nunca disparam sync_event/delete_event -> Google nunca reflete mudanças (por design atual, mas provavelmente não intencional).
- Não há fluxo de EDIÇÃO de evento: EventForm é insert-only e onEdit nunca é passado; usuário só cria, arrasta/redimensiona ou exclui.
- supabase/functions/google-calendar viola a convenção §6.6 do CLAUDE.md: sem logic.ts e sem testes (*_test.ts); usa `error: any` (index.ts:306).
- Segurança: sync_event/delete_event usam service role e confiam no user_id vindo do body sem checar contra o JWT autenticado — qualquer usuário logado poderia operar eventos de outro user_id caso as actions fossem expostas.
- Bug potencial no drag/drop de evento all-day: se end for null, força +1h (FullCalendarWrapper.tsx:116-118), o que descaracteriza o all_day ao gravar.
- Artefatos mortos acumulados (billing_reminder, invoice_id, google_event_id/calendar_id, sync_enabled) inflam o schema/tipos sem uso — candidatos a limpeza (regra do escoteiro).

**Arquivos com uso parcial/incerto/nulo:**
- `src/components/calendar/EventDetailsSheet.tsx` — parcial — Bottom-sheet de detalhes do evento com botão excluir (delete direto) e botão Editar condicional a onEdit. _(evid: renderizado em CalendarPage.tsx:233 mas SEM prop onEdit -> botão Editar nunca aparece)_
- `supabase/functions/google-calendar/index.ts` — parcial — Edge Deno com 4 actions: auth_url (gera URL OAuth), callback (troca code por token), sync_event (cria/atualiza evento no Google), delete_event (remove no Google). _(evid: apenas action auth_url é invocada (GoogleCalendarConfigForm.tsx:55); callback/sync_event/delete_event sem callers em src/**)_


### inventory — Inventario

Módulo de inventário de TI: gerencia ativos (assets) e licenças de software (software_licenses, com mascaramento de chave via view segura + RPC get_license_key admin-only auditada) e uma aba "Visão Geral" que agrega monitoramento (dispositivos online/offline, alertas, licenças a vencer). Todos os arquivos do escopo estão em uso e roteados. Estado geral: FUNCIONAL exceto a aba "Licenças", que tem um BUG CRÍTICO de runtime — o select da view software_licenses_safe pede colunas inexistentes (license_key, max_activations, current_activations, status), o que quebra a query no PostgREST. O MAPA_DE_SETORES.md do módulo está incomum e notavelmente preciso (já documenta o bug), mas as correções continuam pendentes no código.

**Integrações:** Supabase PostgREST direto (assets, software_licenses, software_licenses_safe, clients, monitored_devices, monitoring_alerts), RPC get_license_key (SECURITY DEFINER, admin-only, grava audit_logs), Módulo Clientes: DocDeviceLinkDialog vincula ativo a doc_devices; useClientBranchOptions (filiais), Módulo Tickets: deep-link /tickets?action=new a partir de dispositivo offline/alerta, Módulo Monitoramento: InventoryOverview consome monitored_devices/monitoring_alerts; MonitoringPage invoca edge functions checkmk-sync / tactical-rmm-sync / unifi-sync, Auth/Permissões: PermissionGate module='inventory' (create/edit/delete); rota /inventory protegida por requireStaff

**Fluxos (rota→componente→hook→edge→tabela):**
- /inventory -> InventoryPage (aba Ativos) -> AssetForm -> supabase.from('assets') insert/update; ao criar -> DocDeviceLinkDialog -> doc_devices
- /inventory -> InventoryPage (aba Licenças) -> useQuery software_licenses_safe (view) [QUERY QUEBRADA: colunas inexistentes] + deleteLicenseMutation software_licenses; LicenseForm -> insert/update software_licenses; botão Revelar -> supabase.rpc('get_license_key') -> audit_logs (LICENSE_KEY_ACCESS)
- /inventory -> InventoryPage (aba Visão Geral) -> InventoryOverview -> monitored_devices + monitoring_alerts + software_licenses (tabela base); Reconhecer -> update monitoring_alerts.status='acknowledged'; Abrir Ticket -> navigate('/tickets?action=new&...')
- /monitoring -> MonitoringPage -> monitored_devices + monitoring_alerts; Sincronizar -> supabase.functions.invoke('checkmk-sync' | 'tactical-rmm-sync' | 'unifi-sync')

**Regras de negócio:**
- get_license_key é SECURITY DEFINER, admin-only (RAISE EXCEPTION se não-admin) e grava audit_logs LICENSE_KEY_ACCESS — supabase/migrations/20260129235822_...sql:144,153; consumido em src/components/inventory/LicenseForm.tsx:141
- Chave de licença nunca é pré-preenchida no form e só é enviada no update se explicitamente alterada (keyChanged) — src/components/inventory/LicenseForm.tsx:104,183-189
- Validação: used_licenses <= total_licenses — src/components/inventory/LicenseForm.tsx:45-50
- Validação: expire_date >= purchase_date quando ambos presentes — src/components/inventory/LicenseForm.tsx:51-62
- Licenças 'a vencer' = expire_date entre agora e +30 dias — src/components/inventory/InventoryOverview.tsx:99-100,162-168
- View software_licenses_safe mascara license_key ('****'+últimos 4) com security_invoker — supabase/migrations/20260204131545_...sql:26-29
- Rascunho do LicenseForm exclui license_key da persistência — src/components/inventory/LicenseForm.tsx:119
- Deep-link de ticket (offline/alerta) pré-preenche e usa priority=high — src/components/inventory/InventoryOverview.tsx:336-343

**Observações / riscos:**
- BUG CRÍTICO CONFIRMADO (runtime): InventoryPage.tsx:138-139 seleciona colunas inexistentes na view software_licenses_safe (license_key, max_activations, current_activations, status) — a aba Licenças quebra com erro PostgREST. As colunas corretas seriam total_licenses, used_licenses, license_key_masked, purchase_date, purchase_value, notes (ver migration 20260204131545 e types.ts:6826).
- Redundância: gestão de ativos duplicada entre src/components/inventory/AssetForm.tsx e src/components/clients/ClientAssetsList.tsx (schema/form/insert próprios) — viola 'uma única fonte de verdade' do CLAUDE.md §6.0.2.
- AssetForm.tsx:210-216: Select de tipo não oferece 'software' nem 'license' embora estejam no enum asset_type — não é possível criar/editar esses tipos por aqui (o label existe em InventoryPage.tsx:81-82).
- InventoryOverview.acknowledgeMutation (InventoryOverview.tsx:178-191) não tem onError; forms de asset/license não invalidam a query ['inventory-counters'], então os cards da Visão Geral ficam defasados após criar/editar.
- Aba 'Garantias' (InventoryPage.tsx:483-490) é placeholder estático.
- Cast desnecessário de ip_address em AssetForm.tsx:67 (coluna já tipada em types.ts:196).
- deleteLicenseMutation (InventoryPage.tsx:194-207) faz DELETE direto sem tratar possível FK (ex.: license_assets) — falha cai só no toast onError.
- Duplicação da contagem de licenças a vencer: calculada no counter (InventoryOverview.tsx:96-100) e de novo na query expiringLicenses (L162-168), com a mesma janela de 30 dias.
- MonitoringPage.tsx pertence ao módulo Monitoramento (separado); foi incluído por adjacência ao escopo 'visão geral de monitoramento', que na prática é a aba InventoryOverview.


### knowledge — Base de Conhecimento

Módulo 100% frontend (nenhuma edge function dedicada): staff cria/edita/fixa/categoriza artigos Markdown com upload de imagem; usuários buscam, leem (com views/feedback/TOC/relacionados) e navegam por categorias. Alimenta sugestões na abertura de chamados via KBSuggestions. Acesso ao banco é direto pelo supabase-js com RLS. Todos os 12 arquivos do escopo estão em uso; a dívida real é UI morta (Compartilhar/relacionados/⌘K), RPC ausente (increment_article_views) e renderer Markdown caseiro com risco de XSS e filtro .or() sem escaping.

**Integrações:** Supabase Postgres + RLS via supabase-js direto (sem edge function): tabelas knowledge_articles, knowledge_categories, article_feedback, ticket_categories, Supabase Storage bucket público 'knowledge-images' (upload/getPublicUrl) — MarkdownEditor.tsx:127-135, Supabase RPC increment_article_views (referenciada mas ausente — sempre fallback) — ArticleViewer.tsx:66, Trigger/função DB generate_slug (usa unaccent) para slug de artigo — supabase/migrations/20260309...,20260414..., Módulo de Chamados: KBSuggestions embutido em TicketForm/ClientTicketForm; artigos gerados por TicketResolveDialog

**Fluxos (rota→componente→hook→edge→tabela):**
- /knowledge -> KnowledgePage -> KnowledgeHero(busca)/KnowledgeCategoryGrid/KnowledgePinnedCarousel/KnowledgeArticleList -> useQuery supabase.from('knowledge_articles').or(ilike title/content) + knowledge_categories -> tabelas knowledge_articles, knowledge_categories, ticket_categories(join legado)
- /knowledge (abrir artigo no Sheet) -> KnowledgePage -> ArticleViewer -> MarkdownPreviewRenderer + ArticleTableOfContents + ArticleFeedback; rpc increment_article_views (fallback update knowledge_articles) e upsert article_feedback -> tabelas knowledge_articles, article_feedback
- /knowledge/:slug -> KnowledgeArticlePage -> supabase.from('knowledge_articles').eq('slug').maybeSingle() (fallback eq id) -> ArticleViewer -> knowledge_articles
- /knowledge (Novo/Editar) -> KnowledgePage Dialog -> ArticleForm -> MarkdownEditor (upload storage 'knowledge-images') -> insert/update knowledge_articles (trigger generate_slug via unaccent)
- TicketForm(external)/ClientTicketForm -> KBSuggestions(title,description) -> supabase.from('knowledge_articles').or(ilike palavras).eq('is_public',true).order(views).limit(4) -> link <a href=/knowledge/:slug> (rota requireStaff)
- TicketResolveDialog -> insert knowledge_articles (artigo gerado ao resolver chamado) -> knowledge_articles [relacionado, fora do escopo primário]

**Regras de negócio:**
- Busca por título+conteúdo via or(title.ilike,%q%,content.ilike,%q%) — KnowledgePage.tsx:59
- Debounce de busca 300ms na listagem — KnowledgePage.tsx:48
- Ordenação client-side recent/popular(views)/helpful(helpful_count)/alphabetical(pt-BR) — KnowledgePage.tsx:76-90
- Lookup de artigo por slug primeiro, fallback por id (retrocompat) — KnowledgeArticlePage.tsx:26-46
- Feedback UNIQUE por (article_id,user_id): update se já votou, senão insert — ArticleFeedback.tsx:54-67
- Feedback exige usuário logado — ArticleFeedback.tsx:43-45
- Incremento de views idempotente por render (uma vez por article.id via ref) — ArticleViewer.tsx:83-88
- Views: tenta RPC atômica, cai em update não-atômico no catch — ArticleViewer.tsx:63-77
- Tempo de leitura = ceil(palavras/200), mínimo 1 — ArticleViewer.tsx:36-39
- Validação Zod: título 5-255, conteúdo 20-50000, resumo <=300, is_public default true — ArticleForm.tsx:35-47
- Tags: máx 10, lowercase, dedupe, Enter/vírgula adiciona — ArticleForm.tsx:145-162
- Rascunho persistido em sessionStorage só em artigo novo — ArticleForm.tsx:76-81
- Upload de imagem: só image/*, máx 5MB, bucket knowledge-images, insere Markdown com URL pública — MarkdownEditor.tsx:110-137
- KBSuggestions: só dispara com texto >=10 chars, palavras >3 chars (máx 6), só is_public, order views desc, limit 4, debounce 800ms — KBSuggestions.tsx:15-49
- KBSuggestions só é renderizado em chamado 'external' no TicketForm — TicketForm.tsx:402
- Category grid só is_active, ordenado por order_index — KnowledgeCategoryGrid.tsx:33-34
- Fixados: is_pinned=true, order_index, limit 6 — KnowledgePinnedCarousel.tsx:26-28
- TOC só renderiza com >=2 headings — ArticleTableOfContents.tsx:70
- Permissões UI: PermissionGate module='knowledge' create/edit/delete — KnowledgePage.tsx:139 e KnowledgeArticleList.tsx:191,203

**Observações / riscos:**
- XSS: MarkdownPreviewRenderer é parser caseiro por regex e injeta href/src sem sanitização/allowlist — permite javascript:/data: (MarkdownPreviewRenderer.tsx:171-176 links, :133-137/:49-52 imagens). Considerar react-markdown+rehype-sanitize ou DOMPurify.
- Injeção em filtro: KnowledgePage.tsx:59 e KBSuggestions.tsx:33-35 interpolam o termo direto no .or() do PostgREST sem escapar vírgula/parêntese/% — quebra ou altera a query com esses caracteres.
- Race condition em views: RPC ausente força update read-modify-write não-atômico (ArticleViewer.tsx:71-75), perdendo incrementos concorrentes.
- excerpt/calculateReadingTime usam replace(/<[^>]*>/g) para 'limpar HTML', mas o conteúdo é Markdown, não HTML — limpeza inócua (KnowledgeArticleList.tsx:111, ArticleViewer.tsx:37).
- UI morta acumulada: Compartilhar, cards relacionados, ⌘K e not_helpful_count (ver candidatosMortos) — dívida de escoteiro a remover ou implementar.
- KnowledgeArticlePage/rota /knowledge/:slug só é alcançada por URL direta, copiar-link ou link de KBSuggestion; dentro do app a leitura acontece em Sheet (setViewingArticle), sem navegação de rota.
- IDs de heading no TOC e no renderer são derivados independentemente (mesma fórmula heading-{index}-{slug}) — acoplamento frágil por convenção duplicada entre ArticleTableOfContents.tsx:34 e MarkdownPreviewRenderer.tsx:67/75/83; qualquer mudança numa fórmula quebra o scroll.


### reports — Relatorios, Dashboards e Exportacao

Camada puramente analitica/apresentacional: sem edge functions proprias, consome RPCs agregadoras (get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_weekly_ticket_trend, get_additional_charges_report, get_client_management_report) e queries count/select diretas, renderizando com recharts. Cobre Dashboard da home (com branch por role), pagina de Relatorios em abas, TV Dashboard rotativo e relatorio gerencial por cliente. Estado geral: funcional e bem cabeado nas rotas/sidebar; ha codigo morto real em src/lib/export.ts (exportConfigs e formatters, 0 refs), um bug latente de tipos nao declarados em AdditionalChargesReportTab, e prop/imports mortos menores.

**Integrações:** Nenhuma integracao externa direta no modulo (recharts/date-fns/framer-motion sao UI/render client-side), Supabase client (queries diretas) + RPCs Postgres SECURITY DEFINER: get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_weekly_ticket_trend, get_additional_charges_report, get_client_management_report (todas presentes em types.ts L6984-7023), Exportacao 100% client-side via Blob/URL.createObjectURL (sem edge function): src/lib/export.ts

**Fluxos (rota→componente→hook→edge→tabela):**
- /reports (roles admin,manager,financial) -> ReportsPage -> RPC get_ticket_report_stats + get_invoice_report_stats + get_technician_ranking -> tabelas tickets/invoices/technician_points; aba Horas -> TimeReportTab -> query ticket_time_entries(+tickets,clients,profiles); aba Adicionais -> AdditionalChargesReportTab -> RPC get_additional_charges_report
- / (ProtectedRoute) -> Dashboard -> branch por role: technician->TechnicianDashboard (tickets/monitoring_alerts/calendar_events), financial->FinancialDashboard (invoices/nfse_history); admin -> queries diretas tickets/clients/ticket_ratings + RPC get_weekly_ticket_trend + charts (SLA/Priority/Status/Weekly) + ActivityFeed(ticket_history) + TechnicianMiniRanking(RPC get_technician_ranking, gated feature flag)
- /tv-dashboard (roles admin,manager) -> TVDashboardPage -> queries diretas tickets/monitored_devices + RPC get_technician_ranking (agrega/calcula avg response em JS)
- /clients/:id -> ClientDetailPage -> ClientManagementReport -> RPC get_client_management_report -> ExportButton -> export.ts (exportToCSV/Excel/JSON via Blob)
- TimeReportTab/ClientManagementReport -> ExportButton -> export.ts exportToCSV/exportToExcel/exportToJSON -> download client-side (sem backend)

**Regras de negócio:**
- Usuario client puro e redirecionado para /portal (nao ve Dashboard staff): Dashboard.tsx:40-44
- View do Dashboard por role: technician-only -> TechnicianDashboard, financial-only -> FinancialDashboard: Dashboard.tsx:237-242
- KPIs adminOnly (SLA violado, tempo medio resp, CSAT) filtrados para nao-admin: Dashboard.tsx:235
- CSAT = media de ticket_ratings.rating * 20 (escala 1-5 -> 0-100%): Dashboard.tsx:126
- SLA compliance calculado no cliente (resolved_at<=deadline, ou em aberto vs now): Dashboard.tsx:149-158
- Taxa de resolucao = (resolved+closed)/total*100: Dashboard.tsx:76-78
- Cores do % SLA por faixa (>=90 success, >=70 warning, senao destructive): SLAComplianceChart.tsx:22-26
- Export CSV escapa aspas e envolve valores com virgula/aspas; adiciona BOM ﻿: export.ts:16-18,51
- ExportButton desabilita quando data.length===0: ExportButton.tsx:27
- Fatura vencida = status overdue OU (pending com due_date < hoje): FinancialDashboard.tsx:57
- TVDashboard: auto-rotate slides 15s, auto-scroll fila de chamados 5s: TVDashboardPage.tsx:33-47
- TVDashboard: tempo medio de resposta calculado em JS sobre ate 200 tickets dos ultimos 7 dias: TVDashboardPage.tsx:117-139
- TimeReportTab: split faturavel/nao-faturavel por is_billable: TimeReportTab.tsx:133-138
- TimeReportTab: tabela mostra so 50 registros, export inclui todos: TimeReportTab.tsx:401,432-435
- TechnicianMiniRanking so renderiza se feature flag gamification_enabled ativo: TechnicianMiniRanking.tsx:18,33
- Candidatos a contrato = clientes com 3+ notas avulsas no periodo (texto/render): AdditionalChargesReportTab.tsx:91-93

**Observações / riscos:**
- BUG latente confirmado: AdditionalChargesReportTab.tsx usa os tipos AdditionalChargesReportTabProps (L15) e ReportData (L26) sem declara-los nem importa-los — passa no build so porque nao ha type-check (tsc --noEmit).
- export.ts:29-41 exportToExcel gera TSV sem escapar tabs/quebras e sem protecao contra CSV/formula injection (=,+,-,@) — risco em CSV/Excel.
- Duplicacao de logica: ranking de tecnicos consumido em 3 lugares (ReportsPage, TVDashboardPage, TechnicianMiniRanking) via a mesma RPC; formatacao de moeda em >=3 caminhos (lib/currency, Intl inline em ClientManagementReport L120-121 e export formatters).
- Inconsistencia de calculo de SLA: client-side no Dashboard/SLAComplianceChart vs percentage vindo da RPC em ClientManagementReport — 3 telas podem divergir numericamente.
- TVDashboardPage ordena priority como string (order priority ascending, L80) e usa casts frageis (ticket as Record<string,unknown>) L354-356.
- Limites .limit(200/500) em Dashboard/TVDashboard truncam metricas silenciosamente sob alto volume (ex.: avg response, SLA, priority).
- ClientManagementReport, embora fisicamente em src/components/reports/, so e consumido pelo setor Clientes (ClientDetailPage), nao pelas paginas de Relatorios.

**Arquivos com uso parcial/incerto/nulo:**
- `src/lib/export.ts` — parcial — Utilitarios de export client-side (CSV/Excel-TSV/JSON via Blob) + configs e formatters _(evid: exportToCSV/Excel/JSON usados por ExportButton; exportConfigs e formatters com 0 refs)_


### gamification — Gamificacao

Módulo puramente de leitura: uma página (/gamification) mostra ranking de técnicos por pontos (RPC get_technician_ranking), catálogo de badges e metas ativas, mais um widget mini-ranking no Dashboard. A ÚNICA escrita de pontos está fora do módulo, em TicketRatingDialog (avaliação do cliente >=4 estrelas insere em technician_points). Não há edge function dedicada. O módulo está inteiro por trás da feature flag gamification_enabled (default false), então na prática está dormente: a rota redireciona para "/" e o widget/sidebar somem. Contém código morto/decorativo relevante (mapa de ícones que nunca casa, progresso de metas fixo em 0, tabela technician_badges sem uso).

**Integrações:** Nenhuma integração externa (sem edge function, webhook ou API de terceiros no módulo)., RPC compartilhada get_technician_ranking também consumida fora do escopo: src/pages/tv-dashboard/TVDashboardPage.tsx:97 e src/pages/reports/ReportsPage.tsx:116., Feature flag gamification_enabled (sistema feature_flags + useFeatureFlag) governa toda a visibilidade — CHANGELOG.md:703.

**Fluxos (rota→componente→hook→edge→tabela):**
- /gamification → ProtectedRoute(requireStaff) → GamificationGuard(useFeatureFlag gamification_enabled) → GamificationPage → useQuery rpc('get_technician_ranking', start=epoch, limit=10) → technician_points JOIN profiles (SECURITY DEFINER, ORDER points DESC)
- GamificationPage → from('badges').select(id,name,icon,description) → tabela badges (catálogo global, sem relação com técnico)
- GamificationPage → from('gamification_goals').eq(is_active,true) → tabela gamification_goals (progresso não calculado, sempre 0)
- Dashboard {isAdmin && ...} → TechnicianMiniRanking(startDate=periodStart) → useFeatureFlag gamification_enabled → rpc('get_technician_ranking', start=periodStart, limit=5) → technician_points JOIN profiles → Link '/gamification'
- ESCRITA (fora do módulo): Portal do cliente → TicketRatingDialog (rating>=4) → busca tickets.assigned_to → insert technician_points{user_id, points(5★=15|4★=10), reason, ticket_id} → alimenta o ranking

**Regras de negócio:**
- Pontos por avaliação: só rating>=4 pontua; 5★=15 pts, 4★=10 pts, atribuídos ao tickets.assigned_to — src/components/tickets/TicketRatingDialog.tsx:73,81-87
- Insert de technician_points sem checagem de erro (await solto, sem throw) — src/components/tickets/TicketRatingDialog.tsx:82
- Níveis por faixa de pontos: bronze 0-500, prata 501-1500, ouro 1501-3500, platina 3501-7000, diamante 7001+ — src/pages/gamification/GamificationPage.tsx:21-27 (getLevel L78-84 duplica os limiares)
- Barra de progresso de nível = (points-min)/(max-min)*100, teto 100, diamante sempre 100 — src/pages/gamification/GamificationPage.tsx:86-92
- Ranking da página é all-time (start_date = new Date(0) epoch), top 10 — src/pages/gamification/GamificationPage.tsx:42-43
- Mini-ranking do Dashboard usa o período do dashboard (startDate) e top 5, barras normalizadas pelo 1º colocado — src/components/dashboard/TechnicianMiniRanking.tsx:25,35,101
- RPC get_technician_ranking: SUM(points) por profiles.full_name onde created_at>=start_date, JOIN profiles, ORDER points DESC, SECURITY DEFINER SEM guarda de role — supabase/migrations/20260123141354_...sql:92-124
- Agrupamento do ranking por full_name (não por user_id) — colide/mescla técnicos homônimos — migration ...3141354.sql:106-116
- Visibilidade do módulo 100% via feature flag gamification_enabled (default false): guard de rota, widget retorna null, item do sidebar oculto — AnimatedRoutes.tsx:127-130, TechnicianMiniRanking.tsx:33, AppSidebar.tsx:140

**Observações / riscos:**
- Feature flag default false (CHANGELOG:698,703): módulo inteiro dormente em produção — rota redireciona p/ '/', widget vira null, item do sidebar oculto. Nada 'quebrado' visível ao usuário, mas nada funcional entregue.
- Segurança: get_technician_ranking é SECURITY DEFINER e ignora RLS, sem guarda is_staff/has_role no corpo (migration ...3141354.sql:92-124). Proteção só no frontend (rota). Já apontado em MAPA:727/1453. [dado de banco não consultado — apenas leitura da migration]
- Ranking agrupa por full_name, não user_id (migration ...3141354.sql:106-116): técnicos com nomes iguais são somados juntos; nome nulo/vazio agruparia errado.
- Sistema de badges é meramente decorativo: mostra catálogo global igual para todos, sem premiação real (technician_badges nunca escrita) e com ícones sempre no fallback. Metas idem (progresso fixo 0).
- TicketRatingDialog.tsx:82 faz insert em technician_points sem verificar erro (viola checklist MAPA:732) — falha de premiação passa silenciosa.
- Duplicação de limiares de nível: array levelConfig (L21-27) e função getLevel (L78-84) mantêm os mesmos números em dois lugares na GamificationPage.

**Arquivos com uso parcial/incerto/nulo:**
- `src/pages/gamification/GamificationPage.tsx` — parcial — Página /gamification: ranking (RPC), catálogo de badges, metas ativas e guia de níveis (bronze→diamante). _(evid: Rota registrada em AnimatedRoutes.tsx:167 (ProtectedRoute requireStaff → GamificationGuard) + lazy import L50 + item no AppSidebar L83; porém GamificationGuard (AnimatedRoutes.tsx:127-130) redireciona p/ '/' quando gamification_enabled=false (default false, CHANGELOG:703).)_
- `src/components/dashboard/TechnicianMiniRanking.tsx` — parcial — Widget 'Top Técnicos' (top 5) no Dashboard via RPC get_technician_ranking, com link para /gamification. _(evid: Importado/renderizado em Dashboard.tsx:18 e :308 sob {isAdmin && ...}; internamente retorna null se !gamificationEnabled (L33). Flag default false.)_


### client-portal — Portal do Cliente

Área autenticada (rota /portal, roles client/client_master) onde o cliente abre chamados via RPC open_client_portal_ticket, acompanha status em abas (Abertos/Aguardando Avaliação/Fechados), troca comentários públicos e avalia. client_master ganha aba Financeiro (faturas + boleto/PIX/NFS-e como consumo de URLs) e visão "Todos os chamados da empresa". Módulo coeso e totalmente cabeado — nenhum arquivo órfão; toda a resolução de dados é client_contacts->clients por user_id + queries filtradas por client_id sob RLS. Não chama nenhuma edge function diretamente (só 1 RPC SECURITY DEFINER + INSERTs diretos).

**Integrações:** Supabase Auth via useAuth (user/profile/roles/signOut) + Postgres/RLS como proteção real, RPC open_client_portal_ticket (SECURITY DEFINER) — única 'API' de escrita de chamado, Boleto/PIX/NFS-e: apenas CONSUMO de URLs já gravadas (boleto_url, boleto_barcode, pix_code, pdf_url) — sem chamada a Asaas/Inter/provedor NFS-e, useClientMonitoredDevices (RMM/monitoramento) alimenta o DeviceSelector do form, KBSuggestions (base de conhecimento) sugere artigos durante a abertura, TicketRatingDialog (módulo tickets/gamificação) para avaliação, useFormPersistence (rascunho em sessionStorage, key 'ticket_portal')

**Fluxos (rota→componente→hook→edge→tabela):**
- /portal (ProtectedRoute client|client_master) -> ClientPortalPage -> query client-user (client_contacts.maybeSingle -> clients por user_id) -> query tickets (client_id + requester_contact_id se !master||viewMode='my') -> ClientTicketsList + ClientTicketDetailPanel -> tabelas tickets, ticket_categories, client_contacts
- Abrir chamado: ClientPortalPage -> NewTicketDialog -> ClientTicketForm (Zod + isContactBlockValid) -> supabase.rpc('open_client_portal_ticket') [RPC SECURITY DEFINER valida contato/role/FKs] -> INSERT tickets(origin='portal') + INSERT ticket_history -> invalidate ['client-tickets']
- Comentar: ClientTicketDetailPanel -> SELECT ticket_comments(is_internal=false) + SELECT profiles(nomes) -> INSERT direto ticket_comments(user_id, is_internal=false) [sem edge, RLS é o gate]
- Financeiro (client_master): ClientPortalNav -> ClientPortalFinancialTab -> SELECT invoices(neq status='cancelled', filtro) + SELECT nfse_history(status='autorizada') -> consumo de boleto_url/boleto_barcode/pix_code (clipboard) e pdf_url (window.open)
- Avaliação: ClientTicketsList aba 'resolved' (resolved sem satisfaction_rating) -> onRate -> TicketRatingDialog (módulo tickets) -> grava satisfaction_rating

**Regras de negócio:**
- Acesso ao portal restrito a client/client_master — guarda de UI (isClient) + ProtectedRoute: ClientPortalPage.tsx:28,117 e AnimatedRoutes.tsx:151
- Aba Financeiro e navegação só para client_master: ClientPortalPage.tsx:135,137
- viewMode: client não-master sempre filtra por requester_contact_id; master pode ver 'Todos' da empresa: ClientPortalPage.tsx:64
- openCount = não resolved/closed; closedCount = closed OU (resolved COM satisfaction_rating): ClientPortalPage.tsx:113-114
- Aba 'Aguardando Avaliação' = resolved SEM satisfaction_rating: ClientTicketsList.tsx:31
- Comentário só permitido enquanto ticket não resolved/closed: ClientTicketDetailPanel.tsx:107
- Portal só lê/insere comentários públicos is_internal=false: ClientTicketDetailPanel.tsx:30,50
- Zod: título 5-255, descrição 20-10000, prioridade enum: ClientTicketForm.tsx:31-36
- Telefone obrigatório válido 10-11 dígitos (isContactBlockValid) — gate no submit: ContactBlock.tsx:127-128, ClientTicketForm.tsx:86
- Sem telefone padrão força modo 'outra pessoa': ContactBlock.tsx:29-36
- RPC valida sessão/contato ativo/role/tamanhos/telefone 10-13 (strip 55)/XOR device-hostname/categoria ativa/FKs do cliente: migration 20260519175933:43-147
- Financeiro: totalPending, totalOverdue(+multa+juros), totalPaidThisMonth: ClientPortalFinancialTab.tsx:121-129
- Listagem exclui cancelled; NFS-e só 'autorizada' por invoice_id: ClientPortalFinancialTab.tsx:82,104,113-116

**Observações / riscos:**
- BUG visual: ClientPortalFinancialTab tem statusLabels para 'renegotiated'/'lost' mas statusConfig só cobre pending/paid/overdue/cancelled; fallback é statusConfig.pending (linha 223) -> ícone/cor de 'pendente' com label correto. A query só exclui 'cancelled' (linha 82) e o filtro oferece pending/overdue/paid, então faturas renegotiated/lost PODEM aparecer com visual errado: ClientPortalFinancialTab.tsx:43-69,223
- client-user usa .maybeSingle() em client_contacts (ClientPortalPage.tsx:40): usuário com >1 contato faz o Supabase lançar erro (PGRST116), enquanto a RPC resolve com ORDER BY is_active DESC, created_at ASC. Inconsistência UI vs RPC.
- DÚVIDA (não consultei o banco): abrir chamado/comentar pelo portal não invoca send-ticket-notification no frontend; se não houver trigger de notificação em tickets/ticket_comments, staff não é avisado de atividade do portal. Verificar existência de trigger DB.
- Duplicação de mapas de status: portal-types.ts (statusLabels/statusColors de tickets) e statusLabels local do FinancialTab, além dos mapas dos módulos tickets/billing. Sem fonte única.
- Aba 'resolved' fica presa se o cliente nunca avaliar (o ticket só sai da aba ao ganhar satisfaction_rating): ClientTicketsList.tsx:31 + ClientPortalPage.tsx:114
- Convenção de tamanho: ClientPortalFinancialTab.tsx (333 linhas) e ClientTicketForm.tsx (259 linhas) excedem o limite de ~150-200 do CLAUDE.md.
- Inconsistência de acesso: aba Financeiro é gated só para client_master no UI, mas (conforme MAPA linha 766) a RLS de invoices/nfse_history libera SELECT também para client — não verificado aqui (read-only, sem consulta ao banco).
- Sem anexos na abertura de chamado do portal (RPC não recebe arquivos) — MAPA aponta como bloqueador para o projeto ALTAHU.
- TicketRatingDialog (fora do escopo primário, módulo tickets) é o fluxo de avaliação; MAPA linha 722 registra bug crítico de RLS onde a concessão de pontos de gamificação seria bloqueada para client/client_master — não reauditado aqui pois é componente compartilhado do módulo tickets.


### settings — Configuracoes, Feature Flags e UI de Integracoes

Módulo do centro administrativo (/settings com abas lazy), UI de todas as integrações externas, templates de e-mail e feature flags (CRUD + avaliação com rollout gradual por hash FNV-1a). Núcleo funcional e majoritariamente em uso, mas com um bug de renderização (UnifiConfigForm sem clientId na aba Rede), um bug lógico no gate de rollout=0, adoção só parcial das abstrações compartilhadas (useIntegrationSettings/IntegrationConfigCard) e a página de Feature Flags acessível apenas por URL direta (sem link na navegação). Cada ConfigForm persiste 1 linha por integration_type em integration_settings (JSONB + is_active); Testar salva e invoca a edge com {action:'test'}.

**Integrações:** Telegram → edge send-telegram (integration_settings 'telegram': bot_token/default_chat_id/bot_username), WhatsApp/Evolution → edge send-whatsapp; webhook-whatsapp-status (integration_settings 'evolution_api': api_url/api_key/instance_name/default_number), Resend (e-mail) → edge send-email-resend; API key só em secret RESEND_API_KEY (integration_settings 'resend': default_from_name/email), Banco Inter → edge banco-inter (test/check_webhook/register_webhook); certs base64 no JSONB (integration_settings 'banco_inter'), Asaas e Google Calendar (montados no IntegrationsTab, forms fora do escopo de leitura) → integration_settings 'asaas'/'google_calendar', CheckMK → edge checkmk-sync (test/list_folders/sync) (integration_settings 'checkmk'), Tactical RMM → edge tactical-rmm-sync (test/list_clients/sync) (integration_settings 'tactical_rmm'), UniFi → edge unifi-sync (test/list_sites/sync); dados em unifi_controllers (por cliente, NÃO integration_settings), No-Contact Check → edge check-no-contact-tickets (integration_settings 'no_contact_check'), Storage: upload de logo de e-mail em bucket email-assets (EmailSettingsForm), Todas as edges invocadas existem em supabase/functions (verificado: send-telegram, send-whatsapp, checkmk-sync, tactical-rmm-sync, unifi-sync, banco-inter, send-email-resend, check-no-contact-tickets, webhook-whatsapp-status)

**Fluxos (rota→componente→hook→edge→tabela):**
- URL /settings → SettingsPage → aba 'integrations' (lazy) → IntegrationsTab → cada *ConfigForm → useIntegrationSettings.load/save → tabela integration_settings (1 linha por integration_type, JSONB settings + is_active)
- IntegrationsTab aba Status → IntegrationStatusPanel → SELECT integration_settings (agrupa por categoria) + botão sync (só tactical_rmm/checkmk) → supabase.functions.invoke('tactical-rmm-sync'|'checkmk-sync', {action:'sync'}) → UPDATE integration_settings.last_sync_at
- TelegramConfigForm.Testar → save({silent}) → invoke('send-telegram') ; CheckMk.Testar → invoke('checkmk-sync',{action:'test'}) ; TacticalRmm → invoke('tactical-rmm-sync',{action:'test'}) ; Evolution → invoke('send-whatsapp') ; Resend → invoke('send-email-resend')
- BancoInterConfigForm (load/save inline em integration_settings 'banco_inter') → Testar/Registrar → invoke('banco-inter',{action:'test'|'check_webhook'|'register_webhook'}); certificados .crt/.key lidos no cliente como base64 e salvos no JSONB
- NoContactCheckConfigForm → React Query em integration_settings 'no_contact_check' → 'Executar Agora' → invoke('check-no-contact-tickets')
- IntegrationsTab aba Rede → <UnifiConfigForm/> SEM clientId (QUEBRADO) — o fluxo correto é ClientNetworkTab → <UnifiConfigForm clientId> → tabela unifi_controllers + invoke('unifi-sync',{action:test|list_sites|sync})
- URL /settings/feature-flags (admin) → FeatureFlagsPage → useFeatureFlags (React Query staleTime 5min) → SELECT feature_flags; upsert/delete → feature_flags. Consumo runtime: componentes chamam useFeatureFlag(key) → evaluateFlag local (FNV-1a userId:key)
- SettingsPage aba 'email-templates' → EmailTemplatesTab → EmailSettingsForm (email_settings + upload storage email-assets) e EmailTemplateEditor (email_templates)
- SettingsPage aba 'mappings' → ClientMappingsTab → invoke('tactical-rmm-sync'|'checkmk-sync', {action:'list_clients'|'list_folders'|'sync'}) → INSERT client_external_mappings → auto-sync monitored_devices

**Regras de negócio:**
- Ordem de avaliação de flag: disabled→false; user em enabled_for_user_ids→true (prioridade absoluta); enabled_for_roles definido e sem match→false; rollout≥100→true; senão bucket FNV-1a(userId:key)%100 < rollout — src/hooks/useFeatureFlag.ts:36-63
- Hash determinístico FNV-1a 32-bit para rollout gradual consistente por usuário — src/hooks/useFeatureFlag.ts:22-29,62
- Rollout clampado 0-100 no salvamento; chave em snake_case imutável na edição — src/pages/settings/FeatureFlagsPage.tsx:76 e :246 (disabled={!!form.id})
- integration_settings tem 1 linha por integration_type (upsert): update se existe, senão insert — src/hooks/useIntegrationSettings.ts:56-79
- Padrão Testar = salvar em modo silent e invocar edge com {action:'test'} — src/components/settings/integrations/CheckMkConfigForm.tsx:55-59; TacticalRmmConfigForm.tsx:56-59
- Resend: RESEND_API_KEY é secret de backend e nunca é gravada em integration_settings (só from_name/from_email) — src/components/settings/integrations/ResendConfigForm.tsx:185
- Banco Inter: certificados .crt/.key convertidos a base64 no navegador e persistidos no JSONB; webhook auto-registrado após salvar quando ativo e com credenciais+certs — src/components/settings/integrations/BancoInterConfigForm.tsx:109-121 e :250-264; sandbox bloqueado (força produção) :272-278
- Tactical RMM: migração única de sync_interval_minutes (legado) para horas após o load — src/components/settings/integrations/TacticalRmmConfigForm.tsx:40-47
- Status: sync manual só existe para tactical_rmm e checkmk; demais integrações mostram aviso 'não suporta sync manual' — src/components/settings/integrations/IntegrationStatusPanel.tsx:75-89
- ClientMappings: sugestão automática por nome normalizado (sem acento/especiais, 10 chars) + cache localStorage TTL 10min + mapeamento externo único (erro 23505) — src/components/settings/ClientMappingsTab.tsx:62-80,83-131,384-388
- NotificationRules: sem regras cadastradas → todos os técnicos recebem alertas; escalonamento com client_id null = padrão global — src/components/settings/NotificationRulesTab.tsx:306,430,504
- SettingsPage: item 'departments' só aparece com flag departments_enabled; aba 'users' navega para /settings/users; requiresAdmin/requiresManage filtram o menu — src/pages/settings/SettingsPage.tsx:100-104,110-113
- SystemTab: token de acesso ao TV dashboard regenerado com crypto.randomUUID (acesso público por token) — src/components/settings/SystemTab.tsx:56,70
- EmailSettingsForm: cores validadas por regex hex #RRGGBB (Zod); upload de logo ≤2MB em storage email-assets — src/components/settings/email-templates/EmailSettingsForm.tsx:24-26,105
- FeatureFlagsPage e AuditLogsPage protegidas por ProtectedRoute allowedRoles=['admin'] — src/components/layout/AnimatedRoutes.tsx:185,187

**Observações / riscos:**
- BUG DE RENDER: IntegrationsTab.tsx:99 renderiza <UnifiConfigForm /> sem a prop obrigatória clientId → useQuery filtra unifi_controllers.eq('client_id', undefined) e insert com client_id undefined; a aba 'Rede' em /settings fica quebrada. Uso correto é por-cliente em ClientNetworkTab.tsx:92.
- BUG LÓGICO: useFeatureFlag.ts:51-59 no ramo rollout<=0 faz `return Boolean(...) ? true : true` — ambos os ramos retornam true; logo, com rollout=0 e enabled=true sem enabled_for_roles, uma whitelist enabled_for_user_ids é ignorada (libera para todos em vez de só os IDs). O filtro por roles ainda funciona (curto-circuita antes, :43-46).
- REDUNDÂNCIA: adoção parcial das abstrações — useIntegrationSettings é usado por 6 forms, mas BancoInter/Resend/NoContactCheck reimplementam load/save inline; IntegrationConfigCard só é usado pelo Telegram (os demais duplicam o layout do Card).
- DUPLICAÇÃO DE UI: BusinessHoursForm é renderizado em duas abas distintas (SystemTab.tsx:218 e CompanyTab.tsx:766) editando o mesmo company_settings — dois caminhos para a mesma configuração.
- DUAS SUPERFÍCIES DE AUDITORIA: aba 'Auditoria' (AuditLogsTab, query direta a audit_logs, sem redação na UI) vs página /settings/audit-logs (AuditLogsPage→AuditLogsList, redação prometida) — potencial confusão/redundância.
- RISCO RLS (anotado, NÃO consultei o banco): integration_settings guarda segredos no JSONB (bot_token, api_key, client_secret, certificados). Se a policy de SELECT for para is_staff, um technician poderia lê-los. Resend já adota o padrão seguro (segredo no backend). Confirmar policy antes de qualquer mudança.
- IntegrationStatusPanel lista CRONs de forma HARDCODED (notify-sla-breach, check-contract-adjustments, generate-invoice-payments, poll-services) — pode divergir dos crons realmente agendados (não verificado).
- FeatureFlagsPage é funcional porém sem link de entrada na navegação (só por URL) — considerar adicionar item no menu de Settings ou remover a rota se descontinuada.
- Apenas 2 flags são efetivamente consumidas no código: 'gamification_enabled' e 'departments_enabled' (grep useFeatureFlag).

**Arquivos com uso parcial/incerto/nulo:**
- `src/pages/settings/FeatureFlagsPage.tsx` — parcial — CRUD admin de feature_flags (chave/descrição/enabled/rollout/roles/user_ids) com Dialog e AlertDialog de remoção. _(evid: AnimatedRoutes.tsx:185 rota /settings/feature-flags (admin); porém NENHUM link/nav aponta para ela (só URL direta))_
- `src/components/settings/integrations/IntegrationConfigCard.tsx` — parcial — Card compartilhado (header/badge ativo/switch/teste/salvar) para padronizar os ConfigForm. _(evid: IntegrationConfigCard só é importado/usado por TelegramConfigForm.tsx (1 de ~8 forms))_
- `src/components/settings/integrations/UnifiConfigForm.tsx` — parcial — CRUD de controllers UniFi POR CLIENTE (tabela unifi_controllers), teste/sync via unifi-sync; exige prop clientId. _(evid: Uso correto: ClientNetworkTab.tsx:92 <UnifiConfigForm clientId>; uso quebrado: IntegrationsTab.tsx:99 <UnifiConfigForm/> sem clientId)_


### audit-security — Auditoria, Seguranca e Logs

O módulo cobre três frentes: trilha de auditoria (audit_logs) exposta por dois viewers paralelos e redundantes, logs de aplicação (application_logs) via LogsViewerTab + logger.ts, e o detector de anomalias de cadastro (edge detect-auth-anomalies + AnomaliesBanner). O viewer novo (AuditLogsList/RPC list_audit_logs_with_user, rota /settings/audit-logs) é sólido e testado; o legado AuditLogsTab (aba "Auditoria" em Settings) continua wired e duplica a função com implementação inferior. Detector e banner funcionam, mas há inconsistência de level ("warning") e casing de módulo ("auth" vs "Auth") que quebram exibição/filtragem no LogsViewerTab.

**Integrações:** Supabase RPC list_audit_logs_with_user (SECURITY DEFINER, admin-only) — fonte da trilha no viewer novo, Supabase PostgREST direto em audit_logs (AuditLogsTab legado) e application_logs (LogsViewerTab/AnomaliesBanner/logger), Supabase auth.admin.listUsers (perPage:1000) + profiles + user_roles no detector (logic.ts:12-28), supabase.functions.invoke('detect-auth-anomalies') a partir do AnomaliesBanner; cron pg_cron/pg_net para chamada diária, Tabela notifications (type=auth_anomaly) para alertar admins, _shared/auth-helpers.ts: requireRole/adminClient/jsonResponse/corsHeaders e logAudit (usado por outras edges de gestão de usuários)

**Fluxos (rota→componente→hook→edge→tabela):**
- /settings/audit-logs (admin) -> AuditLogsPage -> AuditLogsList -> useAuditLogs -> supabase.rpc('list_audit_logs_with_user') -> tabela audit_logs (+join profiles) -> AuditLogRow/AuditLogDetail -> AuditLogDiff -> diffJsonb
- Settings aba 'Auditoria' (admin) -> AuditLogsTab -> supabase.from('audit_logs').select(...).limit(100) [caminho paralelo/redundante, sem RPC, sem paginação, sem nome do usuário]
- Settings/Integrações -> IntegrationsTab -> LogsViewerTab -> useQuery -> supabase.from('application_logs') (filtros level/module, export CSV)
- logger.ts (frontend, persistToDb) e edge functions -> insert application_logs -> lido por LogsViewerTab e AnomaliesBanner
- /settings/users -> UsersPage -> AnomaliesBanner -> supabase.from('application_logs').eq(module,'auth').eq(action,'detect_anomalies') (leitura) + supabase.functions.invoke('detect-auth-anomalies') -> detectAnomalies(auth.users/profiles/user_roles) -> insert application_logs + notifications
- cron 'detect-auth-anomalies-daily' (0 11 * * *, só no DB ao vivo) -> edge detect-auth-anomalies (Bearer service-role) -> mesma detecção/gravação
- DB trigger audit_user_roles_trigger em user_roles (INSERT/UPDATE/DELETE) -> insert audit_logs (SECURITY DEFINER)

**Regras de negócio:**
- audit_logs é append-only/imutável: RLS bloqueia UPDATE e DELETE para todos (migration 20260425173521...:82-95)
- Alterações em user_roles são auto-auditadas via trigger audit_user_roles (migration 20260425173521...:50-77)
- list_audit_logs_with_user é admin-only e retorna total_count para paginação real; total vem de rows[0].total_count (useAuditLogs.ts:34,52)
- Filtro 'Até' é inclusivo do dia inteiro: sufixo T23:59:59.999Z (useAuditLogs.ts:41) e setHours(23,59,59,999) (AuditLogsTab.tsx:68-70)
- Troca de qualquer filtro reseta para página 1 (AuditLogsList.tsx:31-33)
- detect-auth-anomalies exige role admin OU chamada interna via SUPABASE_SERVICE_ROLE_KEY (cron) (index.ts:12-21)
- Categorias de anomalia: órfão=auth sem profile, zumbi=profile sem auth, não-confirmado>7d, sem-papel=auth+profile sem role (logic.ts:30-49)
- Com anomalias>0, todos os admins recebem notification type=auth_anomaly (index.ts:42-57)
- AnomaliesBanner considera detecção 'stale' se última execução há >25h (AnomaliesBanner.tsx:26,58)
- logger persiste no máximo 100 entradas em sessionStorage e só imprime no console em DEV (logger.ts:38,53,72); invoiceProcessingLog sempre grava em application_logs (logger.ts:327)

**Observações / riscos:**
- REDUNDÂNCIA (viola CLAUDE.md §6.0.2): existem DOIS viewers de auditoria admin-only e ambos vivos — AuditLogsTab (aba Settings, query direta, limit 100, sem usuário, sem redação-disclaimer, lista só 4 tabelas) e AuditLogsList (rota /settings/audit-logs, RPC com paginação/usuário/diff/redação). O legado AuditLogsTab é candidato a remoção/consolidação no AuditLogsList.
- BUG de exibição: detect-auth-anomalies/index.ts:29 grava level='warning', mas o padrão do sistema é 'warn' (logger.ts LogLevel; LogsViewerTab.tsx:66 levelConfig.warn). Em LogsViewerTab, 'warning' cai no fallback levelConfig.info (linha 328) e é exibido como 'Info' azul; o filtro 'Alerta' (eq 'warn') nunca casa esses registros.
- BUG de casing de módulo: edge e triggers gravam module='auth' (minúsculo; index.ts:31, migration handle_new_user:24,35), mas LogsViewerTab.tsx moduleLabels/filtro usam 'Auth' (maiúsculo) — logs de auth aparecem sem tradução ('auth' cru) e o filtro 'Autenticação' (.eq module 'Auth') não retorna nada. logger.ts frontend grava 'Auth' capitalizado, divergindo dos produtores de backend.
- LIMITE do detector: listUsers({perPage:1000}) sem paginação (logic.ts:12) — acima de 1000 usuários auth, órfãos/zumbis/não-confirmados ficam incompletos silenciosamente.
- AuditLogsTab.formatData (AuditLogsTab.tsx:115-120) interpola valores com template string; valores objeto viram '[object Object]' na coluna Detalhes.
- Divergência de conjunto de tabelas auditáveis entre os dois viewers: AuditLogFilters.tsx:7 lista 7 tabelas (inclui auth.users, user_roles, invoices, bank_accounts) enquanto AuditLogsTab.tsx:225-235 lista só 4 (integration_settings/tickets/clients/contracts).
- Não verificável (read-only, sem DB): trigger genérico audit_changes()/sanitize_jsonb referenciado pelo MAPA §856 não está nesta migration; existência/estado do cron no cron.job; RLS de application_logs (SELECT admin) que o AnomaliesBanner assume.

**Arquivos com uso parcial/incerto/nulo:**
- `src/components/settings/AuditLogsTab.tsx` — parcial — Viewer LEGADO de auditoria: query direta a audit_logs (limit 100, sem join de usuário, sem paginação) _(evid: wired como aba 'audit' em SettingsPage.tsx:27,166 — porém duplica AuditLogsList)_


### db-schema — Banco de Dados, Migrations e Schema

Schema versionado em 164 migrations SQL (supabase/migrations), com contrato de tipos gerado em src/integrations/supabase/types.ts (7439 linhas, 44 RPCs declaradas, 17 enums) e client.ts. Auditei todas as chamadas .rpc() do frontend e edges contra as definições em migration/types: 24 RPCs distintas são invocadas por código e todas existem — EXCETO increment_article_views, que é chamada pelo ArticleViewer mas não existe em migration nem em types.ts (cai sempre no fallback UPDATE não-atômico). Não há migrations com timestamp duplicado; merge_clients e open_client_portal_ticket têm duas definições cada (evolução via CREATE OR REPLACE, não órfãs). MAPA_DE_SETORES.md está levemente desatualizado nas contagens.

**Integrações:** Supabase Auth (triggers em auth.users: handle_new_user), Postgres+RLS, Vault (senhas A1/certificados, tokens) exposto só via RPC SECURITY DEFINER (get_certificate_password, get_company_certificate_password, get_license_key, get_calendar_tokens, vault_upsert_secret), Edge functions Deno consomem schema via service_role; apenas 2 edges chamam .rpc diretamente: bootstrap-admin (try_bootstrap_admin) e activate-invite-manually (admin_accept_invite), Hermes/UniFi: RPCs hermes_*_ticket e unifi_relay_* consumidas pelo bot/relay externo (relay-unifi), não pelo código do app, types.ts é gerado mas commitado manualmente — risco de drift schema<->tipos (MAPA linha 915)

**Fluxos (rota→componente→hook→edge→tabela):**
- /reports -> ReportsPage.tsx -> .rpc(get_ticket_report_stats / get_invoice_report_stats / get_technician_ranking) -> tickets/invoices/profiles/technician_points
- /clients (excluir) -> DeleteClientButton.tsx -> .rpc(delete_client_safely, SECURITY DEFINER, anonimiza+audit) -> clients/audit_logs
- /clients (duplicados) -> DuplicatesBanner + MergeClientsDialog -> .rpc(detect_duplicate_clients / merge_clients) -> clients
- Portal do cliente -> ClientTicketForm.tsx:89 -> .rpc(open_client_portal_ticket, SECURITY DEFINER) -> tickets
- Novo chamado (staff) -> TicketForm.tsx:219 -> .rpc(create_staff_ticket, atômico) -> tickets/ticket_tags
- /setup-account -> SetupAccount.tsx -> .rpc(get_invite_info) e .rpc(accept_invite) -> pending_invites/user_roles/profiles
- Auditoria -> useAuditLogs.ts:34 -> .rpc(list_audit_logs_with_user) -> audit_logs (join auth.users)
- Admin usuários -> useUsers.ts:57 + ChangeRoleDialog.tsx:29 -> .rpc(list_users_for_admin / change_user_role) -> user_roles/profiles
- Conciliação bancária -> BankReconciliationTab.tsx:94 -> .rpc(auto_reconcile_bank_entries) -> bank_entries/financial_entries
- Bootstrap/convite (edges) -> bootstrap-admin/index.ts:145 .rpc(try_bootstrap_admin); activate-invite-manually/index.ts:82 .rpc(admin_accept_invite) -> user_roles/pending_invites
- Base de conhecimento -> ArticleViewer.tsx:66 -> .rpc(increment_article_views) [FALHA: RPC inexistente] -> fallback UPDATE knowledge_articles.views

**Regras de negócio:**
- Anonimizar em vez de deletar cliente referenciado em registros financeiros/auditoria: delete_client_safely — supabase/migrations/20260425110301_89f59370-....sql:192
- Bloqueio de signup público; vínculo de papel só via convite: accept_invite — supabase/migrations/20260519185808_block_public_signup_and_invite_flow.sql:120
- Abertura de chamado pelo portal com resolução de contato via ORDER BY (versão endurecida): open_client_portal_ticket — supabase/migrations/20260519175933_harden_open_client_portal_ticket.sql:15
- Garantia dura contra NFS-e duplicada: índice único parcial nfse_history(invoice_id) WHERE ativa — supabase/migrations/20260710210000_uq_nfse_history_active_per_invoice.sql
- Enum invoice_status NÃO possui 'voided' (pending/paid/overdue/cancelled/lost/renegotiated) — src/integrations/supabase/types.ts:7201 (consistente com o fix recente de dedup e0014/gate de frequência)
- Criação atômica de chamado de staff com tags e origem: create_staff_ticket — supabase/migrations/20260512131803_create_staff_ticket_rpc.sql:17
- Papéis (app_role): admin/manager/technician/financial/client/client_master — src/integrations/supabase/types.ts:7159; helpers de RLS has_role/is_staff/is_financial_admin/is_technician_only/client_owns_record

**Observações / riscos:**
- increment_article_views: chamada .rpc morta (RPC inexistente) com fallback UPDATE não-atômico — race condition em contagem de views; decidir criar RPC atômica ou remover a chamada.
- 44 RPCs declaradas em types.ts; 24 invocadas por código (22 frontend + 2 edges). ~20 restantes são helpers de RLS/trigger (has_role, is_staff, is_financial_admin, is_technician_only, client_owns_record, sanitize_jsonb — 'em uso' via policies, não grepáveis por .rpc) ou chamadas por edges/relay/externo (hermes_*, get_certificate_password, get_company_certificate_password, get_calendar_tokens, vault_upsert_secret, generate_signed_url, verify_tv_dashboard_token, update_invoice_status, find_valid_invite, cleanup_old_*).
- calculate_penalties: sem nenhum caller no repo (src/supabase/functions/relay) — só definição em types; verificar se é usada dentro de SQL antes de considerar morta.
- Duplicações intencionais (não órfãs): merge_clients definida em 20260425110301 e redefinida em 20260427092735; open_client_portal_ticket em 20260512043108 e endurecida em 20260519175933 — em ambos a migration posterior é a vigente (CREATE OR REPLACE).
- Nenhum timestamp de migration duplicado (ls | sed | uniq -d => vazio); não há colisão/órfã por nome de arquivo.
- Riscos herdados do MAPA §3.17 confirmáveis por leitura: backups residuais no schema (_billing_hotfix_backup_pix_contamination, _billing_migration_backup_inter_to_asaas) ainda em types.ts; muitas funções SECURITY DEFINER sem SET search_path.
- NÃO consultei o banco (regra do escopo). Dúvidas que exigem o banco ao vivo: (a) increment_article_views/calculate_penalties existem no banco mesmo fora das migrations? (b) GRANT EXECUTE das RPCs de relatório financeiro (SECURITY DEFINER) para authenticated/anon?


### infra — Infraestrutura, Build, PWA, Testes

Fundação do app: build Vite+SWC com chunking manual, PWA via vite-plugin-pwa/Workbox (autoUpdate, manifest estático), shell de UI (App/AppLayout/AnimatedRoutes com lazy+retry e três boundaries de erro), cliente Supabase gerado e infra de testes Vitest. Estado geral sólido e bem alinhado ao MAPA; principais pendências são código morto residual (2 exports no-op, mocks/http.ts órfão, example.test.ts placeholder, placeholder.svg), ausência de typecheck/CI, client.ts sem validação de env e coexistência de dois service workers no escopo '/'.

**Fluxos (rota→componente→hook→edge→tabela):**
- index.html#root → src/main.tsx (createRoot) → src/App.tsx (ErrorBoundary→QueryClientProvider→BrowserRouter→GlobalErrorHandler→AuthProvider→RealtimeProvider) → AnimatedRoutes
- AnimatedRoutes → ProtectedRoute(allowedRoles/requireStaff) → LazyPage(LazyErrorBoundary+Suspense[HoneycombLoader]+PageTransition) → página lazy (lazyWithRetry 3x) → AppLayout(shell) → hooks/React Query → supabase client → PostgREST/Edge/Storage
- /billing/delinquency → ProtectedRoute(admin/manager/financial) → DelinquencyReportPage envolto em PageErrorBoundary → em crash: supabase.from('application_logs').insert({level:error, module:ui, action:page_crash})
- AppLayout header: submit da busca → regex ^#?\d+$ → navigate('/tickets?search=') senão navigate('/clients?search=')
- PWA: vite-plugin-pwa(autoUpdate) gera sw.js (Workbox) — precache globPatterns + runtimeCaching NetworkFirst p/ *.supabase.co (50 entradas/24h); manifest via public/manifest.json ligado no index.html
- Teste: src/test/integration/generate-invoices.test.ts → helpers/factories.ts + mocks/supabase.ts → supabase/functions/generate-monthly-invoices/logic.ts (medido em coverage.include)

**Regras de negócio:**
- lazyWithRetry: reimporta módulo lazy até 3 tentativas com atraso exponencial (1s*tentativa) — AnimatedRoutes.tsx:15-28
- Falha de chunk dinâmico (unhandledrejection com 'Failed to fetch dynamically imported module'/'Loading chunk') → toast + window.location.reload() após 2s — App.tsx:46-49
- Gate de rota por papel: ProtectedRoute allowedRoles/requireStaff por rota (ex.: /billing = admin/manager/financial; /settings/feature-flags = admin) — AnimatedRoutes.tsx:148-188
- GamificationGuard: se feature flag 'gamification_enabled' off → Navigate to '/' — AnimatedRoutes.tsx:127-131
- Busca global: entrada casando ^#?\d+$ vai p/ tickets, senão p/ clientes — AppLayout.tsx:91-96
- Tema: persistido em localStorage; 'system' resolve via matchMedia(prefers-color-scheme) e reage a mudança — AppLayout.tsx:36-74
- SessionExpiryIndicator: alerta quando restam <10min (WARNING) e crítico <2min (CRITICAL); atualiza a cada 30s — SessionExpiryIndicator.tsx:13-15,38,44,48
- Cache React Query global: retry 1, staleTime 5min, gcTime 15min, sem refetch on focus/reconnect/mount — App.tsx:14-25
- PageErrorBoundary registra crash em application_logs (level=error, module=ui, action=page_crash, context com page/stack/url) — PageErrorBoundary.tsx:41-54
- Workbox runtimeCaching: NetworkFirst 'supabase-cache' p/ *.supabase.co, maxEntries 50, maxAge 24h — vite.config.ts:57-68
- navigateFallback:null — sem fallback SPA para navegação offline — vite.config.ts:56

**Arquivos com uso parcial/incerto/nulo:**
- `tsconfig.json` — parcial — TS raiz frouxo (strictNullChecks:false, files=deno.d.ts); não inclui src _(evid: build ignora tipos; CLAUDE.md nota ausência de typecheck)_
- `src/components/layout/PageTransition.tsx` — parcial — Passthrough <div> (animações desativadas); + RouteChangeLoader/RouteProgressBar que retornam null _(evid: PageTransition usado por AnimatedRoutes; outros 2 exports sem refs)_
- `src/components/common/PageErrorBoundary.tsx` — parcial — Boundary por-página: registra crash em application_logs (level error, module ui, action page_crash) + UI retry/voltar _(evid: único consumidor: DelinquencyReportPage.tsx:653)_
- `public/favicon.ico` — parcial — Favicon local _(evid: pré-cacheado (includeAssets) mas index.html usa favicon externo googleapis)_
- `public/robots.txt` — incerto — Diretivas de crawler _(evid: servido estático; sem ref no código)_
- `public/placeholder.svg` — nao — Placeholder default do Lovable _(evid: 0 refs no código (só em graphify-out))_
- `src/test/mocks/http.ts` — nao — mockFetchOnce/restoreFetch p/ fetch externo _(evid: 0 imports em qualquer *.test.* (grep repo-wide))_
- `src/test/example.test.ts` — parcial — Teste placeholder (expect(true).toBe(true)) _(evid: roda no vitest mas sem valor)_


### ui-primitives — Primitivos de UI (shadcn)

41 arquivos em src/components/ui: ~34 primitivos shadcn/Radix vendored + 7 componentes custom do projeto (ColmeiaLogo, HoneycombLoader, EntityHistoryTimeline, DraftRecoveryBanner, loading-skeleton, confirm-dialog, currency-input). NENHUM arquivo do escopo esta 100% orfao — todos tem >=1 importador externo. Estado geral saudavel; achados sao a nivel de simbolo: 5 dos 6 skeletons de loading-skeleton.tsx sao codigo morto, e ha dois sistemas de toast paralelos (Radix + Sonner) ambos montados. Graphify nao modela bem esta camada (folhas de UI); a evidencia forte veio de grep global de import paths.

**Integrações:** Radix UI (base da maioria dos primitivos), sonner (2o sistema de toast, ui/sonner.tsx), cmdk (ui/command.tsx), react-day-picker (ui/calendar.tsx), react-hook-form (ui/form.tsx), class-variance-authority + lib/utils cn (variantes/merge de classes)

**Fluxos (rota→componente→hook→edge→tabela):**
- App.tsx (L2-3,66-67) monta <Toaster/> (Radix, ui/toaster->ui/toast, via hook use-toast) E <Sonner/> (ui/sonner) — dois sistemas de toast paralelos; sem tabela (camada de apresentacao)
- Formularios (ContractForm/InvoiceForm/ServiceForm) -> ui/currency-input -> lib/currency.ts (mask/parse BRL) -> valor numerico no form/Zod
- DeleteClientButton/ContractInvoiceActionsMenu/etc. -> ui/confirm-dialog -> ui/alert-dialog (Radix) -> callback onConfirm (sem tabela direta)
- AnimatedRoutes.tsx (Suspense fallback) & Setup.tsx -> ui/HoneycombLoader (loader de lazy routes)
- TicketDetailsTab.tsx -> ui/EntityHistoryTimeline (renderiza historico ja carregado; sem query propria)

**Regras de negócio:**
- Mascara/parse de moeda BRL delegada a fonte unica lib/currency.ts (maskCurrencyBRL/parseCurrencyBRL) — src/components/ui/currency-input.tsx:21-23
- ConfirmDialog: labels default pt-BR ('Confirmar'/'Cancelar') e styling do variant 'destructive' para acoes perigosas — src/components/ui/confirm-dialog.tsx:33-34,51
- App.tsx: falha de chunk (import dinamico) dispara toast Sonner + reload automatico apos 2s — src/App.tsx:46-49 (usa o toast do Sonner, nao o Radix)

**Observações / riscos:**
- NENHUM arquivo do escopo (41) esta 100% orfao — todos tem >=1 importador externo; nao ha primitivo-arquivo morto.
- DUPLICACAO (viola CLAUDE.md 6.0.2 'fonte unica'): dois sistemas de toast coexistem e ambos sao usados — Radix (ui/toast+ui/toaster+hooks/use-toast, useToast em ~50 arquivos) e Sonner (ui/sonner, toast() em App.tsx). Ambos montados em App.tsx L66-67. Consolidar reduziria bundle e ambiguidade.
- loading-skeleton.tsx: 5 de 6 exports (Page/Table/Form/Dashboard/List) sao codigo morto — candidato a poda; so CardSkeleton sobrevive.
- DraftRecoveryBanner.tsx e componente de DOMINIO (recuperacao de rascunho) morando em ui/; pelo padrao do projeto (CLAUDE.md 5/6.1) deveria estar em components/<dominio> — questao de organizacao, nao de uso.
- sidebar.tsx (637 linhas) e pagination.tsx sao blocos shadcn vendored completos com muitos sub-exports nao usados — esperado para vendored; poda opcional de baixa prioridade, nao mexer se for regerar via CLI.
- Sub-exports shadcn vendored sem uso (TableFooter/TableCaption, DropdownMenu Checkbox/Radio/Shortcut, PaginationEllipsis) sao normais e devem ser mantidos para nao divergir do upstream.
- graphify nao modela util esta camada de folhas de UI (query/explain nao retornaram os primitivos); a evidencia de uso veio de grep de import paths — anotar como limitacao do grafo para este modulo.

**Arquivos com uso parcial/incerto/nulo:**
- `src/components/ui/table.tsx` — parcial — Table + sub-partes _(evid: 57 imports; TableFooter e TableCaption com 0 refs externas)_
- `src/components/ui/dropdown-menu.tsx` — parcial — DropdownMenu (Radix) + sub-partes _(evid: 11 imports; CheckboxItem/RadioGroup/Shortcut com 0 refs externas)_
- `src/components/ui/sidebar.tsx` — parcial — Sistema de sidebar shadcn completo (637 linhas, Provider/Menu/etc.) _(evid: 2 importadores (AppSidebar, AppLayout); varios sub-exports (SidebarInput/MenuBadge/MenuSkeleton/GroupAction/Rail/MenuAction) com 0 refs)_
- `src/components/ui/loading-skeleton.tsx` — parcial — 6 skeletons compostos (Page/Table/Card/Form/Dashboard/List) _(evid: So CardSkeleton importado (KnowledgeArticleList, KnowledgeArticlePage); outros 5 = 0 refs)_
- `src/components/ui/pagination.tsx` — parcial — Paginacao shadcn (81 linhas) _(evid: 1 importador (BillingNfseTab); PaginationEllipsis com 0 refs)_


### shared-lib — Libs e Hooks Compartilhados

Utilitários puros e hooks reutilizáveis do frontend, quase todos em uso ativo e bem testados (date.ts tem suíte completa). O logger é a peça mais problemática: um singleton grande onde ~7 métodos de negócio (payment/nfse/integration/validation/processing + getLogs/clearLogs) e o wrapper devLog têm zero chamadas — código morto acumulado. Há duplicação real de formatação de telefone (formatPhone existe em utils.ts E phone.ts com comportamentos divergentes, mais reimplementações locais em CompanyTab). O módulo src/lib/mcp é um servidor MCP (4 tools) compilado para a edge function supabase/functions/mcp via plugin Vite — em uso, porém totalmente ausente do MAPA.

**Integrações:** @lovable.dev/mcp-js (defineMcp/defineTool/auth OAuth) + plugin Vite stacks/supabase → edge function supabase/functions/mcp, Supabase Storage (createSignedUrl/download) via storage-utils com buckets nfse-files/invoice-documents/ticket-attachments, Supabase PostgREST tabela application_logs (logger.persistToDatabase), date-fns / date-fns/locale ptBR (date.ts); clsx + tailwind-merge (utils.cn); sonner (toasts nos wrappers *Safe do storage-utils); zod (schemas das MCP tools)

**Fluxos (rota→componente→hook→edge→tabela):**
- Campo de busca -> useDebounce -> React Query refetch: TicketsPage/ClientsPage/InventoryPage/MonitoringPage/KnowledgePage
- Formulário (TicketForm/ClientForm/InvoiceForm/…) -> useFormPersistence -> sessionStorage/localStorage chave 'form_draft_<key>' (restore no mount, save debounced, clearDraft no submit)
- ErrorBoundary.tsx -> logger.componentError -> persistLog (sessionStorage 'app_logs'); NÃO persiste em banco
- BillingInvoicesTab -> logger.billingOperation(persistToDb=true) -> supabase.from('application_logs').insert (tabela application_logs)
- BillingInvoicesTab -> retryWithBackoff -> supabase.functions.invoke('generate-monthly-invoices'); PDFs via downloadStorageFileSafe -> supabase.storage (buckets nfse-files/invoice-documents)
- Cliente MCP externo -> /functions/v1/mcp (supabase/functions/mcp, build de src/lib/mcp via vite mcpPlugin) -> tools -> supabase (tickets, ticket_comments, clients, contracts) sob RLS do usuário autenticado
- NfseAvulsaDialog -> supabase.functions.invoke -> throwIfEdgeFunctionError(data,error)
- DelinquencyReportPage -> unwrapEmbed(inv.clients) -> normaliza embed 1:1 (tabela clients)
- NfseShareMenu -> getSignedUrl(pdf_url) / BillingNfseTab,NfseDetailsSheet -> openStorageFile -> supabase.storage.createSignedUrl (bucket resolvido por prefixo do path)

**Regras de negócio:**
- Normalização timezone-safe: string YYYY-MM-DD recebe 'T12:00:00' antes de new Date() para não deslocar o dia em fusos negativos (BRT) — src/lib/date.ts:60-62
- isPastDate compara com hoje às 00:00:00 (data no passado = vencido) — src/lib/date.ts:114-120
- formatPhone (utils) remove DDI 55 quando há 12-13 dígitos e distingue fixo (10) x celular (11) — src/lib/utils.ts:30-43
- Resolução de bucket por prefixo do path (nfse-files/, nfse/, invoice-documents/, ticket-attachments/), http(s) abre direto, default=nfse-files — src/lib/storage-utils.ts:8-31
- throwIfEdgeFunctionError trata dois modos de falha da edge: error de rede/non-2xx e data.success===false — src/lib/edgeFunctionError.ts:14-19
- useFormPersistence só restaura se houver dado não vazio (hasValidData) e respeita excludeFields ao salvar/restaurar — src/hooks/useFormPersistence.ts:41-48,68
- retryWithBackoff: backoff exponencial 2^attempt*baseDelay, relança no último attempt — src/lib/logger.ts:425-451
- MCP: OAuth issuer construído a partir de VITE_SUPABASE_PROJECT_ID (não SUPABASE_URL, que é proxy do Lovable e faria mcp-js rejeitar tokens) — src/lib/mcp/index.ts:10,18-21
- MCP tools: todas readOnlyHint/idempotentHint, exigem isAuthenticated() e rodam com token do usuário (RLS) — ex. src/lib/mcp/tools/get-ticket.ts:19-24
- search_clients sanitiza wildcards do input (remove % e _) antes do ilike — src/lib/mcp/tools/search-clients.ts:25

**Observações / riscos:**
- DUPLICAÇÃO de formatPhone: src/lib/utils.ts:25 (trata null/undefined, remove DDI 55) e src/lib/phone.ts:1 (mais simples, sem null) coexistem com comportamentos divergentes; ainda há reimplementações locais em CompanyTab.tsx:212-217 (formatCEP/formatPhone) e RequesterContactCard.tsx:30-35 — viola §6.0.2 (fonte única). Consolidar em phone.ts
- DOIS sistemas de toast coexistem: shadcn use-toast (56 imports) e Sonner (padrão declarado no CLAUDE.md §2); ambos montados. use-toast é boilerplate shadcn mas o padrão do projeto é Sonner — redundância
- logger.ts tem 469 linhas e mistura logging genérico + helpers de domínio (billing/payment/nfse) — excede a diretriz de <150-200 linhas (§6.1); remover métodos mortos reduziria substancialmente
- Os 4 arquivos de MCP tools repetem a mesma função supabaseForUser(ctx) (createClient com Authorization Bearer) — candidato a helper compartilhado em src/lib/mcp/
- openStorageFileSafe morto enquanto downloadStorageFileSafe é usado: assimetria sugere que o par 'open' foi esquecido; openStorageFile é chamado sem o wrapper de toast em BillingNfseTab/NfseDetailsSheet (const openUrlOrSigned = openStorageFile)
- logger.getLogs/clearLogs (sessionStorage 'app_logs') sem consumidor de UI: o visualizador de logs (LogsViewerTab) lê a tabela application_logs, não o buffer local — buffer local praticamente inútil

**Arquivos com uso parcial/incerto/nulo:**
- `src/lib/logger.ts` — parcial — Singleton de logging (console+sessionStorage+application_logs) com helpers de domínio + retryWithBackoff + devLog _(evid: logger.auth*/componentError/billingOperation/generateExecutionId e retryWithBackoff usados; paymentOperation/nfseOperation/integrationOperation/invoiceValidationLog/invoiceProcessingLog/getLogs/clearLogs/devLog sem callers)_
- `src/lib/storage-utils.ts` — parcial — Resolução de path->bucket e signed URL / download / open de arquivos do Storage _(evid: getSignedUrl (NfseShareMenu), openStorageFile (BillingNfseTab, NfseDetailsSheet), downloadStorageFileSafe (BillingInvoicesTab) usados; openStorageFileSafe sem callers; downloadStorageFile só uso interno)_
- `src/lib/supabase-helpers.ts` — parcial — unwrapEmbed: normaliza embed PostgREST 1:1 que às vezes vem como array _(evid: 1 caller: DelinquencyReportPage.tsx:132)_
- `src/lib/edgeFunctionError.ts` — parcial — throwIfEdgeFunctionError: normaliza erro de supabase.functions.invoke (error ou data.success===false) _(evid: 1 caller: NfseAvulsaDialog.tsx:227)_


### shared-edge — Edge Functions Compartilhadas / MCP

Modulo composto por helpers Deno compartilhados (auth-helpers, email-helpers, notification-logger, 6 templates react-email) e a edge `mcp` (servidor MCP OAuth do Lovable). Todos os 3 modulos de helper e os 6 templates estao efetivamente importados por edges; nenhum arquivo e orfao. A edge `mcp` e auto-gerada pelo mcpPlugin do Vite a partir de src/lib/mcp e expoe 4 ferramentas read-only que rodam como o usuario (RLS). Achado principal: `mcp` NAO tem entrada em config.toml (herda verify_jwt=true), o que conflita com seu desenho OAuth/discovery, e ela esta totalmente ausente do MAPA_DE_SETORES.

**Integrações:** @lovable.dev/mcp-js@0.20.1 — mcpPlugin (vite.config.ts:6,48) gera supabase/functions/mcp/index.ts a partir de src/lib/mcp; createSupabaseHandler serve o protocolo MCP, Supabase Auth como OAuth issuer para o servidor MCP (auth.oauth.issuer, acceptedAudiences=authenticated), Resend via edge send-email-resend — destino final do HTML montado pelos email-helpers, react-email (@react-email/components@0.0.22) — 6 templates .tsx renderizados por auth-email-hook, Supabase Postgres/RLS — adminClient (service role) em auth-helpers; supabaseForUser (anon key + Bearer do usuario) nas tools MCP

**Fluxos (rota→componente→hook→edge→tabela):**
- Cliente MCP externo -> OAuth (issuer https://<projectRef>.supabase.co/auth/v1, aud=authenticated) -> edge mcp (createSupabaseHandler) -> tool.handler checa ctx.isAuthenticated() -> supabaseForUser(Bearer token) -> tabelas tickets/ticket_comments/clients/contracts (sob RLS do usuario)
- UsersTab/ChangeRole (frontend) -> supabase.functions.invoke('create-user'|'delete-user'|'confirm-user-email'|'update-user-email') -> requireRole(user_roles) + rateLimit(5/min) + acao + logAudit -> tabelas auth/user_roles/audit_logs
- cron generate-monthly-invoices / notify-due-invoices -> getEmailTemplate(email_templates) + getEmailSettings(email_settings,company_settings) -> replaceVariables/wrapInEmailLayout/buildPaymentSectionHtml/applyNotificationMessage -> invoke('send-email-resend') -> Resend; logInvoiceNotification -> invoice_notification_logs
- Supabase Auth Send-Email hook -> auth-email-hook (verify_jwt=false) -> render de _shared/email-templates/*.tsx (signup/invite/magic-link/recovery/email-change/reauthentication) -> envio

**Regras de negócio:**
- requireRole: sem authHeader=401, token invalido=401, sem papel permitido=403 com lista de roles — auth-helpers.ts:52-84
- rateLimit in-memory 5 req/min por chave, por instancia (nao distribuido) — auth-helpers.ts:92-106
- logAudit e best-effort: falha de insert em audit_logs so loga console.error, nao interrompe — auth-helpers.ts:119-130
- getEmailSettings aplica defaults (cor #f59e0b/#1f2937, nome 'Colmeia TI') quando nao ha config — email-helpers.ts:45-56
- replaceVariables suporta {{var}} e blocos condicionais {{#var}}...{{/var}} — email-helpers.ts:104-128
- applyNotificationMessage injeta blockquote personalizado antes de </body> (ou append) — email-helpers.ts:197-201
- buildPaymentSectionHtml e fonte unica do bloco boleto/PIX (fatura mensal + NFS-e); retorna '' sem dados — email-helpers.ts:209-238
- getEmailTemplate so retorna o template se is_active=true — email-helpers.ts:287
- logInvoiceNotification trunca error_message em 1000 chars e e best-effort (catch console.warn) — notification-logger.ts:26,29-31
- MCP: todo handler retorna 'Not authenticated' se !ctx.isAuthenticated() e roda como o usuario (RLS) — mcp/index.ts:27,58,94,127
- MCP list_open_tickets exclui status closed/resolved/cancelled — mcp/index.ts:30; search_clients sanitiza %/_ contra injecao de ilike — mcp/index.ts:97
- MCP OAuth issuer derivado de VITE_SUPABASE_PROJECT_ID (nao de SUPABASE_URL, que e proxy Lovable e quebraria a validacao do token) — src/lib/mcp/index.ts:7-21

**Observações / riscos:**
- config.toml NAO tem entrada para `mcp` -> herda verify_jwt=true. Isso conflita com o desenho OAuth/discovery do MCP (o handler precisa emitir 401 + WWW-Authenticate para negociar o token; o gateway com verify_jwt=true responderia 401 antes, sem os metadados). Porem a edge e auto-gerada pelo plugin Lovable e o deploy/config e gerido pelo Lovable — pode setar verify_jwt=false fora do config.toml. DUVIDA (nao consultei plataforma/banco): confirmar verify_jwt efetivo da funcao mcp no painel Lovable.
- corsHeaders esta DUPLICADO: auth-helpers.ts:4 e email-helpers.ts:10 (esta adiciona Access-Control-Allow-Methods). Duas definicoes paralelas para o mesmo conceito — viola 'fonte unica' do CLAUDE.md.
- forgot-password/index.ts:38 reimplementa inline o branding de _shared/email-templates/recovery.tsx (comentario admite 'espelha o branding') em vez de reutilizar o template — redundancia (dois caminhos para o mesmo e-mail de recuperacao).
- 3 exports de auth-helpers (getEnv, userClientFromAuth, AuthResult) sao usados apenas internamente; poderiam deixar de ser exportados (regra do escoteiro).
- notification-logger.ts:9 tipa channel como 'email'|'whatsapp'. DUVIDA (nao consultei banco): confirmar que a coluna/enum de invoice_notification_logs.channel aceita exatamente esses valores.
- mcp so tem index.ts (sem logic.ts/_test.ts), esperado por ser bundle auto-gerado; a logica das tools vive em src/lib/mcp/tools (tambem sem testes atualmente).

**Arquivos com uso parcial/incerto/nulo:**
- `supabase/functions/_shared/email-templates/recovery.tsx` — parcial — Template react-email de recuperacao de senha _(evid: auth-email-hook/index.ts:8 usa; porem forgot-password/index.ts:38 duplica o branding inline em vez de reutilizar)_


### docs-config — Documentacao Raiz e Config

O módulo é o conjunto de documentação do repo: 12 .md na raiz + CLAUDE.md + docs/ (MAPA_DE_SETORES, REGRAS_DE_COBRANCA) + .lovable/plan.md. Núcleo vivo e canônico (atualizado 2026-07-10): CLAUDE.md, docs/MAPA_DE_SETORES.md, docs/REGRAS_DE_COBRANCA.md, CHANGELOG.md. Vários docs estão stale: IMPLEMENTATION_GUIDE.md descreve uma feature S3 quase toda removida do código; DEPLOYMENT_PLAYBOOK.md tem seção de crons que não bate com a realidade; SYSTEM_DOCUMENTATION.md e README.md citam nomes de função/stack obsoletos; TESTING.md desatualizado. Há forte sobreposição de conteúdo (billing/NFS-e/crons) entre SYSTEM_DOCUMENTATION, MAPA, REGRAS_DE_COBRANCA e DEPLOYMENT_PLAYBOOK — múltiplas fontes de verdade que já divergiram entre si.

**Integrações:** Docs descrevem (não implementam) integrações: Asaas (NFS-e/cobrança), Banco Inter (boleto/PIX mTLS), Resend/SMTP, Evolution/WhatsApp, Telegram, Web Push VAPID, Google Calendar, CheckMK, Tactical RMM, UniFi/Hermes, ReceitaWS (cnpj-lookup), BCB SGS (índices) — detalhados em MAPA §5 e SYSTEM_DOCUMENTATION §23, CLAUDE.md ancora a operação Lovable Cloud: project_id 182f97df-9e8a-4a60-88d3-f5a8ac716937, ref Supabase silefpsayliwqtoskkdz, IMPLEMENTATION_GUIDE cita integração S3-compatível (Netskope/AWS/MinIO/Wasabi/Backblaze) que não tem correspondente vivo no código

**Fluxos (rota→componente→hook→edge→tabela):**
- Onboarding de agente: CLAUDE.md (raiz) → CLAUDE.md do repo → docs/MAPA_DE_SETORES.md §2 índice → §3.x setor → doc especializado (REGRAS_DE_COBRANCA.md / SECURITY.md / TESTING.md / FEATURE_FLAGS.md)
- Regra graphify (CLAUDE.md §graphify + MEMORY.md): graphify query/explain/path → só então ler/grep → após mudar código, graphify update .
- Fluxo de regra de cobrança: CLAUDE.md §8 → docs/REGRAS_DE_COBRANCA.md (R1–R7) ↔ docs/MAPA_DE_SETORES.md §3.5/§3.6 ↔ SYSTEM_DOCUMENTATION.md §3–§8/§21 (mesmo conteúdo em 3 lugares)
- Fluxo de deploy (CLAUDE.md §4): código→git push main; Edge Functions Deno NÃO sobem sozinhas → mcp Lovable send_message; banco→mcp Lovable query_database; crons descritos em DEPLOYMENT_PLAYBOOK §3 vs snapshot real em MAPA §2.1
- Registro de mudança de banco: alteração via Lovable MCP → tabela em MAPA §2.1 'Registro de alterações' + CHANGELOG.md + (quando cobrança) REGRAS_DE_COBRANCA §Verificação

**Regras de negócio:**
- Unicidade de fatura: no máx. 1 fatura não-cancelada por contrato+competência (idx_invoices_contract_month_unique) — docs/REGRAS_DE_COBRANCA.md:20
- Unicidade de NFS-e: no máx. 1 nota viva por fatura (uq_nfse_history_active_per_invoice) + guarda idempotente na action emit — docs/REGRAS_DE_COBRANCA.md:56
- NFS-e emitida na geração da fatura; webhook de pagamento é apenas fallback — docs/REGRAS_DE_COBRANCA.md:49
- Um único payment Asaas por fatura (invoices.asaas_payment_id), idempotente, só regenera com evidência de drift — docs/REGRAS_DE_COBRANCA.md:32
- Frequências billing_frequency: contrato não-mensal fatura só quando meses desde última fatura ≥ intervalo; valor = monthly_value × intervalo — docs/REGRAS_DE_COBRANCA.md:64
- Reajuste FIXO auto-aplica no D-0; IGPM/IPCA/INPC manual; cron 10:00 UTC roda antes da geração 11:00 UTC — docs/REGRAS_DE_COBRANCA.md:74
- Ordem de avaliação de feature flag (enabled→user_ids→roles→rollout hash FNV-1a); chave inexistente = false — FEATURE_FLAGS.md:39
- Anonimizar (não deletar) registros financeiros/auditoria ao remover usuário/cliente referenciado — CLAUDE.md:180 (§7)
- Segredos de backend nunca no frontend; ficam em secrets do Lovable/Supabase, lidos nas edge functions — CLAUDE.md (§4 Configuração / §7)
- RBAC: 6 roles (admin/manager/technician/financial/client/client_master); frontend só UX, proteção real = RLS + edge functions — SECURITY.md:7
- Retenção fiscal: NFS-e 7 anos, boletos/comprovantes 5 anos — DEPLOYMENT_PLAYBOOK.md:385
- Pré-check duplicata de CNPJ: onBlur/onSubmit + defesa dura uq_clients_normalized_document (erro 23505) — ADMIN_TOOLS.md:32

**Observações / riscos:**
- Sobreposição/redundância alta: regras de billing/NFS-e/crons documentadas em 4 lugares (SYSTEM_DOCUMENTATION §3-§8/§21, MAPA §3.5/§3.6/§5, REGRAS_DE_COBRANCA, DEPLOYMENT_PLAYBOOK §3). Já houve drift real (nomes de edge e horários de cron divergem entre eles) — recomenda-se eleger REGRAS_DE_COBRANCA + MAPA como fonte única e reduzir os demais a ponteiros
- IMPLEMENTATION_GUIDE.md é o doc mais obsoleto do conjunto (feature S3 removida) — candidato a arquivar/excluir; ainda está indexado em CLAUDE.md §8, o que pode induzir agentes a erro
- README.md é boilerplate Lovable puro (placeholders, npm/nvm) — substituir por README real ou remover
- CHANGELOG.md acumula muitas entradas '[Não publicado]' sem data — dificulta rastrear cronologia; padronizar datas
- SECURITY.md e TESTING.md têm referências stale (useSecureAction.ts inexistente; contagem/arquivos de teste defasados) — correções pequenas mas induzem confiança falsa
- Docs válidos fora do índice CLAUDE.md §8 (ADMIN_TOOLS, BACKUP_PROCEDURE, PRODUCT_IDEAS) — adicionar ao índice para descoberta
- Não consegui confirmar via banco (regra somente-leitura): snapshot de crons do MAPA §2.1 é de 2026-06-29 e as retenções/E0014 do DEPLOYMENT_PLAYBOOK — anotado como dúvida, não verificado

**Arquivos com uso parcial/incerto/nulo:**
- `ADMIN_TOOLS.md` — parcial — Catálogo de ferramentas admin: duplicatas/merge/exclusão de clientes, gestão de usuários, auditoria _(evid: conteúdo confere (DuplicatesBanner/MergeClientsDialog/DeleteClientButton existem) mas NÃO está no índice §8 do CLAUDE.md; só citado no CHANGELOG)_
- `SECURITY.md` — parcial — Arquitetura de segurança: RBAC, validação, views seguras, RLS, checklist _(evid: referencia src/hooks/useSecureAction.ts que NÃO existe (0 refs em src); última atualização 2026-03-08)_
- `TESTING.md` — parcial — Estratégia de testes Vitest+jsdom, estrutura e cobertura _(evid: diz '5 fluxos críticos' e lista create-ticket.test.tsx; real = 8 arquivos em src/test/integration e create-ticket NÃO existe; tabela de cobertura stale)_
- `DEPLOYMENT_PLAYBOOK.md` — parcial — Playbook de implantação: secrets, integrações, CRONs, troubleshooting, onboarding, SLA _(evid: v1.0 2026-02-13; §3 CRONs desatualizado (nomes/horários não batem com snapshot real do MAPA §2.1))_
- `SYSTEM_DOCUMENTATION.md` — parcial — Documentação técnica completa por módulo (24 seções + 6 fluxos) _(evid: 1590 linhas, 2026-02-13; amplo e majoritariamente válido, mas cita edge send-email-smtp (real: send-email-resend) e sobrepõe muito com MAPA/REGRAS)_
- `IMPLEMENTATION_GUIDE.md` — nao — Guia de uma implementação específica: gestão/processamento de faturas + storage S3-compatível _(evid: descreve s3-storage.ts, S3StorageConfigForm.tsx, InvoiceActionIndicators.tsx, BillingBatchProcessing.tsx, edge test-s3-connection — TODOS ausentes do código; feature removida/refatorada)_
- `README.md` — nao — README padrão gerado pelo Lovable _(evid: boilerplate com placeholders REPLACE_WITH_PROJECT_ID; instrui npm/nvm quando o projeto usa bun (CLAUDE.md §2); 0 refs internas no projeto)_
- `.lovable/plan.md` — nao — Plano de tarefa pontual (bug HTTP 409 do invite-user para qualidade@blendpf.com.br) _(evid: artefato efêmero de sessão Lovable (2026-07-07); não é documentação de referência; 0 refs)_


