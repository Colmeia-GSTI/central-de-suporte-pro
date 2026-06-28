# CLAUDE.md

Guia para agentes de IA (Claude Code e afins) trabalharem neste repositório.
Leia este arquivo antes de qualquer alteração. Para o mapa funcional completo do
sistema, veja [`docs/MAPA_DE_SETORES.md`](docs/MAPA_DE_SETORES.md).

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
- **Backend**: Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions Deno) — **provisionado via Lovable Cloud** (ver seção 4)
- **PWA**: `vite-plugin-pwa` (Workbox, `registerType: autoUpdate`) + service worker manual de push (`public/sw-push.js`, Web Push VAPID)
- **Gerenciador de pacotes**: **bun** (`bun@1.1.30`, lockfile `bun.lockb`)
- **Testes**: Vitest + Testing Library (jsdom)

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
> não falha em erros de tipo. Ao mexer em tipos, rode `bunx tsc --noEmit` manualmente.

---

## 4. Plataforma e Backend (Lovable Cloud)

Este projeto vive no **Lovable** e usa **Lovable Cloud** como backend. **O
Supabase é o Lovable Cloud** — não é um projeto Supabase independente/self-hosted.
O repositório GitHub é sincronizado com o Lovable; o que está em
`supabase/migrations/` e `supabase/functions/` é aplicado/deployado pelo Lovable
Cloud na sincronização.

### Regras de trabalho (custo é prioridade)

1. **Gastar o mínimo possível.** Prefira sempre o caminho mais barato e otimize ao
   máximo (mudanças mínimas, sem retrabalho, sem operações desnecessárias que
   consumam créditos do Lovable).
2. **Commit direto no Git sempre que possível** (frontend, edge functions e
   migrations): é a forma mais econômica. O Lovable Cloud sincroniza o repositório
   e aplica as mudanças. Commitar direto na branch principal (`main`) quando for
   apropriado para a tarefa.
3. **Use as ferramentas do Lovable (MCP do Lovable) apenas quando não der para
   fazer por commit direto** — por exemplo, ações de provisionamento/deploy que só
   o Lovable Cloud executa, ou quando o commit direto não estiver disponível.
   Nesses casos, use o MCP do Lovable para aplicar a mudança/commit.

### Configuração

- Variáveis do frontend em `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Segredos de backend (API keys, certificados, tokens) **nunca** ficam no frontend — ficam em secrets do Lovable Cloud / Supabase e são lidos dentro das edge functions.
- `supabase/config.toml` controla `verify_jwt` por função (webhooks externos precisam de `verify_jwt = false`).

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
  functions/         # ~60 edge functions Deno (index.ts + logic.ts + *_test.ts)
    _shared/         # auth-helpers, email-helpers, notification-logger, email-templates
  migrations/        # migrations SQL versionadas (fonte da verdade do schema)
relay-unifi/         # relay "Hermes" para controladoras UniFi on-prem (ver RUNBOOK_HERMES.md)
public/              # assets estáticos, pwa-icons, sw-push.js
```

Aliases de import: **`@` → `src/`** (ex.: `@/components`, `@/lib/utils`, `@/hooks`).

---

## 6. Convenções de Código

### 6.0 Princípios de Engenharia (valem para TODA mudança)

1. **Reutilizar antes de criar** — procure função/hook/componente existente (`src/lib`, `src/hooks`, `src/components/ui`, `supabase/functions/_shared`) antes de escrever algo novo. Não reimplemente o que já existe.
2. **Evitar redundância** — uma única fonte de verdade por regra de negócio; nada de caminhos paralelos que fazem a mesma coisa (ex.: duas telas para a mesma gestão, dois fluxos de e-mail).
3. **Otimizar com critério** — código eficiente e legível; extraia lógica pura testável (`logic.ts` nas edges, libs em `src/lib`); otimização de performance só com evidência (sem _premature optimization_).
4. **Limpar ao passar** — remova código morto, imports/variáveis sem uso, comentários obsoletos e arquivos órfãos no escopo que tocar (regra do escoteiro: deixe melhor do que encontrou).
5. **Manter organizado** — arquivos pequenos e focados (<150–200 linhas), agrupados por domínio, com nomes claros e estrutura consistente com o resto do projeto.

### 6.1 Componentes
- Pequenos e focados. Se um componente passar de ~150–200 linhas, refatore em subcomponentes.
- **Sempre cheque `src/components/ui/` antes de criar UI nova.** Se faltar um primitivo, instale via shadcn CLI ou siga o padrão existente.
- Telas/views vão em `src/pages/`; componentes reutilizáveis em `src/components/<domínio>/`.

