# Relatório de Otimização — Central de Suporte Pro
**Projeto:** Central de Suporte Pro (Lovable)
**Data da Análise:** 27 de fevereiro de 2026
**Analista:** Especialista em Otimização de Sistemas de Suporte ao Cliente
**Branch:** `claude/optimize-support-ticketing-FPaIE`

---

## 1. Resumo Executivo

A Central de Suporte Pro é uma aplicação de helpdesk desenvolvida com React + TypeScript + Vite no frontend e Supabase (PostgreSQL + Edge Functions) no backend. O sistema possui uma base funcional sólida que inclui gestão de chamados com ciclo de vida bem definido, SLA com horário comercial, rastreamento de tempo, base de conhecimento, gamificação e portal do cliente.

**No entanto, a análise identificou 28 falhas e lacunas funcionais** que impactam diretamente a eficiência operacional, a experiência do técnico e do cliente, e a conformidade com SLA. As principais deficiências concentram-se em:

- **Ausência de automação no roteamento de chamados** (atribuição manual, sem regras)
- **Busca e filtragem limitadas** na listagem de chamados
- **Rastreamento de histórico incompleto** (só registra mudanças de status)
- **Ausência de ações em lote** e visão kanban
- **Sem integração de canal de entrada** (e-mail, WhatsApp inbound)
- **CSAT automatizado não implementado**, apesar de campos existirem no banco de dados
- **Base de conhecimento sem features básicas** de portais líderes

### Recomendações Críticas (Alta Prioridade)

| # | Recomendação | Impacto | Esforço |
|---|---|---|---|
| 1 | Motor de Automação de Atribuição | Alto | Médio |
| 2 | Busca e Filtros Avançados | Alto | Baixo |
| 3 | Histórico de Chamado Completo | Alto | Baixo |
| 4 | Ações em Lote | Médio | Médio |
| 5 | E-mail → Chamado (Inbound) | Alto | Alto |
| 6 | CSAT Automatizado | Alto | Baixo |
| 7 | Respostas Pré-definidas (Macros) | Médio | Baixo |
| 8 | SLA por Prioridade + por Cliente | Alto | Médio |

---

## 2. Análise do Sistema Atual

### 2.1 Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS + Radix UI |
| Backend | Supabase (PostgreSQL 14 + Edge Functions Deno) |
| State Management | TanStack Query v5 |
| Formulários | React Hook Form + Zod |
| Autenticação | Supabase Auth (JWT) |
| Real-time | Supabase Realtime (WebSocket) |
| Notificações | Push (service worker), E-mail SMTP, WhatsApp, Telegram |
| Monitoramento | CheckMK / TacticalRMM (via sync) |
| Integrações Financeiras | Asaas, Banco Inter, PIX |

### 2.2 Modelo de Dados — Entidades de Suporte

A análise das migrações e do arquivo `src/integrations/supabase/types.ts` revelou as seguintes entidades:

```
tickets
├── ticket_number (sequencial)
├── title, description, resolution_notes
├── status: open | in_progress | waiting | paused |
│          waiting_third_party | no_contact | resolved | closed
├── priority: low | medium | high | critical
├── origin: portal | phone | email | chat | whatsapp
├── sla_deadline, first_response_at, resolved_at, closed_at
├── assigned_to → profiles
├── department_id → departments
├── client_id → clients
├── requester_contact_id → client_contacts
├── category_id → ticket_categories (sla_hours)
├── subcategory_id → ticket_subcategories (sla_hours_override)
├── asset_id → assets
├── contract_id → contracts
└── satisfaction_rating, satisfaction_comment

ticket_categories (sla_hours)
ticket_subcategories (sla_hours_override, herda de categoria)
ticket_comments (content, is_internal)
ticket_history (old_status, new_status, comment)
ticket_pauses (pause_type, pause_reason, auto_resume_at, third_party_name)
ticket_transfers (from/to user/department, reason)
ticket_time_entries (duration_minutes, is_billable, entry_type)
ticket_tag_assignments → ticket_tags (color)
knowledge_articles (title, content, is_public, author_id)
```

### 2.3 Fluxo de Vida do Chamado (Mapeamento Atual)

```
CRIAÇÃO
  └─ Formulário manual (TicketForm.tsx)
       Campos: título, descrição*, cliente, categoria,
               subcategoria, prioridade, origem, tags
       * descrição é OPCIONAL
       Status inicial: "open"
       Histórico: "Chamado criado"

ATRIBUIÇÃO
  └─ MANUAL: técnico clica em "Iniciar" na listagem
       → Seleciona ativo (AssetSelectionDialog)
       → Status: open → in_progress
       → first_response_at registrado
       → assigned_to = usuário atual (auto-atribuição)
       NÃO há regras de auto-atribuição

ANDAMENTO
  └─ Ações disponíveis no TicketDetails:
       - Pausar (TicketPauseDialog)
         → Tipos: aguardando_cliente, aguardando_fornecedor, etc.
         → auto_resume_at opcional
       - Transferir (TicketTransferDialog)
         → Para técnico específico OU departamento
       - Sem Contato (NoContactButton)
         → status: no_contact
       - Comentários internos/externos (TicketCommentsTab)
       - Rastreamento de tempo (TicketTimeTracker)

RESOLUÇÃO
  └─ TicketResolveDialog
       - Notas de resolução (mínimo 10 chars)
       - Registro de tempo extra
       - Opção: criar artigo na KB
       Status: qualquer → "resolved"
       NÃO gera survey automático de satisfação

FECHAMENTO
  └─ closed_at / status "closed"
       Não há fluxo automatizado de closed após resolved
```

