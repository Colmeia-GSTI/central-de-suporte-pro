# Compartilhados: libs, hooks, primitivos UI e helpers de edge

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).


---

# Libs e Hooks Compartilhados

## Escopo

Utilitários puros e hooks reutilizáveis do frontend, quase todos em uso ativo e bem testados (date.ts tem suíte completa). O logger é a peça mais problemática: um singleton grande onde ~7 métodos de negócio (payment/nfse/integration/validation/processing + getLogs/clearLogs) e o wrapper devLog têm zero chamadas — código morto acumulado. Há duplicação real de formatação de telefone (formatPhone existe em utils.ts E phone.ts com comportamentos divergentes, mais reimplementações locais em CompanyTab). O módulo src/lib/mcp é um servidor MCP (4 tools) compilado para a edge function supabase/functions/mcp via plugin Vite — em uso, porém totalmente ausente do MAPA.

## Integrações

- @lovable.dev/mcp-js (defineMcp/defineTool/auth OAuth) + plugin Vite stacks/supabase → edge function supabase/functions/mcp
- Supabase Storage (createSignedUrl/download) via storage-utils com buckets nfse-files/invoice-documents/ticket-attachments
- Supabase PostgREST tabela application_logs (logger.persistToDatabase)
- date-fns / date-fns/locale ptBR (date.ts); clsx + tailwind-merge (utils.cn); sonner (toasts nos wrappers *Safe do storage-utils); zod (schemas das MCP tools)

## Fluxos (rota → componente → hook → edge → tabela)

- Campo de busca -> useDebounce -> React Query refetch: TicketsPage/ClientsPage/InventoryPage/MonitoringPage/KnowledgePage
- Formulário (TicketForm/ClientForm/InvoiceForm/…) -> useFormPersistence -> sessionStorage/localStorage chave 'form_draft_<key>' (restore no mount, save debounced, clearDraft no submit)
- ErrorBoundary.tsx -> logger.componentError -> persistLog (sessionStorage 'app_logs'); NÃO persiste em banco
- BillingInvoicesTab -> logger.billingOperation(persistToDb=true) -> supabase.from('application_logs').insert (tabela application_logs)
- BillingInvoicesTab -> retryWithBackoff -> supabase.functions.invoke('generate-monthly-invoices'); PDFs via downloadStorageFileSafe -> supabase.storage (buckets nfse-files/invoice-documents)
- Cliente MCP externo -> /functions/v1/mcp (supabase/functions/mcp, build de src/lib/mcp via vite mcpPlugin) -> tools -> supabase (tickets, ticket_comments, clients, contracts) sob RLS do usuário autenticado
- NfseAvulsaDialog -> supabase.functions.invoke -> throwIfEdgeFunctionError(data,error)
- DelinquencyReportPage -> unwrapEmbed(inv.clients) -> normaliza embed 1:1 (tabela clients)
- NfseShareMenu -> getSignedUrl(pdf_url) / BillingNfseTab,NfseDetailsSheet -> openStorageFile -> supabase.storage.createSignedUrl (bucket resolvido por prefixo do path)

## Regras de negócio

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

## Arquivos-chave

- `src/lib/utils.ts` — cn (tailwind-merge), getErrorMessage, formatPhone e formatCEP (formatação BR)
- `src/lib/logger.ts` — Singleton de logging (console+sessionStorage+application_logs) com helpers de domínio + retryWithBackoff + devLog _(uso: parcial)_
- `src/lib/phone.ts` — formatPhone, stripPhone, isPhoneValid (máscara/validação de telefone BR)
- `src/lib/date.ts` — formatDate/formatRelative/isPastDate timezone-safe (pt-BR, variantes de formato)
- `src/lib/date.test.ts` — Testes Vitest de date.ts (variantes, timezone, fallback)
- `src/lib/storage-utils.ts` — Resolução de path->bucket e signed URL / download / open de arquivos do Storage _(uso: parcial)_
- `src/lib/supabase-helpers.ts` — unwrapEmbed: normaliza embed PostgREST 1:1 que às vezes vem como array _(uso: parcial)_
- `src/lib/edgeFunctionError.ts` — throwIfEdgeFunctionError: normaliza erro de supabase.functions.invoke (error ou data.success===false) _(uso: parcial)_
- `src/lib/mcp/index.ts` — defineMcp: servidor MCP 'colmeia-mcp' com OAuth issuer e 4 tools
- `src/lib/mcp/tools/list-open-tickets.ts` — MCP tool list_open_tickets (chamados não fechados, RLS do usuário)
- `src/lib/mcp/tools/get-ticket.ts` — MCP tool get_ticket (ticket + comments por UUID)
- `src/lib/mcp/tools/search-clients.ts` — MCP tool search_clients (nome/CNPJ, ilike sanitizado)
- `src/lib/mcp/tools/list-active-contracts.ts` — MCP tool list_active_contracts (status=active, filtro opcional por client)
- `src/hooks/useDebounce.ts` — useDebounce<T>: valor debounced para campos de busca
- `src/hooks/use-mobile.tsx` — useIsMobile: matchMedia breakpoint 768px
- `src/hooks/use-toast.ts` — useToast/toast (padrão shadcn, reducer in-memory)
- `src/hooks/useFormPersistence.ts` — useFormPersistence: rascunho de formulário em session/localStorage com debounce e restore gate

