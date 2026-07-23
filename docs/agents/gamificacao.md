# Gamificação

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo puramente de leitura: uma página (/gamification) mostra ranking de técnicos por pontos (RPC get_technician_ranking), catálogo de badges e metas ativas, mais um widget mini-ranking no Dashboard. A ÚNICA escrita de pontos está fora do módulo, em TicketRatingDialog (avaliação do cliente >=4 estrelas insere em technician_points). Não há edge function dedicada. O módulo está inteiro por trás da feature flag gamification_enabled (default false), então na prática está dormente: a rota redireciona para "/" e o widget/sidebar somem. Contém código morto/decorativo relevante (mapa de ícones que nunca casa, progresso de metas fixo em 0, tabela technician_badges sem uso).

## Integrações

- Nenhuma integração externa (sem edge function, webhook ou API de terceiros no módulo).
- RPC compartilhada get_technician_ranking também consumida fora do escopo: src/pages/tv-dashboard/TVDashboardPage.tsx:97 e src/pages/reports/ReportsPage.tsx:116.
- Feature flag gamification_enabled (sistema feature_flags + useFeatureFlag) governa toda a visibilidade — CHANGELOG.md:703.

## Fluxos (rota → componente → hook → edge → tabela)

- /gamification → ProtectedRoute(requireStaff) → GamificationGuard(useFeatureFlag gamification_enabled) → GamificationPage → useQuery rpc('get_technician_ranking', start=epoch, limit=10) → technician_points JOIN profiles (SECURITY DEFINER, ORDER points DESC)
- GamificationPage → from('badges').select(id,name,icon,description) → tabela badges (catálogo global, sem relação com técnico)
- GamificationPage → from('gamification_goals').eq(is_active,true) → tabela gamification_goals (progresso não calculado, sempre 0)
- Dashboard {isAdmin && ...} → TechnicianMiniRanking(startDate=periodStart) → useFeatureFlag gamification_enabled → rpc('get_technician_ranking', start=periodStart, limit=5) → technician_points JOIN profiles → Link '/gamification'
- ESCRITA (fora do módulo): Portal do cliente → TicketRatingDialog (rating>=4) → busca tickets.assigned_to → insert technician_points{user_id, points(5★=15|4★=10), reason, ticket_id} → alimenta o ranking

## Regras de negócio

- Pontos por avaliação: só rating>=4 pontua; 5★=15 pts, 4★=10 pts, atribuídos ao tickets.assigned_to — src/components/tickets/TicketRatingDialog.tsx:73,81-87
- Insert de technician_points sem checagem de erro (await solto, sem throw) — src/components/tickets/TicketRatingDialog.tsx:82
- Níveis por faixa de pontos: bronze 0-500, prata 501-1500, ouro 1501-3500, platina 3501-7000, diamante 7001+ — src/pages/gamification/GamificationPage.tsx:21-27 (getLevel L78-84 duplica os limiares)
- Barra de progresso de nível = (points-min)/(max-min)*100, teto 100, diamante sempre 100 — src/pages/gamification/GamificationPage.tsx:86-92
- Ranking da página é all-time (start_date = new Date(0) epoch), top 10 — src/pages/gamification/GamificationPage.tsx:42-43
- Mini-ranking do Dashboard usa o período do dashboard (startDate) e top 5, barras normalizadas pelo 1º colocado — src/components/dashboard/TechnicianMiniRanking.tsx:25,35,101
- RPC get_technician_ranking: SUM(points) por profiles.full_name onde created_at>=start_date, JOIN profiles, ORDER points DESC, SECURITY DEFINER SEM guarda de role — supabase/migrations/20260123141354_...sql:92-124
- Agrupamento do ranking por full_name (não por user_id) — colide/mescla técnicos homônimos — migration ...3141354.sql:106-116
- Visibilidade do módulo 100% via feature flag gamification_enabled (default false): guard de rota, widget retorna null, item do sidebar oculto — AnimatedRoutes.tsx:127-130, TechnicianMiniRanking.tsx:33, AppSidebar.tsx:140

## Arquivos-chave