### 2.4 Pontos Fortes Identificados

1. **SLA Calculator robusto** (`src/lib/sla-calculator.ts`): Cálculo correto de SLA em horário comercial com suporte a múltiplos turnos por dia, feriados (via config de dias), e desconto automático de pausas no tempo de SLA.

2. **Sistema de permissões RBAC granular** (`src/lib/permissions.ts`): 6 perfis (admin, manager, technician, financial, client, client_master) com controle de ação por módulo. Frontend com `PermissionGate` e RLS no Supabase.

3. **Rastreamento de tempo faturável** (`ticket_time_entries`): Entradas com flag `is_billable`, resumo na resolução, integração com relatórios.

4. **Notificações multi-canal**: Push notification (PWA), e-mail SMTP customizável (`email_templates`), WhatsApp e Telegram via Edge Functions. Templates HTML configuráveis.

5. **Portal do cliente** (`/portal`): Clientes com perfis `client`/`client_master` têm acesso limitado para visualizar seus próprios chamados.

6. **Monitoramento integrado**: Integração com CheckMK e TacticalRMM. Alertas podem gerar chamados automaticamente com dados pré-preenchidos (monitoring → `/tickets/new?title=...`).

7. **Gamificação** (`technician_points`, `technician_badges`): Sistema de pontos e conquistas para engajamento da equipe.

8. **TV Dashboard** (`TVDashboardPage`): Dashboard público com token de acesso para exibição em telas da operação.

9. **Draft Recovery** (`useFormPersistence`): Rascunho do formulário salvo em sessionStorage, recuperável após acidente.

10. **Paginação cursor-based**: Melhor performance para grandes volumes vs. OFFSET.

11. **Audit logs e application_logs**: Rastreamento de ações e erros do sistema.

### 2.5 Pontos Fracos e Gargalos Operacionais

Os seguintes gargalos foram identificados através da análise do código-fonte:

**A. Gargalo de Atribuição Manual**
Em `TicketsPage.tsx:204-274`, o início do atendimento é 100% manual. O técnico precisa visualizar a fila, identificar o chamado, clicar em "Iniciar" e selecionar o ativo. Não existe fila organizada por prioridade+SLA nem distribuição automática.

**B. Busca Limitada a Título e Número**
```typescript
// TicketsPage.tsx:161-166
query = query.or(`title.ilike.%${debouncedSearch}%,ticket_number.eq.${searchNum}`);
```
Não pesquisa: descrição, notas de resolução, nome do cliente, técnico responsável.

**C. Filtros Insuficientes**
Só existe filtro de status. Não há filtros por: prioridade, categoria, técnico, cliente, departamento, período, SLA violado, origem, tags.

**D. Histórico Incompleto**
`ticket_history` só registra mudanças de status. Alterações de prioridade, categoria, técnico responsável, título, descrição e outros campos não são auditadas.

**E. Nenhum Mecanismo de Automação**
Não existe motor de regras que automatize: atribuição por categoria, escalonamento por SLA, mudança de status por inatividade (exceto `check-no-contact-tickets` Edge Function que existe mas detecta falta de contato).

**F. Sem Anexos em Comentários**
Schema de `ticket_comments` não possui campo para arquivos. Não há upload de prints/evidências diretamente no ticket.

**G. CSAT Não Disparado**
Os campos `satisfaction_rating` e `satisfaction_comment` existem na tabela `tickets` mas não há gatilho automático de pesquisa de satisfação após resolução.

**H. Knowledge Base Básica**
Sem: versioning, rating de artigos, contagem de visualizações, URL pública para compartilhamento, categorias hierárquicas.

---

## 3. Análise Comparativa (Benchmarking de Mercado)

### 3.1 Matriz de Comparação

| Funcionalidade | Central Suporte Pro | Zendesk | Freshdesk | Jira SM | Intercom |
|---|:---:|:---:|:---:|:---:|:---:|
| **Ciclo de vida de ticket** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SLA multi-nível** | Parcial¹ | ✅ | ✅ | ✅ | ✅ |
| **Auto-atribuição** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Busca full-text** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Filtros avançados** | Parcial² | ✅ | ✅ | ✅ | ✅ |
| **Ações em lote** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Visão kanban** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Macros/Respostas prontas** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Motor de automação** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **E-mail → Ticket** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Chatbot/IA** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **CSAT automatizado** | Parcial³ | ✅ | ✅ | ✅ | ✅ |
| **Base de conhecimento** | Básico | ✅ | ✅ | ✅ | ✅ |
| **Portal autoatendimento** | Básico | ✅ | ✅ | ✅ | ✅ |
| **Mesclagem de tickets** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Tickets vinculados** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Anexos em comentários** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Histórico de campo** | Parcial⁴ | ✅ | ✅ | ✅ | ✅ |
| **Relatórios SLA** | Básico | ✅ | ✅ | ✅ | ✅ |
| **Gamificação** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Monitoramento integrado** | ✅ | ❌ | ❌ | Parcial | ❌ |
| **NF-e/Financeiro** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Multi-tenant/RBAC** | ✅ | ✅ | ✅ | ✅ | ✅ |

> ¹ SLA por categoria/subcategoria, sem SLA por prioridade nem por cliente
> ² Apenas filtro de status
> ³ Campos no banco mas sem fluxo automático de disparo
> ⁴ Apenas mudanças de status, não todos os campos

### 3.2 Lacunas Críticas vs. Líderes de Mercado

