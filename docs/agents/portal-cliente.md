# Portal do Cliente

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Área autenticada (rota /portal, roles client/client_master) onde o cliente abre chamados via RPC open_client_portal_ticket, acompanha status em abas (Abertos/Aguardando Avaliação/Fechados), troca comentários públicos e avalia. client_master ganha aba Financeiro (faturas + boleto/PIX/NFS-e como consumo de URLs) e visão "Todos os chamados da empresa". Módulo coeso e totalmente cabeado — nenhum arquivo órfão; toda a resolução de dados é client_contacts->clients por user_id + queries filtradas por client_id sob RLS. Não chama nenhuma edge function diretamente (só 1 RPC SECURITY DEFINER + INSERTs diretos).

## Integrações

- Supabase Auth via useAuth (user/profile/roles/signOut) + Postgres/RLS como proteção real
- RPC open_client_portal_ticket (SECURITY DEFINER) — única 'API' de escrita de chamado
- Boleto/PIX/NFS-e: apenas CONSUMO de URLs já gravadas (boleto_url, boleto_barcode, pix_code, pdf_url) — sem chamada a Asaas/Inter/provedor NFS-e
- useClientMonitoredDevices (RMM/monitoramento) alimenta o DeviceSelector do form
- KBSuggestions (base de conhecimento) sugere artigos durante a abertura
- TicketRatingDialog (módulo tickets/gamificação) para avaliação
- useFormPersistence (rascunho em sessionStorage, key 'ticket_portal')

## Fluxos (rota → componente → hook → edge → tabela)

- /portal (ProtectedRoute client|client_master) -> ClientPortalPage -> query client-user (client_contacts.maybeSingle -> clients por user_id) -> query tickets (client_id + requester_contact_id se !master||viewMode='my') -> ClientTicketsList + ClientTicketDetailPanel -> tabelas tickets, ticket_categories, client_contacts
- Abrir chamado: ClientPortalPage -> NewTicketDialog -> ClientTicketForm (Zod + isContactBlockValid) -> supabase.rpc('open_client_portal_ticket') [RPC SECURITY DEFINER valida contato/role/FKs] -> INSERT tickets(origin='portal') + INSERT ticket_history -> invalidate ['client-tickets']
- Comentar: ClientTicketDetailPanel -> SELECT ticket_comments(is_internal=false) + SELECT profiles(nomes) -> INSERT direto ticket_comments(user_id, is_internal=false) [sem edge, RLS é o gate]
- Financeiro (client_master): ClientPortalNav -> ClientPortalFinancialTab -> SELECT invoices(neq status='cancelled', filtro) + SELECT nfse_history(status='autorizada') -> consumo de boleto_url/boleto_barcode/pix_code (clipboard) e pdf_url (window.open)
- Avaliação: ClientTicketsList aba 'resolved' (resolved sem satisfaction_rating) -> onRate -> TicketRatingDialog (módulo tickets) -> grava satisfaction_rating

## Regras de negócio

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

## Arquivos-chave

- `src/pages/client-portal/ClientPortalPage.tsx` — Página/orquestrador do portal: resolve cliente por user_id, carrega tickets/contratos/assets/categorias, alterna seções e monta os cards/listas
- `src/pages/client-portal/components/ClientPortalHeader.tsx` — Cabeçalho do portal (título, link Meu Perfil, Sair)
- `src/pages/client-portal/components/ClientPortalNav.tsx` — Navegação Chamados/Financeiro (renderizada só para client_master); exporta type PortalSection
- `src/pages/client-portal/components/ClientTicketsList.tsx` — Lista de chamados em 3 abas (Abertos/Aguardando Avaliação/Fechados) com toggle Meus/Todos para master
- `src/pages/client-portal/components/ClientTicketDetailPanel.tsx` — Painel de detalhe do chamado: lê comentários públicos (+nomes via profiles) e insere comentário direto
- `src/pages/client-portal/components/NewTicketDialog.tsx` — Dialog wrapper que embrulha ClientTicketForm para abrir novo chamado
- `src/pages/client-portal/components/portal-types.ts` — Tipo PortalTicket + mapas statusLabels/statusColors/priorityLabels compartilhados na área de chamados
- `src/components/client-portal/ClientTicketForm.tsx` — Formulário de abertura de chamado (Zod, rascunho de sessão, DeviceSelector, KBSuggestions) que chama a RPC open_client_portal_ticket
- `src/components/client-portal/ContactBlock.tsx` — Bloco 'contato para retorno' (você vs outra pessoa, telefone/WhatsApp) + isContactBlockValid; força modo 'outra pessoa' quando não há telefone padrão
- `src/components/client-portal/ClientPortalFinancialTab.tsx` — Aba financeira do client_master: cards (em aberto/vencido/pago no mês), tabela de faturas, cópia boleto/PIX e download NFS-e
- `supabase/migrations/20260519175933_harden_open_client_portal_ticket.sql` — Backend do módulo: RPC SECURITY DEFINER que valida sessão/contato/role/tamanhos/telefone/FKs e insere ticket (origin='portal') + ticket_history