## Pontos de atenção / riscos

- DUPLICAÇÃO de formatPhone: src/lib/utils.ts:25 (trata null/undefined, remove DDI 55) e src/lib/phone.ts:1 (mais simples, sem null) coexistem com comportamentos divergentes; ainda há reimplementações locais em CompanyTab.tsx:212-217 (formatCEP/formatPhone) e RequesterContactCard.tsx:30-35 — viola §6.0.2 (fonte única). Consolidar em phone.ts
- DOIS sistemas de toast coexistem: shadcn use-toast (56 imports) e Sonner (padrão declarado no CLAUDE.md §2); ambos montados. use-toast é boilerplate shadcn mas o padrão do projeto é Sonner — redundância
- logger.ts tem 469 linhas e mistura logging genérico + helpers de domínio (billing/payment/nfse) — excede a diretriz de <150-200 linhas (§6.1); remover métodos mortos reduziria substancialmente
- Os 4 arquivos de MCP tools repetem a mesma função supabaseForUser(ctx) (createClient com Authorization Bearer) — candidato a helper compartilhado em src/lib/mcp/
- openStorageFileSafe morto enquanto downloadStorageFileSafe é usado: assimetria sugere que o par 'open' foi esquecido; openStorageFile é chamado sem o wrapper de toast em BillingNfseTab/NfseDetailsSheet (const openUrlOrSigned = openStorageFile)
- logger.getLogs/clearLogs (sessionStorage 'app_logs') sem consumidor de UI: o visualizador de logs (LogsViewerTab) lê a tabela application_logs, não o buffer local — buffer local praticamente inútil

## Código morto — tratado na Fase 2 ou pendente de decisão

- `devLog` (src/lib/logger.ts:455) — Wrapper console dev-only nunca importado; substituído na prática pelo singleton logger
- `Logger.paymentOperation` (src/lib/logger.ts:175) — Método público do logger sem nenhum caller
- `Logger.nfseOperation` (src/lib/logger.ts:203) — Método público do logger sem nenhum caller
- `Logger.integrationOperation` (src/lib/logger.ts:238) — Método público do logger sem nenhum caller
- `Logger.invoiceValidationLog` (src/lib/logger.ts:268) — Método público do logger sem nenhum caller
- `Logger.invoiceProcessingLog` (src/lib/logger.ts:308) — Método público do logger sem nenhum caller
- `Logger.getLogs` (src/lib/logger.ts:390) — Getter de logs em sessionStorage sem consumidor (LogsViewerTab usa application_logs no banco, não este)
- `Logger.clearLogs` (src/lib/logger.ts:399) — Limpeza de logs locais sem caller
- `openStorageFileSafe` (src/lib/storage-utils.ts:141) — Wrapper com toast de openStorageFile nunca importado (só o par downloadStorageFileSafe é usado)

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA L945-946 (setor Fundação/Infra) afirma 'Nenhuma edge function propria', mas src/lib/mcp compila para a edge function real supabase/functions/mcp via mcpPlugin() (vite.config.ts:48) — o servidor MCP e suas 4 tools estão inteiramente ausentes do MAPA
- MAPA L518 lista 'use-mobile.ts' e 'useAuth.ts'; arquivos reais são use-mobile.tsx e useAuth.tsx (extensão .tsx)
- MAPA não documenta em lugar nenhum os utilitários compartilhados src/lib/phone.ts, src/lib/date.ts, nem retryWithBackoff/devLog do logger — lacuna de cobertura do inventário
- MAPA trata logger.ts como caminho de app-logging (L847-856) sem sinalizar que ~7 métodos de negócio + getLogs/clearLogs + devLog são código morto (0 callers)


