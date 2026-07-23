# AGENTS.md

Guia central para agentes de IA (Claude Code, Codex, Cursor e afins) trabalharem
neste repositório. **Leia este arquivo antes de qualquer alteração.**

Este é o **arquivo canônico** do projeto. O `CLAUDE.md` é apenas um ponteiro para cá.
A documentação detalhada por módulo está em [`docs/agents/`](docs/agents/) e os
domínios transversais em [`docs/agents/_transversais.md`](docs/agents/_transversais.md).

---

## 1. Visão Geral

**Central de Suporte Pro** (codinome **Colmeia**) é uma plataforma MSP (Managed
Service Provider) que cobre o ciclo de ponta a ponta de um provedor de TI:
chamados/SLA, gestão de clientes e documentação técnica, contratos com reajuste,
faturamento com cobrança (boleto/PIX) e NFS-e, monitoramento de rede
(RMM/UniFi/CheckMK), base de conhecimento, portal do cliente, gamificação e
relatórios — com notificação multicanal (e-mail/WhatsApp/Telegram/push).

Idioma do produto e da comunicação: **português do Brasil (pt-BR)**.

---

## 2. Stack Tecnológica

- **Framework**: React 18 + TypeScript
- **Build**: Vite (plugin React SWC, chunking manual de vendors)
- **Estilo**: Tailwind CSS + shadcn/ui (primitivos Radix UI)
- **Ícones**: lucide-react
- **Estado**: TanStack Query (`@tanstack/react-query`) para estado de servidor; hooks React para estado local
- **Formulários**: React Hook Form + Zod
- **Rotas**: React Router (`src/components/layout/AnimatedRoutes.tsx`)
- **Toasts**: Sonner
- **Outros**: FullCalendar, recharts, date-fns / date-fns-tz, `@react-pdf/renderer`, framer-motion
- **Backend**: Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions Deno) — **provisionado via Lovable Cloud** (ver §4)
- **PWA**: `vite-plugin-pwa` (Workbox, `registerType: autoUpdate`) + service worker manual de push (`public/sw-push.js`, Web Push VAPID)
- **Gerenciador de pacotes**: **bun** (`bun@1.1.30`, lockfile `bun.lockb`)
- **Testes**: Vitest + Testing Library (jsdom)

Números do backend (verificado 2026-07-23): **57 diretórios** em `supabase/functions/`
(incl. `_shared` e `mcp`), **164 migrations**; ~109 tabelas, RLS e RPCs —
detalhe em [`docs/agents/banco-schema.md`](docs/agents/banco-schema.md).

---

## 3. Comandos Essenciais

```bash
bun install            # instalar dependências
bun run dev            # servidor de desenvolvimento (Vite)
bun run build          # build de produção
bun run build:dev      # build em modo development
bun run preview        # pré-visualizar o build
bun run lint           # ESLint
bun run test           # rodar testes (vitest run)
bun run test:watch     # testes em watch
bun run test:coverage  # cobertura
```

> Não há type-check (`tsc --noEmit`) nem CI no pipeline atual — `bun run build`
> não falha em erros de tipo. Ao mexer em tipos, rode `bunx tsc --noEmit` manualmente
> (baseline verificado limpo em 2026-07-21 — qualquer erro novo é regressão).

---

## 4. Plataforma e Backend (Lovable Cloud)

Este projeto vive no **Lovable** e usa **Lovable Cloud** como backend. **O
Supabase é o Lovable Cloud** — não é um projeto Supabase independente/self-hosted.
O repositório GitHub é sincronizado com o Lovable. **Atenção (verificado nesta
base):** o push ao GitHub sincroniza o **código-fonte** e o Lovable buildá/deploya
o **frontend**, mas **NÃO redeploya sozinho as Edge Functions Deno** de
`supabase/functions/`. O deploy delas (e qualquer publish) é disparado via
`mcp__Lovable__send_message` ao agente do Lovable. Banco (schema/dados) é via
Lovable MCP `query_database`.

### Regras de trabalho (custo é prioridade)

1. **Gastar o mínimo possível.** Otimize créditos do Lovable: mudanças mínimas, sem retrabalho.
2. **Código → Git; deploy de edge via mensagem.** Toda alteração de **código** é feita por **commit
   direto no GitHub/Git**. O **frontend** é buildado/deployado pelo Lovable na sincronização.
   **Mas as Edge Functions Deno NÃO sobem sozinhas no push**: o deploy delas é disparado via
   `mcp__Lovable__send_message` ao agente do Lovable (peça **apenas o deploy**, sem reescrever código).