#### Zendesk — O que o sistema não tem
- **Triggers e automações**: Regras "when X happens, do Y" (ex: se prioridade = crítica e sem resposta em 1h → escalar para manager)
- **Macros**: Conjuntos de ações em 1 clique (resposta + status + tag)
- **Vistas salvas**: Cada agente pode criar sua própria fila de trabalho filtrada
- **Satisfação do cliente (CSAT)**: E-mail automático 24h após resolução com link de avaliação
- **Side conversations**: Conversas paralelas dentro do ticket (para acionar terceiros)

#### Freshdesk — O que o sistema não tem
- **Kanban de tickets**: Visualização por status em colunas arrastáveis
- **Cenários (macros visuais)**: Combinar múltiplas ações em cenários salvos
- **Detecção de colisão**: Aviso quando 2 agentes abrem o mesmo ticket
- **Status personalizado**: Criar novos status além dos padrões

#### Jira Service Management — O que o sistema não tem
- **Tipos de solicitação por cliente**: Formulários diferentes por tipo de serviço
- **Campos personalizados**: Adicionar campos específicos por categoria
- **Aprovações**: Fluxo de aprovação antes de executar mudanças
- **Relatórios de capacidade**: Quanto cada técnico consegue atender por período

#### Intercom — O que o sistema não tem
- **Caixa de entrada unificada**: Todos os canais (chat, e-mail, WhatsApp) em uma interface
- **Qualificação automática por IA**: Triagem e resposta automática de perguntas frequentes
- **Outbound proativo**: Notificar clientes de manutenções agendadas

---

## 4. Identificação Detalhada de Falhas

### FALHA-01 — Busca Restrita a Título e Número
**Arquivo:** `src/pages/tickets/TicketsPage.tsx:161-166`
**Impacto:** Alto
**Descrição:** A busca só pesquisa pelo campo `title` (ilike) ou `ticket_number` (exato). Técnicos não conseguem encontrar chamados por nome do cliente, descrição, texto dos comentários, notas de resolução ou técnico responsável. Em bases com centenas de chamados, isso força o uso de filtros manuais lentos.

### FALHA-02 — Ausência de Filtros Avançados
**Arquivo:** `src/pages/tickets/TicketsPage.tsx:350-367`
**Impacto:** Alto
**Descrição:** Apenas 1 filtro disponível (status). Não há filtros por: prioridade, categoria/subcategoria, técnico responsável, cliente, departamento, origem, período de criação/resolução, SLA violado, tags. O técnico não consegue visualizar "meus chamados críticos desta semana" ou "chamados da categoria Infraestrutura sem resposta".

### FALHA-03 — Nenhuma Regra de Auto-Atribuição
**Arquivo:** `src/pages/tickets/TicketsPage.tsx:204-274` e `src/components/tickets/TicketForm.tsx`
**Impacto:** Alto
**Descrição:** Todo chamado entra na fila como "Aberto" sem dono. O técnico precisa manualmente varrer a fila e clicar em "Iniciar". Não existe tabela de regras de atribuição, distribuição round-robin, balanceamento por carga de trabalho ou atribuição por categoria. Resultado: chamados ficam sem atendimento por tempo indeterminado, violando SLA sem alerta.

### FALHA-04 — Histórico Registra Apenas Mudanças de Status
**Arquivo:** `src/integrations/supabase/types.ts:3405-3442` (ticket_history schema)
**Impacto:** Médio-Alto
**Descrição:** A tabela `ticket_history` só possui campos `old_status`, `new_status` e `comment`. Alterações de prioridade, título, descrição, técnico responsável, categoria, departamento e SLA deadline não são auditadas. Isso impede rastreabilidade completa, análise forense de incidentes e conformidade.

### FALHA-05 — Sem Anexos em Comentários/Chamados
**Arquivo:** `src/integrations/supabase/types.ts:3370-3403` (ticket_comments schema)
**Impacto:** Alto
**Descrição:** A tabela `ticket_comments` não possui campo para URLs de arquivos. Técnicos e clientes não conseguem anexar evidências (prints de erro, logs, fotos de equipamento) diretamente nos comentários. Isso aumenta o tempo de diagnóstico e cria fluxos de trabalho paralelos (envio por e-mail, WhatsApp externo).

### FALHA-06 — CSAT Não é Disparado Automaticamente
**Arquivo:** `src/integrations/supabase/types.ts:3713-3714` (tickets.satisfaction_rating, tickets.satisfaction_comment)
**Impacto:** Alto
**Descrição:** Os campos de satisfação existem no banco mas nunca são preenchidos automaticamente. Não há Edge Function nem trigger que envie pesquisa de satisfação após a resolução. Gestores não têm dados de NPS/CSAT para medir qualidade do atendimento.

### FALHA-07 — Transfer Dialog Carrega Todos os Perfis Sem Filtro
**Arquivo:** `src/components/tickets/TicketTransferDialog.tsx:52-64`
**Descrição:**
```typescript
const { data: technicians = [] } = useQuery({
  queryFn: async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .order("full_name");  // SEM FILTRO DE ROLE
```
**Impacto:** Médio-Alto
**Descrição:** O dialog de transferência carrega TODOS os perfis, incluindo clientes, financeiro e outros não-técnicos. Não há informação de carga de trabalho (quantos chamados cada técnico já tem ativos) para orientar a escolha.

### FALHA-08 — SLA Definido Apenas por Categoria, Não por Prioridade ou Cliente
**Arquivo:** `src/integrations/supabase/types.ts:3343-3368` (ticket_categories.sla_hours)
**Impacto:** Alto
**Descrição:** O SLA é configurado apenas no nível de categoria (`sla_hours`) e subcategoria (`sla_hours_override`). Não há SLA por prioridade (crítico = 4h, alto = 8h, médio = 24h, baixo = 48h) nem SLA por cliente (clientes com contrato premium podem ter SLA diferenciado). A tabela `sla_policies` não existe no schema.