---

# Primitivos de UI (shadcn)

## Escopo

41 arquivos em src/components/ui: ~34 primitivos shadcn/Radix vendored + 7 componentes custom do projeto (ColmeiaLogo, HoneycombLoader, EntityHistoryTimeline, DraftRecoveryBanner, loading-skeleton, confirm-dialog, currency-input). NENHUM arquivo do escopo esta 100% orfao — todos tem >=1 importador externo. Estado geral saudavel; achados sao a nivel de simbolo: 5 dos 6 skeletons de loading-skeleton.tsx sao codigo morto, e ha dois sistemas de toast paralelos (Radix + Sonner) ambos montados. Graphify nao modela bem esta camada (folhas de UI); a evidencia forte veio de grep global de import paths.

## Integrações

- Radix UI (base da maioria dos primitivos)
- sonner (2o sistema de toast, ui/sonner.tsx)
- cmdk (ui/command.tsx)
- react-day-picker (ui/calendar.tsx)
- react-hook-form (ui/form.tsx)
- class-variance-authority + lib/utils cn (variantes/merge de classes)

## Fluxos (rota → componente → hook → edge → tabela)

- App.tsx (L2-3,66-67) monta <Toaster/> (Radix, ui/toaster->ui/toast, via hook use-toast) E <Sonner/> (ui/sonner) — dois sistemas de toast paralelos; sem tabela (camada de apresentacao)
- Formularios (ContractForm/InvoiceForm/ServiceForm) -> ui/currency-input -> lib/currency.ts (mask/parse BRL) -> valor numerico no form/Zod
- DeleteClientButton/ContractInvoiceActionsMenu/etc. -> ui/confirm-dialog -> ui/alert-dialog (Radix) -> callback onConfirm (sem tabela direta)
- AnimatedRoutes.tsx (Suspense fallback) & Setup.tsx -> ui/HoneycombLoader (loader de lazy routes)
- TicketDetailsTab.tsx -> ui/EntityHistoryTimeline (renderiza historico ja carregado; sem query propria)

## Regras de negócio

- Mascara/parse de moeda BRL delegada a fonte unica lib/currency.ts (maskCurrencyBRL/parseCurrencyBRL) — src/components/ui/currency-input.tsx:21-23
- ConfirmDialog: labels default pt-BR ('Confirmar'/'Cancelar') e styling do variant 'destructive' para acoes perigosas — src/components/ui/confirm-dialog.tsx:33-34,51
- App.tsx: falha de chunk (import dinamico) dispara toast Sonner + reload automatico apos 2s — src/App.tsx:46-49 (usa o toast do Sonner, nao o Radix)

## Arquivos-chave

