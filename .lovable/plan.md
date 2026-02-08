
# Varredura E2E Completa - Colmeia GSTI

## Erros e Problemas Encontrados

### 1. CRITICO: MonitoringPage chama Edge Function inexistente
**Arquivo:** `src/pages/monitoring/MonitoringPage.tsx` (linhas 200-203)
O botao "Sincronizar" chama `supabase.functions.invoke("uptime-kuma-sync")`, mas **essa Edge Function nao existe** em `supabase/functions/`. O sistema tem `checkmk-sync` e `tactical-rmm-sync`, mas nenhuma `uptime-kuma-sync`. Isso causa erro silencioso ao clicar em Sincronizar quando a integracao `uptime_kuma` esta ativa.

**Correcao:** Substituir a referencia `uptime_kuma` por `checkmk` (que e o monitoramento efetivamente implementado). Atualizar o `handleRefresh` para verificar `checkmk` em vez de `uptime_kuma`.

---

### 2. MEDIO: Contratos sem paginacao nem limite de query
**Arquivo:** `src/pages/contracts/ContractsPage.tsx` (linhas 83-102)
A query de contratos nao tem `.limit()` nem paginacao. Com o crescimento do sistema, pode retornar centenas de registros causando lentidao.

**Correcao:** Adicionar `.limit(200)` e busca server-side com `ilike`.

---

### 3. MEDIO: TVDashboardPage carrega TODOS os tickets sem filtro
**Arquivo:** `src/pages/tv-dashboard/TVDashboardPage.tsx` (linhas 32-49)
A query `select("status, priority")` carrega **todos os tickets** da base para calcular estatisticas. Com milhares de tickets, isso e muito ineficiente.

**Correcao:** Usar `.select("id", { count: "exact", head: true })` com filtros por status (igual ao Dashboard principal), ou usar a RPC `get_ticket_report_stats`.

---

### 4. BAIXO: GamificationPage faz N+1 queries
**Arquivo:** `src/pages/gamification/GamificationPage.tsx` (linhas 38-80)
A pagina busca `technician_points`, depois itera pelos user_ids para buscar `profiles` em queries separadas. Isso causa multiplas round-trips ao banco.

**Correcao:** Usar a RPC `get_technician_ranking` que ja existe e faz tudo em uma unica query.

---

### 5. BAIXO: ClientPortalPage falta status `paused`, `waiting_third_party`, `no_contact` no mapeamento
**Arquivo:** `src/pages/client-portal/ClientPortalPage.tsx` (linhas 52-58)
O portal do cliente mapeia apenas 5 status de ticket (open, in_progress, waiting, resolved, closed), mas o sistema tem 8. Tickets com status `paused`, `waiting_third_party`, ou `no_contact` nao terao label nem cor no portal.

**Correcao:** Adicionar os 3 status faltantes ao mapeamento.

---

### 6. INFO: IntegrationsTab - S3 foi removido com sucesso
A aba Storage e os arquivos `s3-storage.ts` e `S3StorageConfigForm.tsx` foram removidos corretamente na ultima sessao. O `IntegrationsTab` esta com 7 colunas, sem referencia residual ao S3. Nenhuma acao necessaria.

---

### 7. INFO: Indicadores de Fatura (Boleto/NFS-e/Email) funcionando
Os indicadores no `BillingInvoicesTab` estao corretos apos as correcoes anteriores:
- Boleto: fallback por `boleto_url` e `boleto_error_msg`
- NFS-e: usa `mapNfseStatus()` com dados do `nfse_history`
- Email: fallback por `email_sent_at` e `email_error_msg`
Nenhuma acao necessaria.

---

### 8. INFO: useInvoiceActions centralizado e funcional
O hook `useInvoiceActions` centraliza corretamente as acoes de fatura (gerar boleto/PIX, emitir NFS-e, reenviar notificacao, marcar como pago). Usado tanto no `BillingInvoicesTab` quanto no `ContractInvoiceActionsMenu`. Nenhuma acao necessaria.

---

## Plano de Implementacao

### Fase 1: Correcoes criticas

1. **MonitoringPage.tsx** - Substituir `uptime_kuma` por `checkmk`:
   - Linha 188-192: Mudar `eq("integration_type", "uptime_kuma")` para `eq("integration_type", "checkmk")`
   - Linhas 200-203: Mudar `invoke("uptime-kuma-sync")` para `invoke("checkmk-sync")`

### Fase 2: Otimizacoes de performance

2. **ContractsPage.tsx** - Adicionar `.limit(200)` na query de contratos

3. **TVDashboardPage.tsx** - Substituir a query que carrega todos os tickets por `select("id", { count: "exact", head: true })` com filtros por status, eliminando carga desnecessaria de dados

4. **GamificationPage.tsx** - Substituir N+1 queries pela RPC `get_technician_ranking` que ja existe

### Fase 3: Compatibilidade

5. **ClientPortalPage.tsx** - Adicionar status `paused`, `waiting_third_party` e `no_contact` aos mapeamentos de labels e cores

---

## Listagem Completa de Funcionalidades do Sistema