### FALHA-09 — Sem Regras de Escalonamento Automático para Tickets
**Arquivo:** `supabase/functions/escalate-alerts/index.ts` (apenas para alertas de monitoramento)
**Impacto:** Alto
**Descrição:** A função `escalate-alerts` escala alertas de monitoramento, mas não há escalonamento de chamados. Se um ticket crítico está prestes a violar o SLA, nenhuma notificação automática é enviada ao gestor. A tabela `alert_escalation_settings` é para alertas de dispositivos, não tickets.

### FALHA-10 — Sem Ações em Lote (Bulk Actions)
**Arquivo:** `src/pages/tickets/TicketsPage.tsx:369-558`
**Impacto:** Médio
**Descrição:** Não há seleção múltipla de chamados. Técnicos e gestores não conseguem: fechar múltiplos tickets de uma vez, atribuir em lote para um técnico, adicionar tags em lote, exportar seleção. Em operações com alto volume, isso gera retrabalho manual.

### FALHA-11 — Sem Visão Kanban
**Impacto:** Médio
**Descrição:** Apenas visão de tabela disponível. Ausência de kanban dificulta gestão visual do fluxo, percepção de gargalos por status e priorização intuitiva. Ferramentas como Freshdesk e Jira SM oferecem kanban como visão nativa.

### FALHA-12 — Sem Macros / Respostas Pré-definidas
**Impacto:** Médio-Alto
**Descrição:** Técnicos não têm acesso a respostas pré-configuradas para problemas comuns (reset de senha, configuração de e-mail, etc.). Cada resposta é digitada do zero. Em Zendesk e Freshdesk, macros combinam: resposta automática + mudança de status + adição de tag, em 1 clique.

### FALHA-13 — Sem Ingestão de E-mail (Inbound)
**Impacto:** Alto
**Descrição:** O sistema envia e-mails de notificação (`send-email-smtp`, `send-ticket-notification`) mas não processa e-mails recebidos para criação automática de tickets. Clientes que respondem e-mails de notificação não têm suas respostas capturadas no sistema. Zendesk, Freshdesk e Jira SM têm suporte nativo a e-mail como canal.

### FALHA-14 — Sem Detecção de Colisão de Agentes
**Impacto:** Médio
**Descrição:** Quando dois técnicos abrem o mesmo ticket simultaneamente, ambos podem estar respondendo sem saber da ação do outro. Freshdesk exibe "Agente X está visualizando este ticket agora". A tabela de presença/lock não existe.

### FALHA-15 — Descrição do Chamado é Opcional
**Arquivo:** `src/components/tickets/TicketForm.tsx:38-39`
```typescript
description: z.string()
  .max(10000, "...")
  .optional(),  // SEM validação de mínimo
```
**Impacto:** Médio
**Descrição:** Chamados podem ser criados com apenas título, sem nenhuma descrição. Isso gera triagem ineficiente, perguntas de esclarecimento desnecessárias e aumento do MTTR. Soluções maduras exigem descrição mínima ou usam formulários guiados por tipo de problema.

### FALHA-16 — Sem Campos Personalizados por Categoria
**Impacto:** Médio
**Descrição:** Todos os chamados têm os mesmos campos independente da categoria. Um chamado de "Acesso VPN" tem campos completamente diferentes de "Falha de Hardware". Sistemas como Jira SM e Freshdesk permitem formulários dinâmicos por tipo de solicitação.

### FALHA-17 — Sem Mesclagem ou Vinculação de Tickets
**Impacto:** Médio
**Descrição:** Quando um problema de infraestrutura gera múltiplos chamados simultâneos de clientes diferentes (ex: queda de internet), não é possível mesclar os duplicados em um único ticket-pai ou criar relações entre tickets. Isso dispersa o esforço de resolução.

### FALHA-18 — Relatórios Sem KPIs Essenciais
**Arquivo:** `src/pages/reports/ReportsPage.tsx:56-61`
**Impacto:** Alto
**Descrição:** Os relatórios disponíveis mostram distribuição por status, prioridade e tendência diária. Faltam métricas críticas:
- **MTTR** (Mean Time to Resolution) por categoria/técnico/prioridade
- **MTTA** (Mean Time to First Response)
- **Taxa de cumprimento de SLA** (%)
- **First Contact Resolution Rate (FCR)**
- **Taxa de reabertura de chamados**
- **Satisfação por técnico/categoria (CSAT)**
- **Backlog aging** (tickets abertos há mais de X dias)

### FALHA-19 — Paginação com Cursor Quebra ao Combinar com Busca
**Arquivo:** `src/pages/tickets/TicketsPage.tsx:99, 154-190`
**Impacto:** Médio
**Descrição:** O cursor é baseado em `created_at`. Ao realizar uma busca textual enquanto há cursor ativo, os resultados podem ser inconsistentes — o reset de paginação ao mudar filtros (`useEffect` linha 316-318) mitiga parcialmente mas não resolve o problema de que cursor+filtro de texto pode pular registros se houver tickets com o mesmo `created_at`.

### FALHA-20 — Sem Vistas Salvas (Saved Filters)
**Impacto:** Médio
**Descrição:** Técnicos não podem salvar suas configurações de filtro como "Meus Chamados Críticos" ou "Chamados sem Técnico da Semana". A cada sessão, os filtros precisam ser reaplicados manualmente.