- `src/pages/gamification/GamificationPage.tsx` — Página /gamification: ranking (RPC), catálogo de badges, metas ativas e guia de níveis (bronze→diamante). _(uso: parcial)_
- `src/components/dashboard/TechnicianMiniRanking.tsx` — Widget 'Top Técnicos' (top 5) no Dashboard via RPC get_technician_ranking, com link para /gamification. _(uso: parcial)_
- `src/components/tickets/TicketRatingDialog.tsx` — Fora do escopo, mas é o ÚNICO ponto de escrita de gamificação: avaliação do cliente >=4★ insere technician_points.

## Pontos de atenção / riscos

- Feature flag default false (CHANGELOG:698,703): módulo inteiro dormente em produção — rota redireciona p/ '/', widget vira null, item do sidebar oculto. Nada 'quebrado' visível ao usuário, mas nada funcional entregue.
- Segurança: get_technician_ranking é SECURITY DEFINER e ignora RLS, sem guarda is_staff/has_role no corpo (migration ...3141354.sql:92-124). Proteção só no frontend (rota). Já apontado em MAPA:727/1453. [dado de banco não consultado — apenas leitura da migration]
- Ranking agrupa por full_name, não user_id (migration ...3141354.sql:106-116): técnicos com nomes iguais são somados juntos; nome nulo/vazio agruparia errado.
- Sistema de badges é meramente decorativo: mostra catálogo global igual para todos, sem premiação real (technician_badges nunca escrita) e com ícones sempre no fallback. Metas idem (progresso fixo 0).
- TicketRatingDialog.tsx:82 faz insert em technician_points sem verificar erro (viola checklist MAPA:732) — falha de premiação passa silenciosa.
- Duplicação de limiares de nível: array levelConfig (L21-27) e função getLevel (L78-84) mantêm os mesmos números em dois lugares na GamificationPage.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `technician_badges (tabela)` (src/integrations/supabase/types.ts:5442) — Tabela existe no schema mas NENHUM código de app (frontend/edge) lê ou escreve. Não há lógica de premiação de badges por técnico; a página só mostra o catálogo global de badges. Badges são 'código morto funcional'.
- `badgeIcons (mapa de ícones)` (src/pages/gamification/GamificationPage.tsx:29-35) — Chaves do mapa são slugs de NOME (velocista, guardiao_sla, maratonista, cinco_estrelas, resolvedor) mas o lookup usa badge.icon (L191), cujos valores no seed são zap/shield/star/trophy/award/book-open. Interseção = ZERO, logo todos os 6 badges caem no fallback <Star>. O mapa inteiro é morto.
- `badges.description (campo selecionado, não exibido)` (src/pages/gamification/GamificationPage.tsx:59) — Query seleciona 'description' dos badges mas a UI (L185-197) só renderiza name+icon; description nunca é exibida.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA:724 subestima o bug de ícones: diz que 'seed usa trophy/award/book-open que caem no fallback'. Na verdade os 6 badges caem no fallback, pois badgeIcons usa chaves de NOME (velocista, guardiao_sla...) e o lookup é por badge.icon (zap/shield/star/...) — interseção zero, inclusive star/zap/shield também falham (GamificationPage.tsx:29-35,191).
- MAPA:703/739 diz 'restrito a staff' e cita guarda de role, mas o enforcement real é apenas requireStaff (rota) + feature flag; a categoria de permissão 'gamification' (permissions.ts:101,198) existe mas NUNCA é aplicada (0 usos de can('gamification')).
- MAPA:716 afirma 'Sem edge function nem integração externa' e trata get_technician_ranking como exclusivo do setor, mas o mesmo RPC é consumido também por TVDashboardPage.tsx:97 e ReportsPage.tsx:116 (fora do módulo) — a RPC não é privativa da gamificação.
- MAPA:712 lista technician_badges como tabela do setor sem sinalizar que ela tem 0 referências no código de app (morta); só types.ts a referencia.
- MAPA:726 lista a inconsistência de período (página all-time vs mini período) como risco — CONFIRMADO no código (GamificationPage.tsx:42 epoch vs TechnicianMiniRanking.tsx:25 startDate); apenas registrando que procede.
- MAPA:723 ('technician_badges e progresso de metas são código morto funcional') e MAPA:727 (RPC SECURITY DEFINER sem filtro de role) — CONFIRMADOS pelo código; sem divergência.