- `src/components/ui/button.tsx` — Botao base (Radix Slot) + buttonVariants (cva)
- `src/components/ui/badge.tsx` — Badge/etiqueta com variantes
- `src/components/ui/input.tsx` — Input de texto base
- `src/components/ui/card.tsx` — Card + Header/Title/Description/Content/Footer
- `src/components/ui/label.tsx` — Label (Radix)
- `src/components/ui/select.tsx` — Select (Radix)
- `src/components/ui/skeleton.tsx` — Skeleton atomico (base do loading-skeleton)
- `src/components/ui/textarea.tsx` — Textarea base
- `src/components/ui/dialog.tsx` — Dialog/modal (Radix)
- `src/components/ui/table.tsx` — Table + sub-partes _(uso: parcial)_
- `src/components/ui/switch.tsx` — Switch/toggle (Radix)
- `src/components/ui/form.tsx` — Wrappers react-hook-form (FormField/Item/Label/Control/Message)
- `src/components/ui/sheet.tsx` — Sheet/drawer lateral (Radix Dialog)
- `src/components/ui/confirm-dialog.tsx` — Wrapper de AlertDialog para confirmacao (labels pt-BR, variant destructive)
- `src/components/ui/alert.tsx` — Alert inline + variantes
- `src/components/ui/separator.tsx` — Separador (Radix)
- `src/components/ui/collapsible.tsx` — Collapsible (Radix)
- `src/components/ui/tooltip.tsx` — Tooltip (Radix) + TooltipProvider (App.tsx)
- `src/components/ui/tabs.tsx` — Tabs (Radix)
- `src/components/ui/popover.tsx` — Popover (Radix)
- `src/components/ui/checkbox.tsx` — Checkbox (Radix)
- `src/components/ui/scroll-area.tsx` — ScrollArea (Radix)
- `src/components/ui/dropdown-menu.tsx` — DropdownMenu (Radix) + sub-partes _(uso: parcial)_
- `src/components/ui/calendar.tsx` — Calendario (react-day-picker)
- `src/components/ui/radio-group.tsx` — RadioGroup (Radix)
- `src/components/ui/DraftRecoveryBanner.tsx` — Banner de recuperacao de rascunho de formulario (componente de DOMINIO, nao primitivo)
- `src/components/ui/currency-input.tsx` — Input com mascara BRL (usa currency.ts)
- `src/components/ui/alert-dialog.tsx` — AlertDialog (Radix), base do confirm-dialog
- `src/components/ui/avatar.tsx` — Avatar (Radix)
- `src/components/ui/command.tsx` — Command palette/combobox (cmdk)
- `src/components/ui/progress.tsx` — Barra de progresso (Radix)
- `src/components/ui/accordion.tsx` — Accordion (Radix)
- `src/components/ui/sidebar.tsx` — Sistema de sidebar shadcn completo (637 linhas, Provider/Menu/etc.) _(uso: parcial)_
- `src/components/ui/loading-skeleton.tsx` — 6 skeletons compostos (Page/Table/Card/Form/Dashboard/List) _(uso: parcial)_
- `src/components/ui/HoneycombLoader.tsx` — Loader animado (favo de mel) da marca
- `src/components/ui/toaster.tsx` — Toaster Radix (renderiza toasts do use-toast)
- `src/components/ui/toast.tsx` — Primitivos de toast Radix (usados por toaster.tsx e use-toast.ts)
- `src/components/ui/sonner.tsx` — Toaster do Sonner (2o sistema de toast)
- `src/components/ui/pagination.tsx` — Paginacao shadcn (81 linhas) _(uso: parcial)_
- `src/components/ui/EntityHistoryTimeline.tsx` — Timeline generica de historico de entidade (178 linhas)
- `src/components/ui/ColmeiaLogo.tsx` — Logo SVG da marca Colmeia

## Pontos de atenção / riscos

- NENHUM arquivo do escopo (41) esta 100% orfao — todos tem >=1 importador externo; nao ha primitivo-arquivo morto.
- DUPLICACAO (viola CLAUDE.md 6.0.2 'fonte unica'): dois sistemas de toast coexistem e ambos sao usados — Radix (ui/toast+ui/toaster+hooks/use-toast, useToast em ~50 arquivos) e Sonner (ui/sonner, toast() em App.tsx). Ambos montados em App.tsx L66-67. Consolidar reduziria bundle e ambiguidade.
- loading-skeleton.tsx: 5 de 6 exports (Page/Table/Form/Dashboard/List) sao codigo morto — candidato a poda; so CardSkeleton sobrevive.
- DraftRecoveryBanner.tsx e componente de DOMINIO (recuperacao de rascunho) morando em ui/; pelo padrao do projeto (CLAUDE.md 5/6.1) deveria estar em components/<dominio> — questao de organizacao, nao de uso.
- sidebar.tsx (637 linhas) e pagination.tsx sao blocos shadcn vendored completos com muitos sub-exports nao usados — esperado para vendored; poda opcional de baixa prioridade, nao mexer se for regerar via CLI.
- Sub-exports shadcn vendored sem uso (TableFooter/TableCaption, DropdownMenu Checkbox/Radio/Shortcut, PaginationEllipsis) sao normais e devem ser mantidos para nao divergir do upstream.
- graphify nao modela util esta camada de folhas de UI (query/explain nao retornaram os primitivos); a evidencia de uso veio de grep de import paths — anotar como limitacao do grafo para este modulo.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `PageSkeleton` (src/components/ui/loading-skeleton.tsx:3) — Export nunca importado (so CardSkeleton e usado deste arquivo)
- `TableSkeleton` (src/components/ui/loading-skeleton.tsx:20) — Export nunca importado
- `FormSkeleton` (src/components/ui/loading-skeleton.tsx:68) — Export nunca importado
- `DashboardSkeleton` (src/components/ui/loading-skeleton.tsx:82) — Export nunca importado
- `ListSkeleton` (src/components/ui/loading-skeleton.tsx:109) — Export nunca importado
- `TableFooter, TableCaption` (src/components/ui/table.tsx) — Sub-exports shadcn vendored nunca usados fora do arquivo (baixa prioridade — parte de bloco vendored)
- `DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuShortcut` (src/components/ui/dropdown-menu.tsx) — Sub-exports shadcn vendored sem referencia externa (vendored — manter)
- `PaginationEllipsis` (src/components/ui/pagination.tsx) — Sub-export vendored sem referencia externa
- `SidebarInput, SidebarMenuBadge, SidebarMenuSkeleton, SidebarGroupAction, SidebarRail, SidebarMenuAction` (src/components/ui/sidebar.tsx) — Sub-exports do bloco sidebar shadcn (637 linhas) nunca usados (vendored — manter)

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA_DE_SETORES.md nao possui um setor dedicado 'Primitivos de UI (shadcn)'; primitivos aparecem apenas de passagem no setor Fundacao, citando so sidebar.tsx e confirm-dialog.tsx.
- MAPA nao enumera nenhum dos 7 componentes CUSTOM que vivem em src/components/ui/ (ColmeiaLogo, HoneycombLoader, EntityHistoryTimeline, DraftRecoveryBanner, loading-skeleton, currency-input) — omissao no mapa.
- MAPA nao registra o codigo morto de loading-skeleton.tsx (5 de 6 skeletons sem uso) nem a duplicacao dos dois sistemas de toast (Radix Toaster + Sonner ambos montados em App.tsx).


