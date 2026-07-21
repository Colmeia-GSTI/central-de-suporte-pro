# Relatórios, Dashboards e Exportação

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Camada puramente analitica/apresentacional: sem edge functions proprias, consome RPCs agregadoras (get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_weekly_ticket_trend, get_additional_charges_report, get_client_management_report) e queries count/select diretas, renderizando com recharts. Cobre Dashboard da home (com branch por role), pagina de Relatorios em abas, TV Dashboard rotativo e relatorio gerencial por cliente. Estado geral: funcional e bem cabeado nas rotas/sidebar; ha codigo morto real em src/lib/export.ts (exportConfigs e formatters, 0 refs), um bug latente de tipos nao declarados em AdditionalChargesReportTab, e prop/imports mortos menores.

## Integrações

- Nenhuma integracao externa direta no modulo (recharts/date-fns/framer-motion sao UI/render client-side)
- Supabase client (queries diretas) + RPCs Postgres SECURITY DEFINER: get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_weekly_ticket_trend, get_additional_charges_report, get_client_management_report (todas presentes em types.ts L6984-7023)
- Exportacao 100% client-side via Blob/URL.createObjectURL (sem edge function): src/lib/export.ts

## Fluxos (rota → componente → hook → edge → tabela)

- /reports (roles admin,manager,financial) -> ReportsPage -> RPC get_ticket_report_stats + get_invoice_report_stats + get_technician_ranking -> tabelas tickets/invoices/technician_points; aba Horas -> TimeReportTab -> query ticket_time_entries(+tickets,clients,profiles); aba Adicionais -> AdditionalChargesReportTab -> RPC get_additional_charges_report
- / (ProtectedRoute) -> Dashboard -> branch por role: technician->TechnicianDashboard (tickets/monitoring_alerts/calendar_events), financial->FinancialDashboard (invoices/nfse_history); admin -> queries diretas tickets/clients/ticket_ratings + RPC get_weekly_ticket_trend + charts (SLA/Priority/Status/Weekly) + ActivityFeed(ticket_history) + TechnicianMiniRanking(RPC get_technician_ranking, gated feature flag)
- /tv-dashboard (roles admin,manager) -> TVDashboardPage -> queries diretas tickets/monitored_devices + RPC get_technician_ranking (agrega/calcula avg response em JS)
- /clients/:id -> ClientDetailPage -> ClientManagementReport -> RPC get_client_management_report -> ExportButton -> export.ts (exportToCSV/Excel/JSON via Blob)
- TimeReportTab/ClientManagementReport -> ExportButton -> export.ts exportToCSV/exportToExcel/exportToJSON -> download client-side (sem backend)

## Regras de negócio

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

## Arquivos-chave

- `src/pages/Dashboard.tsx` — Dashboard da home; escolhe view por role (technician/financial/admin) e monta KPIs, graficos e feeds via queries diretas + RPCs
- `src/pages/reports/ReportsPage.tsx` — Pagina de Relatorios em abas (chamados/horas/financeiro/servicos/desempenho/adicionais) com filtro de periodo
- `src/pages/tv-dashboard/TVDashboardPage.tsx` — TV Dashboard rotativo (4 slides, auto-rotate 15s) para monitores; metricas/fila/ranking/monitoramento
- `src/components/reports/AdditionalChargesReportTab.tsx` — Aba de adicionais/notas avulsas + candidatos a contrato via RPC get_additional_charges_report
- `src/components/reports/ClientManagementReport.tsx` — Relatorio gerencial por cliente (RPC get_client_management_report) com export
- `src/components/reports/TimeReportTab.tsx` — Aba de horas: filtros, agregacao por tecnico/cliente, tabela + export
- `src/components/dashboard/FinancialDashboard.tsx` — Dashboard do perfil financeiro: stats de faturas/receita/NFS-e + proximos vencimentos
- `src/components/dashboard/TechnicianDashboard.tsx` — Dashboard do tecnico: meus chamados, alertas ativos, agenda do dia
- `src/components/dashboard/ActivityFeed.tsx` — Feed de atividade recente lendo ticket_history
- `src/components/dashboard/AnimatedStatCard.tsx` — Card de KPI animado reutilizavel (com href opcional)
- `src/components/dashboard/DashboardHeader.tsx` — Cabecalho do dashboard com seletor de periodo (hoje/7d/30d) e acao Novo Chamado
- `src/components/dashboard/PriorityDistributionChart.tsx` — Grafico de barras horizontal de distribuicao por prioridade (presentational)
- `src/components/dashboard/RecentTicketsList.tsx` — Lista de chamados recentes (presentational, navega ao ticket)
- `src/components/dashboard/SLAComplianceChart.tsx` — Donut de conformidade SLA com % e cores por faixa (presentational)
- `src/components/dashboard/TechnicianMiniRanking.tsx` — Mini-ranking top 5 tecnicos via get_technician_ranking, gated por feature flag
- `src/components/dashboard/TicketStatusChart.tsx` — Pie de distribuicao de chamados por status (presentational)
- `src/components/dashboard/WeeklyTrendChart.tsx` — Area chart de tendencia semanal (novos vs resolvidos) (presentational)
- `src/components/export/ExportButton.tsx` — Dropdown de exportacao CSV/Excel/JSON generico
- `src/lib/export.ts` — Utilitarios de export client-side (CSV/Excel-TSV/JSON via Blob) + configs e formatters _(uso: parcial)_