### 6.2 Estilo
- **Somente Tailwind** — nada de CSS puro ou CSS-in-JS.
- Mobile-first (`sm:`, `md:`, `lg:`, `xl:`).
- Use as variáveis de tema do `tailwind.config.ts` (`primary`, `secondary`, `accent`, `destructive`, ...). shadcn configurado com `baseColor: slate`, CSS variables.

### 6.3 Dados e Supabase
- Importe o client assim: `import { supabase } from "@/integrations/supabase/client";`
- **`src/integrations/supabase/client.ts` e `types.ts` são gerados automaticamente — não edite à mão.** Após mudanças de schema, regenere os tipos.
- Use os tipos gerados de `types.ts` para acesso ao banco (type-safety).
- Realtime: use o hook **`useUnifiedRealtime`** para assinaturas Supabase.
- Lógica que exige segredos ou integrações de terceiros (Asaas, Banco Inter, WhatsApp, etc.) **mora em edge functions** (`supabase/functions/`), nunca no frontend.

### 6.4 Lógica e Hooks
- **Permissões**: proteja UI com `src/components/auth/PermissionGate.tsx` ou o hook `usePermissions` (`can`/`canAny`/`canAll`). A proteção real é RLS + edge functions; a UI é só conveniência.
- **Validação**: todo formulário tem um schema **Zod** (validação no frontend e consistência com o backend).
- **Erros**: não envolva tudo em `try/catch` desnecessário — deixe erros subirem para o `ErrorBoundary` para reporte consistente.

### 6.5 Formatação e i18n
- **Moeda (BRL)**: use `src/lib/currency.ts`.
- **Datas**: use `date-fns` (e `date-fns-tz` quando houver fuso).
- **Telefone**: use `src/lib/phone.ts`.
- Interface em **pt-BR**.

### 6.6 Edge Functions
- Estrutura padrão por função: `index.ts` (handler HTTP/Deno) + **`logic.ts`** (regra de negócio pura e testável) + `*_test.ts` / `*.test.ts`.
- **Extraia a lógica testável para `logic.ts`** (ver exemplos: `generate-monthly-invoices`, `notify-due-invoices`, `detect-auth-anomalies`, `resend-confirmation`).
- Helpers compartilhados em `supabase/functions/_shared/` (`auth-helpers.ts`, `email-helpers.ts`, `notification-logger.ts`, `email-templates/`).
- Webhooks de provedores externos exigem `verify_jwt = false` em `config.toml`.

### 6.7 Integrações
- **Mensageria/WhatsApp**: siga os padrões da Evolution API definidos em `src/components/settings/integrations/`.
- **Faturamento**: regras fiscais brasileiras (NFS-e, boletos via Asaas/Inter). Retenções e cálculos fiscais em `src/lib/nfse-retencoes.ts`. Máquina de estados de cobrança em `src/lib/billing-fsm.ts`.

---

## 7. O que NÃO fazer

- **Nunca** hardcode API keys/segredos no frontend — use secrets do Lovable Cloud / Supabase e leia dentro das edge functions.
- **Não** edite `src/integrations/supabase/client.ts` nem `types.ts` à mão (são gerados).
- **Não** apague registros financeiros ou de auditoria. Quando precisar remover um usuário/cliente referenciado nesses registros, **anonimize** em vez de deletar (regra do projeto).
- **Não** manipule o DOM manualmente — use estado/refs do React.
- **Não** crie arquivos grandes/monolíticos — refatore em subcomponentes.
- **Não** gaste créditos do Lovable à toa: prefira commit direto no Git e só recorra ao MCP do Lovable quando o commit direto não resolver.

---

## 8. Documentação de Referência

- [`docs/MAPA_DE_SETORES.md`](docs/MAPA_DE_SETORES.md) — mapa de setores e integrações, com checklists de verificação (comece por aqui)
- `SYSTEM_DOCUMENTATION.md` — documentação detalhada do sistema
- `IMPLEMENTATION_GUIDE.md` — guia de implementação
- `DEPLOYMENT_PLAYBOOK.md` — deploy, crons e operação
- `SECURITY.md` — práticas de segurança
- `TESTING.md` — estratégia de testes
- `FEATURE_FLAGS.md` — feature flags
- `relay-unifi/RUNBOOK_HERMES.md` — operação do relay UniFi (bot `hermes@colmeiagsti.com.br` — **não remover**, quebra a integração UniFi)
- `CHANGELOG.md` — histórico de mudanças (mantenha atualizado em mudanças relevantes)