3. **Banco de dados → Lovable MCP (sempre).** Qualquer alteração que envolva o banco — **schema E dados**
   (DDL, DML, correção de dados, qualquer SQL que grava) — é feita **exclusivamente pelo MCP do Lovable**.
   **Nunca** use o Supabase MCP nem conexão direta para operar no banco.
4. **Inspeção do banco** (somente leitura) também pelo MCP do Lovable (`query_database` com `SELECT`).
5. **Auditar antes, nunca presumir** (§6.0): audite o fluxo/dados afetados antes de mudar; em dúvida, pergunte.

### Configuração e Operação

- Variáveis do frontend em `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Segredos de backend (API keys, certificados, tokens) **nunca** ficam no frontend — ficam em secrets do Lovable Cloud / Supabase e são lidos dentro das edge functions.
- `supabase/config.toml` controla `verify_jwt` por função (webhooks externos precisam de `verify_jwt = false`).
- **Lovable project_id**: `182f97df-9e8a-4a60-88d3-f5a8ac716937` (ou redescubra via `mcp__Lovable__get_me` → `list_projects`). Ref do Supabase: `silefpsayliwqtoskkdz`.
- **Aplicar código (frontend)**: `git push origin HEAD:main` (fast-forward, sem PR) — o Lovable sincroniza e buildá/deploya o frontend.
- **Deploy de Edge Functions / publish**: `git push` (sincroniza o fonte) **+** `mcp__Lovable__send_message` pedindo o deploy das funções alteradas (o push sozinho **não** redeploya as funções Deno).
- Registro de alterações de banco, snapshot de crons e matriz de integrações: [`docs/agents/_transversais.md`](docs/agents/_transversais.md).

---

## 5. Estrutura de Diretórios

```
src/
  components/        # componentes por domínio (auth, billing, tickets, clients, ...) + ui/ (shadcn)
  pages/             # telas/rotas principais
  hooks/             # hooks reutilizáveis (useAuth, usePermissions, useUnifiedRealtime, ...)
  lib/               # utilitários e regras de negócio puras (currency, sla-calculator, billing-fsm, ...)
  integrations/
    supabase/        # client.ts e types.ts — AMBOS GERADOS, não editar à mão
  test/              # helpers, mocks, testes de integração
supabase/
  functions/         # 57 edge functions Deno (index.ts + logic.ts + *_test.ts)
    _shared/         # auth-helpers, email-helpers, notification-logger, email-templates
  migrations/        # migrations SQL versionadas (fonte da verdade do schema)
relay-unifi/         # relay "Hermes" para controladoras UniFi on-prem (ver RUNBOOK_HERMES.md)
public/              # assets estáticos, pwa-icons, sw-push.js
docs/
  agents/            # documentação por módulo (este guia) + _transversais.md
  ops/               # playbook de implantação e procedimento de backup