## Pontos de atenção / riscos

- BUG latente confirmado: AdditionalChargesReportTab.tsx usa os tipos AdditionalChargesReportTabProps (L15) e ReportData (L26) sem declara-los nem importa-los — passa no build so porque nao ha type-check (tsc --noEmit).
- export.ts:29-41 exportToExcel gera TSV sem escapar tabs/quebras e sem protecao contra CSV/formula injection (=,+,-,@) — risco em CSV/Excel.
- Duplicacao de logica: ranking de tecnicos consumido em 3 lugares (ReportsPage, TVDashboardPage, TechnicianMiniRanking) via a mesma RPC; formatacao de moeda em >=3 caminhos (lib/currency, Intl inline em ClientManagementReport L120-121 e export formatters).
- Inconsistencia de calculo de SLA: client-side no Dashboard/SLAComplianceChart vs percentage vindo da RPC em ClientManagementReport — 3 telas podem divergir numericamente.
- TVDashboardPage ordena priority como string (order priority ascending, L80) e usa casts frageis (ticket as Record<string,unknown>) L354-356.
- Limites .limit(200/500) em Dashboard/TVDashboard truncam metricas silenciosamente sob alto volume (ex.: avg response, SLA, priority).
- ClientManagementReport, embora fisicamente em src/components/reports/, so e consumido pelo setor Clientes (ClientDetailPage), nao pelas paginas de Relatorios.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `exportConfigs` (src/lib/export.ts:79) — Objeto de colunas por entidade (tickets/clients/invoices/contracts/assets/managementReport) nunca consumido; cada caller define columns inline
- `formatters` (src/lib/export.ts:66) — Objeto de formatadores (date/datetime/currency/boolean) para export nunca importado; nao flagado pelo MAPA
- `trend (prop)` (src/components/dashboard/AnimatedStatCard.tsx:15-18 (prop) e 81-93 (render)) — Prop trend {value,isPositive} e bloco de render 'vs ontem' nunca passados por nenhum caller
- `imports nao usados (Button, Download)` (src/components/reports/ClientManagementReport.tsx:5,34) — Button e Download importados mas nunca usados no JSX (regra do escoteiro)
- `imports nao usados (Button, startOfMonth, endOfMonth, Building2)` (src/components/reports/TimeReportTab.tsx:5,38,40) — Symbols importados mas sem uso no corpo

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA (linha 679 e checklist 695) lista exportConfigs como 'possivelmente nao usados' — CONFIRMADO morto (0 refs). Alem disso o export 'formatters' em src/lib/export.ts:66 tambem esta morto (0 refs) e NAO e mencionado pelo MAPA.
- MAPA linha 671 aponta bug em AdditionalChargesReportTab (tipos AdditionalChargesReportTabProps e ReportData nao declarados/importados) — CONFIRMADO: o arquivo usa ambos (L15 e L26) sem nenhuma declaracao/import, so nao quebra por falta de type-check. MAPA correto.
- MAPA nao registra a prop morta 'trend' em AnimatedStatCard nem imports nao usados (Button/Download em ClientManagementReport; Button/startOfMonth/endOfMonth/Building2 em TimeReportTab).
- Riscos do MAPA nao verificaveis nesta auditoria (regra: sem consulta ao banco): RPCs SECURITY DEFINER sem guarda de role (l.673) e get_client_management_report 'tem guarda' — corpo das RPCs nao inspecionado; as 6 RPCs existem no contrato gerado types.ts (L6984-7023). Restante da secao 3.12 (paginas, componentes, ausencia de edge functions, aba Servicos placeholder, rotas/roles) confere com o codigo.