### FALHA-21 — Knowledge Base sem URL Pública e sem Avaliação
**Arquivo:** `src/pages/knowledge/KnowledgePage.tsx`
**Impacto:** Médio
**Descrição:** Artigos com `is_public = true` não possuem URL acessível sem login. Não há campo de avaliação (`helpful: yes/no`), contagem de visualizações nem histórico de versões. A sugestão de artigos relevantes durante a criação do chamado (similar ao Freshdesk) também está ausente.

### FALHA-22 — Sem Notificação de SLA Iminente para o Técnico
**Impacto:** Alto
**Descrição:** O `SLAIndicator` mostra visualmente o tempo restante, mas não dispara notificação push/e-mail para o técnico quando o SLA está próximo do vencimento (ex: 30min antes). A Edge Function `escalate-alerts` existe apenas para alertas de monitoramento.

### FALHA-23 — Sem Relatório de Tempo Trabalhado por Contrato
**Impacto:** Médio
**Descrição:** `ticket_time_entries` tem `is_billable` mas os relatórios de tempo (`TimeReportTab`) não cruzam com dados contratuais para mostrar: horas consumidas vs. horas contratadas por cliente/período. Isso impacta o faturamento de horas avulsas.

### FALHA-24 — Portal do Cliente com Funcionalidade Limitada
**Arquivo:** `src/pages/client-portal/ClientPortalPage.tsx`
**Impacto:** Médio
**Descrição:** Clientes com perfil `client`/`client_master` acessam o portal mas com capacidade reduzida de autoatendimento. Não há: acompanhamento de SLA no portal, histórico completo de interações, base de conhecimento pública filtrada por cliente, abertura guiada de chamados por formulários específicos.

### FALHA-25 — Sem Status Personalizados
**Impacto:** Baixo-Médio
**Descrição:** Os 8 status são hardcoded como enum no banco (`ticket_status`). Operações específicas podem precisar de status como "Aguardando Liberação de Acesso", "Em Homologação", "Aprovação Pendente" sem precisar fazer migrations.

### FALHA-26 — Sem Integração com WhatsApp para Chamados Inbound
**Arquivo:** `supabase/functions/send-whatsapp/index.ts`, `supabase/functions/validate-whatsapp/index.ts`
**Impacto:** Médio
**Descrição:** O sistema envia mensagens WhatsApp mas não processa mensagens recebidas para criar/atualizar chamados. Com a adoção massiva do WhatsApp no Brasil, a ausência de canal inbound representa uma lacuna significativa de atendimento.

### FALHA-27 — Sem Detecção de Duplicatas
**Impacto:** Baixo-Médio
**Descrição:** Ao criar um chamado, o sistema não sugere tickets similares que possam já estar abertos, aumentando a quantidade de duplicatas na fila e fragmentando o esforço de resolução.

### FALHA-28 — Formulário de Criação Sem Contato Solicitante Obrigatório
**Arquivo:** `src/components/tickets/TicketForm.tsx`
**Impacto:** Médio
**Descrição:** O campo `requester_contact_id` existe na tabela `tickets` mas não está presente no formulário de criação (`TicketForm.tsx`). O técnico não identifica quem dentro do cliente abriu o chamado, dificultando o contato direto e a análise de quais contatos geram mais demanda.

---

## 5. Recomendações de Otimização

### 5.1 Correção de Falhas — Ações Imediatas

#### Correção FALHA-01 e FALHA-02 — Busca e Filtros Avançados

**Implementação no `TicketsPage.tsx`:**

Adicionar FilterBar com os seguintes parâmetros:
- `search`: busca em `title`, `description`, `ticket_number`, nome do cliente (via JOIN)
- `priorityFilter`: multi-select com os 4 níveis
- `categoryFilter`: select dinâmico de `ticket_categories`
- `technicianFilter`: select de perfis com role técnico/admin/manager
- `clientFilter`: select de clientes ativos
- `departmentFilter`: select de departamentos
- `slaFilter`: opção "SLA violado", "SLA crítico (<25%)"
- `dateRangeFilter`: período de criação (DateRangePicker)
- `tagFilter`: multi-select de tags

No Supabase, usar `textSearch` com índice GIN para busca full-text:
```sql
-- Migration: adicionar índice full-text
CREATE INDEX idx_tickets_fts ON tickets
  USING gin(to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(description,'')));
```

Adicionar botão "Salvar Filtro" que persiste configuração em `localStorage` com nome definido pelo usuário (Vistas Salvas — FALHA-20).

#### Correção FALHA-03 — Motor de Auto-Atribuição

Criar tabela `assignment_rules`:
```sql
CREATE TABLE assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  priority int DEFAULT 0,        -- ordem de avaliação
  condition_category_id uuid,    -- se categoria = X
  condition_priority text,       -- se prioridade = Y
  condition_client_id uuid,      -- se cliente = Z
  condition_origin text,         -- se origem = email/whatsapp
  action_assign_to uuid,         -- atribuir para técnico fixo
  action_assign_department_id uuid, -- ou para departamento
  action_assign_mode text DEFAULT 'fixed',  -- fixed | round_robin | least_load
  action_set_priority text,      -- alterar prioridade
  action_add_tag_ids uuid[],     -- adicionar tags
  created_at timestamptz DEFAULT now()
);
```

Edge Function `apply-assignment-rules` chamada via trigger AFTER INSERT on tickets:
1. Busca regras ativas ordenadas por `priority`
2. Avalia condições (categoria, prioridade, cliente, origem)
3. Aplica primeira regra que satisfaz
4. Para `round_robin`: distribui sequencialmente entre técnicos do departamento
5. Para `least_load`: atribui ao técnico com menos tickets `in_progress`

#### Correção FALHA-04 — Histórico Completo de Campo

