

# Modernização Completa do Dashboard — Inspirado em Atera, Zendesk e Freshdesk

## Análise do Estado Atual vs Líderes

| Feature | Atera / Zendesk / Freshdesk | Colmeia HD (Atual) |
|---|---|---|
| Header com saudação + data/hora + ações rápidas | Barra rica com quick actions e período | Apenas "Olá, nome" simples |
| Cards com tendência (↑↓ vs ontem/semana) | Indicadores de trend em todos os KPIs | Cards sem trend/comparativo |
| Tempo médio de resposta / resolução | KPI principal no dashboard | Inexistente |
| Gráfico de satisfação / CSAT | Score de satisfação visível | Inexistente |
| Activity feed / timeline em tempo real | Feed lateral de atividades recentes | Lista simples de tickets |
| SLA Compliance gauge | Medidor visual de conformidade SLA | Apenas contagem de violações |
| Distribuição por prioridade | Gráfico de barras por prioridade | Apenas pie chart de status |
| Performance por técnico (mini ranking) | Leaderboard compacto | Inexistente no admin dashboard |
| Quick actions no header (novo ticket, etc) | Botões de ação rápida no dashboard | Apenas no FAB |
| Período selecionável (hoje/semana/mês) | Filtro de período no topo | Dados fixos sem filtro |

## Plano de Implementação

### 1. Dashboard Header Redesenhado

Substituir o "Olá, nome" por um header completo estilo Atera:

```text
┌─────────────────────────────────────────────────────────────┐
│ 👋 Olá, João!                          [Hoje ▼] [+ Novo]   │
│ Domingo, 9 de março de 2025              ┌──────────────┐   │
│                                          │ Hoje | 7d | 30d │ │
│                                          └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2. KPI Cards com Trends

Adicionar dados comparativos (vs ontem) e 2 novos KPIs:
- **Tempo Médio de Resposta** (first_response_at - created_at)
- **CSAT Score** (média das avaliações de tickets resolvidos)
- Cada card mostra `↑12% vs ontem` ou `↓5% vs semana passada`

### 3. Nova Seção: SLA Compliance + Prioridade

Layout em 2 colunas:
- **SLA Compliance Gauge**: Donut chart mostrando % de tickets dentro do SLA vs violados
- **Distribuição por Prioridade**: Bar chart horizontal (Crítico / Alto / Médio / Baixo)

### 4. Activity Feed em Tempo Real

Nova coluna lateral (ou card) mostrando as últimas ações do sistema:
- "Ticket #142 atribuído a Maria"
- "Ticket #138 resolvido por João"
- "Novo ticket #145 criado"
- Ícone + timestamp + ação, estilo timeline vertical

### 5. Mini Ranking de Técnicos

Card compacto mostrando top 5 técnicos do período selecionado:
- Avatar + nome + tickets resolvidos + barra de progresso
- Link para página de gamificação

### 6. Layout Responsivo Redesenhado

```text
Desktop (lg+):
┌──────────────────────────────────────────────────┐
│ [Header: Saudação + Data + Período + Quick Actions] │
├──────┬──────┬──────┬──────┬──────┬──────┤
│ KPI 1│ KPI 2│ KPI 3│ KPI 4│ KPI 5│ KPI 6│
├──────────────────┬──────────────────────┤
│ SLA Compliance   │ Prioridade           │
├──────────────────┼──────────────────────┤
│ Tendência Semanal│ Status (Donut)       │
├──────────────────┼──────────────────────┤
│ Chamados Recentes│ Activity Feed        │
│                  │ + Mini Ranking       │
└──────────────────┴──────────────────────┘

Mobile (sm):
Cards empilhados, Activity Feed oculto,
KPIs em grid 2x3, gráficos full-width
```

## Arquivos

### Novos (4 componentes)
- `src/components/dashboard/DashboardHeader.tsx` — Header rico com saudação, data, seletor de período, quick actions
- `src/components/dashboard/SLAComplianceChart.tsx` — Gauge/donut de conformidade SLA
- `src/components/dashboard/PriorityDistributionChart.tsx` — Bar chart horizontal por prioridade
- `src/components/dashboard/ActivityFeed.tsx` — Timeline de atividades recentes do sistema
- `src/components/dashboard/TechnicianMiniRanking.tsx` — Top 5 técnicos compacto

### Modificados (2 arquivos)
- `src/pages/Dashboard.tsx` — Layout completamente reestruturado com novo grid, período selecionável, novos componentes
- `src/components/dashboard/AnimatedStatCard.tsx` — Suporte a trends (↑↓%) e formatação de tempo médio

### Dados
- Usar queries existentes + novas para: tempo médio de resposta, CSAT, distribuição por prioridade, atividade recente (da tabela `ticket_history`), ranking de técnicos (RPC `get_technician_ranking` já existe)
- O filtro de período (`today | 7d | 30d`) será passado como estado e usado em todas as queries

