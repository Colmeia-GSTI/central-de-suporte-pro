# Central de Suporte Pro (Colmeia)

Plataforma MSP (Managed Service Provider) que cobre o ciclo de ponta a ponta de um provedor de TI:
chamados/SLA, gestão de clientes e documentação técnica, contratos com reajuste, faturamento com
cobrança (boleto/PIX) e NFS-e, monitoramento de rede (RMM/UniFi/CheckMK), base de conhecimento,
portal do cliente, gamificação e relatórios — com notificação multicanal
(e-mail/WhatsApp/Telegram/push).

Idioma do produto: **português do Brasil (pt-BR)**.

## Stack

React 18 + TypeScript · Vite · Tailwind CSS + shadcn/ui · TanStack Query · React Hook Form + Zod ·
Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions Deno) provisionado via
**Lovable Cloud** · PWA (vite-plugin-pwa + Web Push) · Vitest.

Gerenciador de pacotes: **bun**.

## Comandos

```bash
bun install            # instalar dependências
bun run dev            # servidor de desenvolvimento
bun run build          # build de produção
bun run lint           # ESLint
bun run test           # testes (vitest run)
bunx tsc --noEmit      # type-check (não roda no build — rode manualmente ao mexer em tipos)
```

## Plataforma

O backend é **Lovable Cloud** (Supabase). O push ao GitHub sincroniza o código-fonte e o Lovable
buildá/deploya o **frontend**, mas **não redeploya as Edge Functions Deno** — o deploy delas é
disparado via o agente do Lovable. Alterações de banco (schema e dados) são feitas
**exclusivamente pelo MCP do Lovable**.

## Documentação

Ponto de entrada: **[AGENTS.md](AGENTS.md)** — visão geral, stack, regras da Lovable Cloud,
convenções de código, o que não fazer e índice de navegação.

- Por módulo: [`docs/agents/`](docs/agents/)
- Transversais (maturidade, registro de alterações de banco, crons, integrações, riscos): [`docs/agents/_transversais.md`](docs/agents/_transversais.md)
- Operação (implantação, secrets, troubleshooting, backup): [`docs/ops/`](docs/ops/)
- Regras de cobrança: [`docs/REGRAS_DE_COBRANCA.md`](docs/REGRAS_DE_COBRANCA.md)
- Histórico: [`CHANGELOG.md`](CHANGELOG.md)