Adicionar coluna `field_changes` (JSONB) à `ticket_history`:
```sql
ALTER TABLE ticket_history
  ADD COLUMN IF NOT EXISTS field_changes jsonb;
  -- Formato: [{"field": "priority", "old": "medium", "new": "high"}, ...]
```

Criar trigger `log_ticket_field_changes` que registra no `ticket_history` qualquer alteração nos campos: `title`, `description`, `priority`, `category_id`, `subcategory_id`, `assigned_to`, `department_id`, `sla_deadline`.

#### Correção FALHA-05 — Anexos em Comentários

1. Adicionar bucket `ticket-attachments` no Supabase Storage
2. Adicionar coluna à `ticket_comments`:
```sql
ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
  -- Formato: [{"name": "print.png", "url": "...", "size": 12345, "type": "image/png"}]
```
3. Adicionar componente `FileUpload` no `TicketCommentsTab` com drag-and-drop
4. Configurar RLS no bucket para acesso por ticket/cliente
5. Limite de 10MB por arquivo, tipos: imagem, PDF, log, zip

#### Correção FALHA-06 — CSAT Automatizado

Edge Function `send-csat-survey`:
- Trigger: quando `tickets.status` muda para `resolved`
- Delay: 2-24h configurável (via `company_settings`)
- Canal: e-mail + WhatsApp (se `notify_whatsapp = true` no contato)
- Link único: `/survey/{token}` (JWT com ticket_id, expira em 7 dias)
- Escala: 1-5 estrelas + comentário opcional
- Resultado: grava em `tickets.satisfaction_rating` e `tickets.satisfaction_comment`
- Relatório: disponível em ReportsPage com NPS calculado

#### Correção FALHA-07 — Transfer Dialog com Filtro de Role e Carga

```typescript
// Filtrar apenas técnicos/managers
const { data: technicians = [] } = useQuery({
  queryFn: async () => {
    const { data } = await supabase
      .from("profiles")
      .select(`
        user_id, full_name,
        user_roles!inner(role),
        active_tickets:tickets(count)
      `)
      .in("user_roles.role", ["technician", "manager", "admin"])
      .order("full_name");
    return data;
  }
});
```

Exibir na lista: nome + role + badge com contador de chamados ativos `(X ativos)`.

#### Correção FALHA-08 — SLA por Prioridade e por Cliente