### Modulo 1: Dashboard
**Rota:** `/`
**Conexao Backend:** Sim (queries a `tickets`, `clients`, RPC `get_weekly_ticket_trend`)
**Fluxo:** Ao acessar, o sistema carrega contadores de tickets por status, taxa de resolucao, clientes ativos e SLA violado em paralelo. Graficos exibem distribuicao por status e tendencia semanal. Tecnicos veem um dashboard simplificado (`TechnicianDashboard`). Clientes sao redirecionados automaticamente para `/portal`.

### Modulo 2: Chamados (Tickets)
**Rota:** `/tickets`, `/tickets/new`
**Conexao Backend:** Sim (CRUD `tickets`, `ticket_history`, `ticket_comments`, `ticket_tag_assignments`)
**Edge Functions:** `send-ticket-notification`, `check-no-contact-tickets`
**Fluxo:** Lista de tickets com busca por titulo/numero, filtro por status e paginacao cursor-based. Ao criar, preenche titulo, descricao, cliente, categoria, subcategoria, prioridade e tecnico. Ao iniciar atendimento, seleciona ativo vinculado. Acoes: transferir, pausar, finalizar, marcar "sem contato". Historico de alteracoes e comentarios internos/publicos em abas separadas. SLA calculado automaticamente.

### Modulo 3: Clientes
**Rota:** `/clients`, `/clients/:id`
**Conexao Backend:** Sim (CRUD `clients`, `client_contacts`, `assets`)
**Edge Functions:** `cnpj-lookup`, `create-client-user`, `validate-whatsapp`
**Fluxo:** Lista com busca por nome/email/CNPJ e paginacao cursor-based. Cada cliente tem pagina de detalhes com abas: contatos, ativos, tecnicos responsaveis, documentacao e usuarios de acesso ao portal. Validacao de WhatsApp integrada. Busca automatica de dados por CNPJ.

### Modulo 4: Contratos
**Rota:** `/contracts`, `/contracts/new`, `/contracts/edit/:id`
**Conexao Backend:** Sim (CRUD `contracts`, `contract_services`, `contract_adjustments`)
**Edge Functions:** `generate-monthly-invoices`, `apply-contract-adjustment`, `check-contract-adjustments`
**Fluxo:** Lista de contratos com status, modelo de suporte (ticket/banco de horas/ilimitado) e valor mensal. Criacao com servicos vinculados e opcao de cobranca inicial automatica. Reajuste anual com base em indices economicos (IGPM, IPCA, etc). Geracao manual de faturas por contrato. Historico de faturas e acoes via sheet lateral.

### Modulo 5: Faturamento (Billing)
**Rota:** `/billing` (7 abas)
**Conexao Backend:** Sim (CRUD `invoices`, `nfse_history`, `financial_entries`, `boleto_payments`)
**Edge Functions:** `banco-inter`, `asaas-nfse`, `generate-invoice-payments`, `batch-process-invoices`, `resend-payment-notification`, `notify-due-invoices`, `generate-second-copy`, `renegotiate-invoice`, `manual-payment`, `calculate-invoice-penalties`, `poll-boleto-status`, `poll-asaas-nfse-status`, `send-nfse-notification`
**Abas:**
- **Faturas:** Lista com busca, filtro por status, selecao em lote, indicadores visuais (boleto/NFS-e/email), acoes: gerar boleto/PIX (Inter ou Asaas), emitir NFS-e, reenviar notificacao, processamento completo, 2a via, renegociacao, pagamento manual.
- **Boletos:** Gestao de boletos pendentes com acoes em lote (cancelar, excluir).
- **NFS-e:** Historico de notas fiscais emitidas com detalhes, reenvio e cancelamento.
- **Conciliacao:** Cruzamento de extratos bancarios com faturas.
- **Fiscal:** Relatorios fiscais com exportacao.
- **Servicos:** Catalogo de servicos com precos.
- **Codigos Tributarios:** Gestao de codigos de servico para NFS-e.

### Modulo 6: Monitoramento
**Rota:** `/monitoring`
**Conexao Backend:** Sim (queries `monitored_devices`, `monitoring_alerts`)
**Edge Functions:** `checkmk-sync`, `tactical-rmm-sync`, `send-alert-notification`, `escalate-alerts`
**Fluxo:** Dashboard com cards de online/offline/alertas criticos/uptime. Abas: dispositivos (tabela com status, IP, uptime), alertas (agrupados por cliente ou dispositivo, reconhecimento individual ou em lote), graficos de uptime. Sincronizacao manual via botao. Alertas em tempo real via Realtime.

### Modulo 7: Inventario
**Rota:** `/inventory`
**Conexao Backend:** Sim (CRUD `assets`, `software_licenses`)
**Fluxo:** Tres abas: visao geral (overview com metricas de ativos e licencas), ativos (tabela de equipamentos por cliente com tipo, serial, status) e licencas (controle de licencas de software com chaves seguras, data de expiracao e uso). Ativos podem ser vinculados a tickets.