```

Aliases de import: **`@` → `src/`** (ex.: `@/components`, `@/lib/utils`, `@/hooks`).

---

## 6. Convenções de Código

### 6.0 Princípios de Engenharia (valem para TODA mudança)

1. **Reutilizar antes de criar** — procure função/hook/componente existente (`src/lib`, `src/hooks`, `src/components/ui`, `supabase/functions/_shared`) antes de escrever algo novo.
2. **Evitar redundância** — uma única fonte de verdade por regra de negócio; nada de caminhos paralelos.
3. **Otimizar com critério** — extraia lógica pura testável (`logic.ts` nas edges, libs em `src/lib`); otimização de performance só com evidência.
4. **Limpar ao passar** — remova código morto, imports/variáveis sem uso, comentários obsoletos e arquivos órfãos no escopo que tocar.
5. **Manter organizado** — arquivos pequenos e focados (<150–200 linhas), agrupados por domínio.
6. **Auditar antes de alterar** — leia, faça grep das referências, confirme contratos, cheque o banco quando relevante. Nunca edite "no escuro".
7. **Nunca presumir; na dúvida, perguntar** — se faltar certeza sobre intenção, dado, contrato ou impacto, **pergunte antes de agir**.
8. **Verificar todos os fluxos** — mapeie e valide TODOS os caminhos afetados (callers, edge ↔ frontend, webhooks, crons, RLS, erros).

### 6.1 Componentes
- Pequenos e focados. Passou de ~150–200 linhas, refatore em subcomponentes.
- **Sempre cheque `src/components/ui/` antes de criar UI nova.** Faltando primitivo, instale via shadcn CLI ou siga o padrão existente.
- Telas em `src/pages/`; reutilizáveis em `src/components/<domínio>/`.

### 6.2 Estilo
- **Somente Tailwind** — nada de CSS puro ou CSS-in-JS. Mobile-first (`sm:`, `md:`, ...).
- Use as variáveis de tema do `tailwind.config.ts` (`primary`, `secondary`, ...). shadcn `baseColor: slate`, CSS variables.

### 6.3 Dados e Supabase
- Importe o client: `import { supabase } from "@/integrations/supabase/client";`
- **`client.ts` e `types.ts` são gerados automaticamente — não edite à mão.** Após mudanças de schema, regenere os tipos.
- Realtime: use o hook **`useUnifiedRealtime`**.
- Lógica que exige segredos/integrações de terceiros **mora em edge functions**, nunca no frontend.

### 6.4 Lógica e Hooks
- **Permissões**: proteja UI com `src/components/auth/PermissionGate.tsx` ou `usePermissions` (`can`/`canAny`/`canAll`). Proteção real é RLS + edge functions.
- **Validação**: todo formulário tem schema **Zod**.
- **Erros**: não envolva tudo em `try/catch`; deixe erros subirem para o `ErrorBoundary`.

### 6.5 Formatação e i18n
- **Moeda (BRL)**: `src/lib/currency.ts`. **Datas**: `date-fns` (+ `date-fns-tz` para fuso). **Telefone**: `src/lib/phone.ts`. Interface em **pt-BR**.

### 6.6 Edge Functions
- Estrutura padrão: `index.ts` (handler) + **`logic.ts`** (regra pura testável) + `*_test.ts`.
- Helpers compartilhados em `supabase/functions/_shared/`.
- Webhooks de provedores externos exigem `verify_jwt = false` em `config.toml`.

### 6.7 Integrações
- **Mensageria/WhatsApp**: padrões da Evolution API em `src/components/settings/integrations/`.
- **Faturamento**: regras fiscais BR (NFS-e, boletos Asaas/Inter). Retenções em `src/lib/nfse-retencoes.ts`. FSM de cobrança em `src/lib/billing-fsm.ts`. Regras canônicas em [`docs/REGRAS_DE_COBRANCA.md`](docs/REGRAS_DE_COBRANCA.md).

---

### 6.8 Armadilha: `bun run build` no Windows corrompe o bundle MCP

`vite.config.ts` roda `mcpPlugin()`, que regenera `supabase/functions/mcp/index.ts` a partir de
`src/lib/mcp/`. **No Windows o plugin falha**: em vez de inlinear as 4 ferramentas, emite
`import mcp from "npm:C:\\Users\\...\\src\\lib\\mcp\\index.ts"` — um bundle de 8 linhas que quebraria
a edge `mcp` em produção (verificado 2026-07-23, reproduzível a cada build).

**Regra:** depois de qualquer `bun run build` local, rode
`git restore supabase/functions/mcp/index.ts` antes de commitar. Nunca commite esse arquivo
com ~8 linhas — a versão correta tem ~157 e contém as 4 ferramentas inlineadas.

---

## 7. O que NÃO fazer

- **Nunca** hardcode API keys/segredos no frontend — use secrets do Lovable Cloud / Supabase.
- **Não** edite `src/integrations/supabase/client.ts` nem `types.ts` à mão (são gerados).
- **Não** apague registros financeiros ou de auditoria. Para remover usuário/cliente referenciado nesses registros, **anonimize** em vez de deletar.
- **Não** manipule o DOM manualmente — use estado/refs do React.
- **Não** crie arquivos grandes/monolíticos — refatore em subcomponentes.
- **Não** gaste créditos do Lovable à toa: **código** via commit direto no Git; **banco** (schema/dados) **sempre** via MCP do Lovable (§4).

---

## 8. Navegação da Documentação

### Por módulo — [`docs/agents/`](docs/agents/)

| Módulo | Doc |
|---|---|
| Autenticação, Usuários e Permissões | [auth.md](docs/agents/auth.md) |
| Chamados / Tickets e SLA | [tickets-sla.md](docs/agents/tickets-sla.md) |
| Clientes e Documentação Técnica | [clientes-doc.md](docs/agents/clientes-doc.md) |
| Contratos e Reajustes | [contratos.md](docs/agents/contratos.md) |
| Faturamento e Cobrança | [faturamento.md](docs/agents/faturamento.md) |
| NFS-e e Certificados Digitais | [nfse-certificados.md](docs/agents/nfse-certificados.md) |
| Monitoramento (RMM/UniFi/CheckMK) | [monitoramento.md](docs/agents/monitoramento.md) |
| Notificações e Comunicação | [notificacoes.md](docs/agents/notificacoes.md) |
| Calendário e Agendamento | [calendario.md](docs/agents/calendario.md) |
| Inventário | [inventario.md](docs/agents/inventario.md) |
| Base de Conhecimento | [base-conhecimento.md](docs/agents/base-conhecimento.md) |
| Relatórios, Dashboards e Exportação | [relatorios.md](docs/agents/relatorios.md) |
| Gamificação | [gamificacao.md](docs/agents/gamificacao.md) |
| Portal do Cliente | [portal-cliente.md](docs/agents/portal-cliente.md) |
| Configurações e Integrações | [configuracoes.md](docs/agents/configuracoes.md) |
| Auditoria, Segurança e Logs | [auditoria-seguranca.md](docs/agents/auditoria-seguranca.md) |
| Banco de Dados, Migrations e Schema | [banco-schema.md](docs/agents/banco-schema.md) |
| Infraestrutura, Build, PWA e Testes | [infraestrutura.md](docs/agents/infraestrutura.md) |
| Libs/hooks/UI/edge compartilhados | [compartilhados.md](docs/agents/compartilhados.md) |
| **Transversais** (maturidade, banco, crons, integrações, riscos) | [_transversais.md](docs/agents/_transversais.md) |

### Regras de negócio e operação
- [`docs/REGRAS_DE_COBRANCA.md`](docs/REGRAS_DE_COBRANCA.md) — regras canônicas de cobrança/boleto/NFS-e.
- [`docs/ops/DEPLOYMENT_PLAYBOOK.md`](docs/ops/DEPLOYMENT_PLAYBOOK.md) — secrets, setup de integrações, SQL dos crons, runbook de troubleshooting, onboarding de cliente, SLA de incidentes.
- [`docs/ops/BACKUP_PROCEDURE.md`](docs/ops/BACKUP_PROCEDURE.md) — backup/restauração do banco.
- [`relay-unifi/RUNBOOK_HERMES.md`](relay-unifi/RUNBOOK_HERMES.md) — operação do relay UniFi (bot `hermes@colmeiagsti.com.br` — **não remover**, quebra a integração UniFi).
- [`docs/PRODUCT_IDEAS.md`](docs/PRODUCT_IDEAS.md) — ideias para um futuro remix SaaS multi-tenant (não é roadmap atual).
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de mudanças (mantenha atualizado em mudanças relevantes).

> **Limpeza de 2026-07-23:** os docs históricos da raiz (`SYSTEM_DOCUMENTATION.md`, `IMPLEMENTATION_GUIDE.md`,
> `SECURITY.md`, `TESTING.md`, `FEATURE_FLAGS.md`, `ADMIN_TOOLS.md`), o antigo `docs/MAPA_DE_SETORES.md` e os
> relatórios de `docs/audit/` foram **removidos**: seu conteúdo vivo está em `docs/agents/` e o que restava
> estava desatualizado (citavam arquivos e edges inexistentes). Recuperáveis no histórico do git.

---

## 9. graphify (grafo de conhecimento)

O projeto tem um grafo em `graphify-out/` (god nodes, comunidades, relações cross-file).
**Não é versionado** (gitignorado desde 2026-07-23 — são ~35 MB de artefato gerado): rode
`graphify update .` para criar/atualizar o seu localmente.

- Para perguntas sobre a base, rode `graphify query "<pergunta>"` antes de ler/grepar código-fonte. Use `graphify path "<A>" "<B>"` para relações e `graphify explain "<conceito>"` para conceitos focados.
- Use `graphify-out/wiki/index.md` (se existir) para navegação ampla.
- Leia `graphify-out/GRAPH_REPORT.md` só para revisão arquitetural ampla.
- Após modificar código, rode `graphify update .` para manter o grafo atual (AST-only, sem custo de API).