---

# Edge Functions Compartilhadas / MCP

## Escopo

Modulo composto por helpers Deno compartilhados (auth-helpers, email-helpers, notification-logger, 6 templates react-email) e a edge `mcp` (servidor MCP OAuth do Lovable). Todos os 3 modulos de helper e os 6 templates estao efetivamente importados por edges; nenhum arquivo e orfao. A edge `mcp` e auto-gerada pelo mcpPlugin do Vite a partir de src/lib/mcp e expoe 4 ferramentas read-only que rodam como o usuario (RLS). Achado principal: `mcp` NAO tem entrada em config.toml (herda verify_jwt=true), o que conflita com seu desenho OAuth/discovery, e ela esta totalmente ausente do MAPA_DE_SETORES.

## Integrações

- @lovable.dev/mcp-js@0.20.1 — mcpPlugin (vite.config.ts:6,48) gera supabase/functions/mcp/index.ts a partir de src/lib/mcp; createSupabaseHandler serve o protocolo MCP
- Supabase Auth como OAuth issuer para o servidor MCP (auth.oauth.issuer, acceptedAudiences=authenticated)
- Resend via edge send-email-resend — destino final do HTML montado pelos email-helpers
- react-email (@react-email/components@0.0.22) — 6 templates .tsx renderizados por auth-email-hook
- Supabase Postgres/RLS — adminClient (service role) em auth-helpers; supabaseForUser (anon key + Bearer do usuario) nas tools MCP

## Fluxos (rota → componente → hook → edge → tabela)