### Modulo 8: Agenda (Calendario)
**Rota:** `/calendar`
**Conexao Backend:** Sim (CRUD `calendar_events`)
**Edge Functions:** `google-calendar`
**Fluxo:** Calendario visual (FullCalendar) com visao mensal, semanal e diaria. Criacao de eventos com titulo, descricao, cliente, data/hora, tipo (visita, reuniao, manutencao). Detalhes em sheet lateral. Integracao opcional com Google Calendar.

### Modulo 9: Base de Conhecimento
**Rota:** `/knowledge`
**Conexao Backend:** Sim (CRUD `knowledge_articles`)
**Fluxo:** Cards de artigos com busca por titulo/conteudo. Criacao com editor rico, categoria vinculada, visibilidade (publica/interna). Visualizador de artigos com contagem de views.

### Modulo 10: Gamificacao
**Rota:** `/gamification`
**Conexao Backend:** Sim (queries `technician_points`, `technician_badges`, `profiles`)
**Fluxo:** Ranking de tecnicos por pontos (bronze/prata/ouro/platina/diamante). Exibicao de badges conquistados. Pontos atribuidos por resolucao de tickets, tempo de resposta e avaliacoes.

### Modulo 11: Dashboard TV
**Rota:** `/tv-dashboard`
**Conexao Backend:** Sim (queries `tickets`, `technician_points`, `monitored_devices`, `tv_dashboard_config`)
**Fluxo:** Tela para monitores com rotacao automatica de slides (15s): metricas de tickets, tickets recentes, ranking de tecnicos e status de monitoramento. Acesso publico via token.

### Modulo 12: Relatorios
**Rota:** `/reports`
**Conexao Backend:** Sim (RPCs `get_ticket_report_stats`, `get_invoice_report_stats`, `get_technician_ranking`)
**Fluxo:** Graficos de tickets por status, prioridade, tendencia diaria e metricas de SLA. Relatorio de tempo (horas trabalhadas por tecnico). Filtros por periodo (7d/30d/90d/12m).

### Modulo 13: Portal do Cliente
**Rota:** `/portal`
**Conexao Backend:** Sim (queries `tickets`, `ticket_comments`, `invoices`)
**Fluxo:** Interface simplificada para clientes. Abas: meus tickets (criar/comentar/avaliar), financeiro (faturas com download de boleto e PIX). Acesso restrito a roles `client` e `client_master`.

### Modulo 14: Configuracoes
**Rota:** `/settings` (15 abas)
**Conexao Backend:** Sim (CRUD em multiplas tabelas de configuracao)
**Abas:** Usuarios, Permissoes, Categorias, Tags, SLA, Empresa, Departamentos, Integracoes (Status/Email/Mensagens/Financeiro/Monitoramento/Automacao/Logs), Auditoria, Mapeamentos de Clientes, Regras de Notificacao, Mensagens, Metricas de Mensagens, Templates de Email.

### Modulo 15: Certificados Digitais
**Rota:** `/settings/certificates`
**Conexao Backend:** Sim (CRUD `certificates`, `company_settings`)
**Edge Functions:** `parse-certificate`, `certificate-vault`, `check-certificate-expiry`
**Fluxo:** Upload de certificados A1 (.pfx/.p12), parsing automatico de dados (CNPJ, validade, emissor). Dashboard com alertas de expiracao. Armazenamento seguro via vault.

### Modulo 16: Perfil do Usuario
**Rota:** `/profile`
**Conexao Backend:** Sim (CRUD `profiles`, push subscriptions)
**Edge Functions:** `send-push-notification`
**Fluxo:** Edicao de nome, email, avatar. Configuracao de canais de notificacao (email, WhatsApp, Telegram, push). Preferencias granulares por tipo de alerta. Visualizacao de roles e permissoes.

### Modulo 17: Autenticacao
**Rotas:** `/login`, `/register`, `/forgot-password`, `/setup`
**Edge Functions:** `forgot-password`, `reset-password`, `bootstrap-admin`, `create-user`, `resolve-username`
**Fluxo:** Login por email/senha. Registro (quando permitido). Recuperacao de senha via Edge Function. Setup inicial para criar primeiro admin. Sessao persistente com auto-refresh.

### Modulo 18: Notificacoes em Tempo Real
**Conexao Backend:** Sim (Supabase Realtime em `tickets`, `notifications`, `monitoring_alerts`, `invoices`, `nfse_history`)
**Fluxo:** Hook unificado (`useUnifiedRealtime`) que consolida todas as subscricoes em um unico canal WebSocket. Notificacoes toast para novos tickets, mudancas de status, alertas de monitoramento e atualizacoes de faturas. Dropdown de notificacoes com marcacao de lidas.

---

## Arquivos a Modificar
- `src/pages/monitoring/MonitoringPage.tsx` - Correcao #1
- `src/pages/contracts/ContractsPage.tsx` - Correcao #2
- `src/pages/tv-dashboard/TVDashboardPage.tsx` - Correcao #3
- `src/pages/gamification/GamificationPage.tsx` - Correcao #4
- `src/pages/client-portal/ClientPortalPage.tsx` - Correcao #5