## Pontos de atenção / riscos

- BUG visual: ClientPortalFinancialTab tem statusLabels para 'renegotiated'/'lost' mas statusConfig só cobre pending/paid/overdue/cancelled; fallback é statusConfig.pending (linha 223) -> ícone/cor de 'pendente' com label correto. A query só exclui 'cancelled' (linha 82) e o filtro oferece pending/overdue/paid, então faturas renegotiated/lost PODEM aparecer com visual errado: ClientPortalFinancialTab.tsx:43-69,223
- client-user usa .maybeSingle() em client_contacts (ClientPortalPage.tsx:40): usuário com >1 contato faz o Supabase lançar erro (PGRST116), enquanto a RPC resolve com ORDER BY is_active DESC, created_at ASC. Inconsistência UI vs RPC.
- DÚVIDA (não consultei o banco): abrir chamado/comentar pelo portal não invoca send-ticket-notification no frontend; se não houver trigger de notificação em tickets/ticket_comments, staff não é avisado de atividade do portal. Verificar existência de trigger DB.
- Duplicação de mapas de status: portal-types.ts (statusLabels/statusColors de tickets) e statusLabels local do FinancialTab, além dos mapas dos módulos tickets/billing. Sem fonte única.
- Aba 'resolved' fica presa se o cliente nunca avaliar (o ticket só sai da aba ao ganhar satisfaction_rating): ClientTicketsList.tsx:31 + ClientPortalPage.tsx:114
- Convenção de tamanho: ClientPortalFinancialTab.tsx (333 linhas) e ClientTicketForm.tsx (259 linhas) excedem o limite de ~150-200 do CLAUDE.md.
- Inconsistência de acesso: aba Financeiro é gated só para client_master no UI, mas (conforme MAPA linha 766) a RLS de invoices/nfse_history libera SELECT também para client — não verificado aqui (read-only, sem consulta ao banco).
- Sem anexos na abertura de chamado do portal (RPC não recebe arquivos) — MAPA aponta como bloqueador para o projeto ALTAHU.
- TicketRatingDialog (fora do escopo primário, módulo tickets) é o fluxo de avaliação; MAPA linha 722 registra bug crítico de RLS onde a concessão de pontos de gamificação seria bloqueada para client/client_master — não reauditado aqui pois é componente compartilhado do módulo tickets.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `PortalTicket.ticket_categories (campo) + join ticket_categories(name) no SELECT de tickets` (src/pages/client-portal/components/portal-types.ts:13 / src/pages/client-portal/ClientPortalPage.tsx:61) — Categoria é buscada no join da query de tickets e declarada na interface, mas nunca renderizada em nenhum componente do portal (ClientTicketsList/DetailPanel não exibem categoria). Peso morto na query.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §3.14 obs (linha 773) diz 'Financeiro declarado esqueleto no roadmap' — DIVERGENTE: ClientPortalFinancialTab está funcional (3 cards de totais, tabela de faturas, cópia de boleto/código de barras/PIX e download de NFS-e). Não é esqueleto.
- MAPA checklist (linha 783) 'Verificar GRANT EXECUTE da versao hardened da RPC' — pode ser fechado: o GRANT EXECUTE existe na migration base 20260512043108:115 e o harden usa CREATE OR REPLACE (preserva grants).
- MAPA está, no geral, fiel ao código real da §3.14 (lista de componentes linha 750, ausência de edge functions linha 754, fluxo de dados linha 759 conferem). As observações 767 (statusConfig sem renegotiated/lost), 765 (.maybeSingle com >1 contato) e 764 (sem notificação ao staff) foram CONFIRMADAS no código — não são divergências.