Criar tabela `sla_policies`:
```sql
CREATE TABLE sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  scope text NOT NULL,         -- 'default' | 'priority' | 'category' | 'client'
  priority text,               -- 'low' | 'medium' | 'high' | 'critical'
  category_id uuid,
  client_id uuid,
  response_hours numeric NOT NULL,
  resolution_hours numeric NOT NULL,
  business_hours_only boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

Lógica de resolução de SLA (mais específico vence):
1. Política de cliente específico
2. Política de categoria específica
3. Política de prioridade
4. Política padrão (default)

Atualizar `sla-calculator.ts` para buscar política correta.

#### Correção FALHA-09 — Escalonamento Automático de Tickets

Criar Edge Function `escalate-ticket-sla` agendada a cada 15 minutos:
1. Busca tickets com `status IN ('open','in_progress')` e `sla_deadline < now() + interval '30 min'`
2. Para violações iminentes: notifica técnico responsável e manager
3. Para violações já ocorridas: notifica manager + cria entrada em `ticket_history`
4. Opções configuráveis: destinatários por nível, canais (push/email/telegram)

Adicionar tabela `escalation_rules` similar à `alert_escalation_settings` mas para tickets.

#### Correção FALHA-10 — Ações em Lote

No `TicketsPage.tsx`:
1. Adicionar coluna de checkbox na tabela
2. Barra de ações flutuante que aparece quando itens selecionados
3. Ações disponíveis:
   - Atribuir para técnico
   - Alterar status
   - Alterar prioridade
   - Adicionar tags
   - Fechar tickets resolvidos
   - Exportar seleção

Mutation em lote via `supabase.from('tickets').update().in('id', selectedIds)`.

#### Correção FALHA-13 — Ingestão de E-mail

Criar Edge Function `inbound-email-processor`:
- Integração com serviço de e-mail (Mailgun, SendGrid, Postmark) via webhook inbound
- Parser de e-mail: extrai assunto (→ título), corpo (→ descrição), remetente (→ cliente por e-mail)
- Se remetente conhecido: associa ao cliente/contato, aplica regras de atribuição
- Se remetente desconhecido: cria ticket com flag `origin = 'email'` e cliente em branco
- Respostas ao ticket: detecta `[#TICKET-123]` no assunto para adicionar como comentário

#### Correção FALHA-15 — Descrição Obrigatória por Categoria

No schema Zod do `TicketForm.tsx`:
```typescript
description: z.string()
  .min(20, "Descreva o problema com pelo menos 20 caracteres")
  .max(10000, "..."),
```

Opcional: configurar por categoria se a descrição é obrigatória (campo em `ticket_categories`).

#### Correção FALHA-18 — Relatórios com KPIs Essenciais

Criar views no Supabase para cada métrica:
```sql
-- MTTR por categoria (últimos 30 dias)
CREATE OR REPLACE VIEW vw_mttr_by_category AS
SELECT
  tc.name as category,
  COUNT(*) as resolved_count,
  AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))/3600) as avg_hours,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))/3600
  ) as median_hours
FROM tickets t
JOIN ticket_categories tc ON t.category_id = tc.id
WHERE t.resolved_at IS NOT NULL
  AND t.resolved_at >= NOW() - INTERVAL '30 days'
GROUP BY tc.name;

-- Taxa de SLA por período
CREATE OR REPLACE VIEW vw_sla_compliance AS
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) FILTER (WHERE resolved_at <= sla_deadline OR sla_deadline IS NULL) as met,
  COUNT(*) FILTER (WHERE resolved_at > sla_deadline) as breached,
  ROUND(100.0 * COUNT(*) FILTER (WHERE resolved_at <= sla_deadline) / NULLIF(COUNT(*),0), 1) as compliance_pct
FROM tickets
WHERE resolved_at IS NOT NULL
GROUP BY 1;
```

Adicionar tab "SLA & Performance" em ReportsPage com: compliance %, MTTA, MTTR, FCR, taxa de reabertura, CSAT médio.

#### Correção FALHA-22 — Notificação de SLA Iminente para Técnico

Adicionar à Edge Function existente ou criar `notify-sla-breach`:
```typescript
// Busca tickets com SLA expirando em <= 30 minutos
const { data } = await supabase
  .from('tickets')
  .select('*, profiles!assigned_to(push_token, email)')
  .in('status', ['open', 'in_progress'])
  .gte('sla_deadline', new Date().toISOString())
  .lte('sla_deadline', new Date(Date.now() + 30*60*1000).toISOString());

// Envia push notification e e-mail para o técnico
```

Agendar via `pg_cron` ou Supabase scheduled function a cada 5 minutos.

#### Correção FALHA-28 — Contato Solicitante no Formulário

Adicionar campo `requester_contact_id` ao `TicketForm`:
- Aparece após seleção de cliente
- Lista contatos ativos do cliente selecionado
- Exibe: nome, cargo, telefone, WhatsApp
- Campo opcional, mas recomendado

```typescript
// Schema Zod
requester_contact_id: z.string().optional(),

// Payload
requester_contact_id: data.requester_contact_id || null,
```

### 5.2 Otimização de Fluxos e Rotas de Atendimento

#### Fluxo Recomendado — Ciclo de Vida Otimizado

```
ABERTURA
  ├─ Canal Web/Portal: Formulário com campos obrigatórios + sugestão de artigos KB
  ├─ Canal E-mail: Parser inbound → pre-populado, aguarda triagem
  ├─ Canal WhatsApp: Bot pergunta: "Qual o problema?" → cria ticket
  └─ Canal Monitor: Auto-criado com dados do alerta
       ↓
       Regras de Atribuição (Engine)
       ↓
TRIAGEM AUTOMÁTICA
  ├─ Categoria detectada → técnico/grupo responsável
  ├─ Prioridade inferida pela categoria + cliente tier
  ├─ SLA calculado pela política aplicável
  ├─ Tags automáticas (ex: "vip", "produção")
  └─ Notificação push/e-mail para técnico atribuído
       ↓
ATENDIMENTO
  ├─ Técnico recebe: notificação com contexto + artigos sugeridos da KB
  ├─ Abre ticket: verifica se há outro agente (anti-colisão)
  ├─ Responde com macro ou resposta personalizada
  ├─ Pausa (waiting_third_party) → SLA pausado → notifica cliente
  └─ Escalonamento automático (se SLA < 25% → notifica manager)
       ↓
RESOLUÇÃO
  ├─ Resolve com notas detalhadas
  ├─ Propõe artigo na KB (pré-preenchido)
  ├─ Tempo registrado automaticamente (TicketTimeTracker)
  └─ Status: resolved
       ↓
PÓS-RESOLUÇÃO
  ├─ CSAT automático (2h após resolução)
  ├─ Cliente pode reabrir em 72h (auto-fechamento)
  └─ Fechamento automático após 72h sem reação
```

#### Otimização da Rota de Escalonamento

**Nível 1** (SLA > 50% restante): Técnico responsável — gestão normal
**Nível 2** (SLA 25-50% restante): Notificação ao técnico + alerta no dashboard do manager
**Nível 3** (SLA < 25%): Notificação push + e-mail ao manager, técnico sênior como CC
**Nível 4** (SLA violado): Alerta crítico manager + supervisor, registro de breach em relatório

### 5.3 Melhorias Funcionais Prioritárias

#### Prioridade 1 — Macros / Respostas Pré-definidas

Criar tabela `ticket_macros`:
```sql
CREATE TABLE ticket_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shortcut text UNIQUE,           -- ex: "/reset_senha"
  description text,
  is_global boolean DEFAULT true,
  actions jsonb NOT NULL,
  -- actions: [
  --   {"type": "reply", "template": "Olá {{contato_nome}}..."},
  --   {"type": "set_status", "value": "waiting"},
  --   {"type": "add_tag", "tag_id": "uuid"}
  -- ]
  created_by uuid,
  usage_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

No `TicketCommentsTab`, adicionar botão "Macros" ou suporte a `/` para autocomplete de shortcuts.

#### Prioridade 2 — Visão Kanban

Criar `TicketsKanbanView.tsx`:
- Colunas por status (configuráveis)
- Cards com: número, título, cliente, SLA indicator, avatar técnico
- Drag-and-drop para mover entre status (usando `@dnd-kit/core`)
- Filtros sincronizados com a visão tabela
- Limite de 50 cards por coluna (virtualização)

#### Prioridade 3 — Mesclagem e Vinculação de Tickets

```sql
CREATE TABLE ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id),
  related_ticket_id uuid REFERENCES tickets(id),
  link_type text DEFAULT 'related',  -- 'related' | 'duplicates' | 'is_parent_of'
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
```

UI: seção "Tickets Relacionados" no `TicketDetailsTab`, com pesquisa por número/título.

#### Prioridade 4 — Base de Conhecimento Aprimorada

1. **Sugestão automática**: Ao digitar título do chamado, buscar artigos similares e exibir sidebar "Artigos Relacionados"
2. **Avaliação de artigos**: Botões Útil/Não Útil com contador visível
3. **URL pública**: Artigos com `is_public = true` acessíveis via `/kb/{slug}` sem login
4. **Histórico de versões**: Salvar versão anterior antes de editar
5. **Views count**: Incrementar `view_count` a cada visualização

#### Prioridade 5 — Dashboard de Produtividade Individual

No `TechnicianDashboard.tsx`, adicionar:
- Chamados atribuídos hoje / esta semana
- CSAT médio do técnico (últimos 30 dias)
- SLA cumprido vs. violado (pessoal)
- Tempo médio de resolução
- Comparativo com a equipe (anonimizado)

---

## 6. Próximos Passos — Plano de Implementação

### Fase 1 — Quick Wins (1-2 semanas)

Estas mudanças têm alto impacto e baixo esforço, podendo ser implementadas imediatamente:

| Item | Arquivo(s) | Estimativa |
|---|---|---|
| Adicionar contato solicitante no formulário (FALHA-28) | `TicketForm.tsx` | 2h |
| Tornar descrição obrigatória (FALHA-15) | `TicketForm.tsx` | 0.5h |
| Filtrar perfis no Transfer Dialog (FALHA-07) | `TicketTransferDialog.tsx` | 2h |
| Adicionar filtros de prioridade e categoria (FALHA-02) | `TicketsPage.tsx` | 4h |
| Adicionar busca por cliente e técnico (FALHA-01) | `TicketsPage.tsx` + migration | 3h |
| Macro básica de resposta (FALHA-12) | migration + `TicketCommentsTab.tsx` | 6h |
| CSAT básico pós-resolução (FALHA-06) | Edge Function + migration | 8h |

### Fase 2 — Melhorias Estruturais (3-6 semanas)

| Item | Arquivos | Estimativa |
|---|---|---|
| Tabela `sla_policies` + resolução por cliente/prioridade | migration + `sla-calculator.ts` | 2 dias |
| Histórico completo de campos (FALHA-04) | migration + trigger SQL | 1 dia |
| Tabela de anexos + Storage + upload UI (FALHA-05) | migration + `TicketCommentsTab.tsx` | 3 dias |
| Motor de regras de atribuição (FALHA-03) | migration + Edge Function | 4 dias |
| Notificação de SLA iminente (FALHA-22) | Edge Function + pg_cron | 1 dia |
| Ações em lote (FALHA-10) | `TicketsPage.tsx` | 2 dias |
| KPIs essenciais nos relatórios (FALHA-18) | views SQL + `ReportsPage.tsx` | 3 dias |

### Fase 3 — Funcionalidades Avançadas (2-3 meses)

| Item | Complexidade | Prioridade |
|---|---|---|
| Visão Kanban com drag-and-drop | Alta | Alta |
| Motor de automação visual (triggers/actions) | Muito Alta | Alta |
| Ingestão de e-mail inbound | Alta | Alta |
| Campos personalizados por categoria | Alta | Média |
| Mesclagem e vinculação de tickets | Média | Média |
| Base de conhecimento com versioning e URL pública | Média | Média |
| WhatsApp inbound via webhook | Alta | Alta |
| Sugestão de artigos KB na criação | Média | Média |
| Detecção de colisão de agentes | Baixa | Baixa |

### Gestão de Mudança e Priorização

1. **Comunicação**: Envolver a equipe técnica na definição das automações e macros antes da implementação
2. **Rollout gradual**: Usar flags de feature para ativar novas funcionalidades por grupo de usuários
3. **Métricas de sucesso**: Definir baseline atual de MTTR, CSAT e taxa de SLA antes de implementar; medir 30 dias após cada fase
4. **Testes**: Cada nova funcionalidade deve ter testes unitários e de integração no Vitest
5. **Documentação**: Atualizar `SYSTEM_DOCUMENTATION.md` a cada mudança relevante

### Métricas Alvo Pós-Implementação

| KPI | Baseline (estimado) | Meta Fase 1 | Meta Fase 3 |
|---|---|---|---|
| MTTR (médio) | > 48h | < 24h | < 12h |
| SLA Compliance | < 70% | > 80% | > 90% |
| CSAT Score | N/A | > 4.0/5 | > 4.5/5 |
| FCR Rate | < 50% | > 60% | > 70% |
| Tickets sem técnico > 4h | > 30% | < 15% | < 5% |

---

## Apêndice — Sumário de Arquivos para Modificação

| Arquivo | Falhas Corrigidas |
|---|---|
| `src/components/tickets/TicketForm.tsx` | FALHA-15, FALHA-28 |
| `src/components/tickets/TicketTransferDialog.tsx` | FALHA-07 |
| `src/components/tickets/TicketCommentsTab.tsx` | FALHA-05, FALHA-12 |
| `src/pages/tickets/TicketsPage.tsx` | FALHA-01, FALHA-02, FALHA-10, FALHA-19 |
| `src/pages/reports/ReportsPage.tsx` | FALHA-18, FALHA-23 |
| `src/pages/knowledge/KnowledgePage.tsx` | FALHA-21 |
| `src/lib/sla-calculator.ts` | FALHA-08 |
| Novas migrations SQL | FALHA-03, FALHA-04, FALHA-05, FALHA-06, FALHA-08, FALHA-12, FALHA-17 |
| Novas Edge Functions | FALHA-06, FALHA-09, FALHA-13, FALHA-22 |

---

*Relatório gerado com base na análise direta do código-fonte do projeto. Todas as referências de arquivo incluem caminhos e linhas verificadas.*