- Cliente MCP externo -> OAuth (issuer https://<projectRef>.supabase.co/auth/v1, aud=authenticated) -> edge mcp (createSupabaseHandler) -> tool.handler checa ctx.isAuthenticated() -> supabaseForUser(Bearer token) -> tabelas tickets/ticket_comments/clients/contracts (sob RLS do usuario)
- UsersTab/ChangeRole (frontend) -> supabase.functions.invoke('create-user'|'delete-user'|'confirm-user-email'|'update-user-email') -> requireRole(user_roles) + rateLimit(5/min) + acao + logAudit -> tabelas auth/user_roles/audit_logs
- cron generate-monthly-invoices / notify-due-invoices -> getEmailTemplate(email_templates) + getEmailSettings(email_settings,company_settings) -> replaceVariables/wrapInEmailLayout/buildPaymentSectionHtml/applyNotificationMessage -> invoke('send-email-resend') -> Resend; logInvoiceNotification -> invoice_notification_logs
- Supabase Auth Send-Email hook -> auth-email-hook (verify_jwt=false) -> render de _shared/email-templates/*.tsx (signup/invite/magic-link/recovery/email-change/reauthentication) -> envio

## Regras de negócio

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

## Arquivos-chave

- `supabase/functions/_shared/auth-helpers.ts` — Auth/authz de edges: corsHeaders, jsonResponse, adminClient, requireRole, rateLimit in-memory, logAudit
- `supabase/functions/_shared/email-helpers.ts` — Montagem de e-mail: getEmailSettings, wrapInEmailLayout, replaceVariables, format*BRL/BR, escapeHtml, applyNotificationMessage(Text), buildPaymentSectionHtml, getEmailTemplate
- `supabase/functions/_shared/email-helpers_test.ts` — Testes Deno de buildPaymentSectionHtml (boleto/PIX/vazio)
- `supabase/functions/_shared/notification-logger.ts` — logInvoiceNotification: insert best-effort em invoice_notification_logs
- `supabase/functions/_shared/email-templates/signup.tsx` — Template react-email de confirmacao de cadastro
- `supabase/functions/_shared/email-templates/invite.tsx` — Template react-email de convite
- `supabase/functions/_shared/email-templates/magic-link.tsx` — Template react-email de magic link
- `supabase/functions/_shared/email-templates/recovery.tsx` — Template react-email de recuperacao de senha _(uso: parcial)_
- `supabase/functions/_shared/email-templates/email-change.tsx` — Template react-email de troca de e-mail
- `supabase/functions/_shared/email-templates/reauthentication.tsx` — Template react-email de reautenticacao
- `supabase/functions/mcp/index.ts` — Bundle AUTO-GERADO da edge MCP (Deno.serve createSupabaseHandler) com 4 tools + OAuth issuer
- `src/lib/mcp/index.ts` — Fonte da edge MCP: defineMcp com issuer OAuth e 4 tools
- `src/lib/mcp/tools/list-open-tickets.ts` — Tool MCP: lista tickets nao-fechados
- `src/lib/mcp/tools/get-ticket.ts` — Tool MCP: detalhe de ticket + comentarios
- `src/lib/mcp/tools/search-clients.ts` — Tool MCP: busca clientes por nome/CNPJ (sanitiza %/_)
- `src/lib/mcp/tools/list-active-contracts.ts` — Tool MCP: lista contratos ativos
- `supabase/config.toml` — Config de verify_jwt por edge (17 entradas, todas verify_jwt=false)

## Pontos de atenção / riscos

- config.toml NAO tem entrada para `mcp` -> herda verify_jwt=true. Isso conflita com o desenho OAuth/discovery do MCP (o handler precisa emitir 401 + WWW-Authenticate para negociar o token; o gateway com verify_jwt=true responderia 401 antes, sem os metadados). Porem a edge e auto-gerada pelo plugin Lovable e o deploy/config e gerido pelo Lovable — pode setar verify_jwt=false fora do config.toml. DUVIDA (nao consultei plataforma/banco): confirmar verify_jwt efetivo da funcao mcp no painel Lovable.
- corsHeaders esta DUPLICADO: auth-helpers.ts:4 e email-helpers.ts:10 (esta adiciona Access-Control-Allow-Methods). Duas definicoes paralelas para o mesmo conceito — viola 'fonte unica' do CLAUDE.md.
- forgot-password/index.ts:38 reimplementa inline o branding de _shared/email-templates/recovery.tsx (comentario admite 'espelha o branding') em vez de reutilizar o template — redundancia (dois caminhos para o mesmo e-mail de recuperacao).
- 3 exports de auth-helpers (getEnv, userClientFromAuth, AuthResult) sao usados apenas internamente; poderiam deixar de ser exportados (regra do escoteiro).
- notification-logger.ts:9 tipa channel como 'email'|'whatsapp'. DUVIDA (nao consultei banco): confirmar que a coluna/enum de invoice_notification_logs.channel aceita exatamente esses valores.
- mcp so tem index.ts (sem logic.ts/_test.ts), esperado por ser bundle auto-gerado; a logica das tools vive em src/lib/mcp/tools (tambem sem testes atualmente).

## Notas de divergência (auditoria vs MAPA antigo)

- A edge `mcp` NAO aparece em nenhum ponto de docs/MAPA_DE_SETORES.md: ausente da lista de edges de Auth (L119), ausente da tabela de integracoes Supabase 'auth-helpers, auth-email-hook, certificate-vault + ~50' (L1002) e nao ha secao MCP. Integracao Lovable mcp-js/OAuth nao documentada.
- O MAPA cataloga exaustivamente edges sem entrada em config.toml que herdam verify_jwt=true (asaas, banco-inter, whatsapp-status, resend-status, send-push, etc. — §7.2 e varias linhas), mas OMITE que `mcp` tambem esta fora do config.toml herdando verify_jwt=true — inconsistente com o proprio rastreamento de risco do MAPA.
- MAPA L119 lista os helpers _shared (auth-helpers/email-helpers/email-templates) na secao Auth mas nao cita _shared/notification-logger.ts ali (aparece so na secao Notificacoes L465) — cobertura fragmentada.

