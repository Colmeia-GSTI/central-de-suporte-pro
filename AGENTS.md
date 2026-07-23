# AGENTS.md

Guia para agentes de IA (Claude Code, Codex, Cursor) trabalharem neste repositório.
**Só o essencial de toda sessão** — o detalhe fica nos arquivos linkados em §8.

**Central de Suporte Pro** (codinome **Colmeia**) é uma plataforma MSP: chamados/SLA, clientes e
documentação técnica, contratos com reajuste, faturamento com cobrança (boleto/PIX) e NFS-e,
monitoramento de rede (RMM/UniFi/CheckMK), base de conhecimento, portal do cliente, gamificação e
relatórios, com notificação multicanal. Produto e comunicação em **português do Brasil**.

---

## 1. Stack (o que não dá para inferir do `package.json`)

- **Gerenciador de pacotes: `bun`** (não npm/yarn/pnpm). Lockfile `bun.lockb`.
- Estado de servidor: **TanStack Query**. Realtime: hook **`useUnifiedRealtime`** (não crie subscription avulsa).
- Toasts: **`sonner`** — não existe `use-toast`/`<Toaster>` do shadcn neste projeto (removidos).
- Rotas: React Router via `src/components/layout/AnimatedRoutes.tsx`.
- Backend: **Supabase provisionado via Lovable Cloud** (ver §3). Edge Functions em Deno.
- Alias de import: **`@` → `src/`**.

Escala atual (2026-07-23): 57 diretórios em `supabase/functions/`, 164 migrations, ~109 tabelas.

---

## 2. Comandos

```bash
bun install            # dependências
bun run dev            # dev server (Vite)
bun run build          # build de produção
bun run lint           # ESLint
bun run test           # vitest run
```

**Não há CI nem type-check no build.** `bun run build` **não** falha em erro de tipo.
Os guards são manuais — rode-os você (skill `/guards`):

```bash
bunx tsc --noEmit                              # baseline 0 erros (só cobre src/)
bun run test                                   # baseline 12 arquivos / 78 testes
deno test -A --no-lock supabase/functions/<f>/ # edges (tsc NÃO cobre supabase/)
```

---

## 3. Plataforma: Lovable Cloud

**O Supabase deste projeto é o Lovable Cloud** — não é um projeto Supabase autônomo.
O repositório GitHub sincroniza com o Lovable. Três caminhos distintos, não os confunda:

| O que muda | Como aplicar |
|---|---|
| **Código do frontend** | `git push origin HEAD:main` — o Lovable sincroniza e buildá/deploya sozinho. |
| **Edge Function Deno** | `git push` **+** deploy explícito via `mcp__…_Lovable__send_message`. **O push sozinho NÃO redeploya.** Use a skill `/deploy-edge`. |
| **Banco (schema E dados)** | **Exclusivamente** `mcp__…_Lovable__query_database`. Use a skill `/alterar-banco`. |

**Nunca** use o MCP do Supabase nem conexão direta para operar no banco.
Migrations em `supabase/migrations/` são registro histórico — adicionar arquivo lá **não aplica nada**.

**Custo é prioridade:** créditos do Lovable são finitos. Código vai por Git (grátis); só o deploy de
edge e as operações de banco passam pelo Lovable. Ao pedir deploy, peça **apenas o deploy** — se o
agente do Lovable reescrever código, você paga por isso e ainda ganha um diff não revisado.

Referências: `project_id` do Lovable `182f97df-9e8a-4a60-88d3-f5a8ac716937`, ref do Supabase
`silefpsayliwqtoskkdz`. Frontend lê `.env` (`VITE_SUPABASE_*` — chaves publicáveis, versionadas
pelo Lovable, **não remova do git**). Segredos de backend vivem em secrets do Lovable Cloud.

---

## 4. Princípios de engenharia (valem para TODA mudança)

1. **Reutilizar antes de criar** — procure em `src/lib`, `src/hooks`, `src/components/ui`,
   `supabase/functions/_shared` antes de escrever algo novo.
2. **Uma fonte de verdade por regra de negócio** — nada de caminhos paralelos.
3. **Extrair lógica pura testável** (`logic.ts` nas edges, libs em `src/lib`).
4. **Limpar ao passar** — código morto, imports sem uso e arquivos órfãos no escopo que tocar.
5. **Arquivos pequenos** (<150–200 linhas), agrupados por domínio.
6. **Auditar antes de alterar** — leia, faça grep dos callers, confirme contratos. Nunca edite no escuro.
7. **Nunca presumir; na dúvida, pergunte.**
8. **Verificar todos os fluxos afetados** — callers, edge ↔ frontend, webhooks, crons, RLS, erros.

Convenções detalhadas por área carregam sozinhas ao tocar nos arquivos
(`.claude/rules/frontend.md`, `edge-functions.md`, `banco-de-dados.md`).

---

## 5. Armadilhas conhecidas

- **`bun run build` no Windows corrompe o bundle MCP.** `mcpPlugin()` regenera
  `supabase/functions/mcp/index.ts` com um `import npm:C:\…` inválido, reduzindo o arquivo de ~157
  para 8 linhas e apagando as 4 ferramentas MCP. Depois de qualquer build local:
  `git restore supabase/functions/mcp/index.ts`. Há um hook que bloqueia o commit se passar.
- **`send_message` do Lovable reporta falha por timeout (300 s) mesmo com o deploy OK.**
  Não retente às cegas — confirme por `list_messages` ou pelo commit `Deployed … Edge Func.` em `origin/main`.
- **Webhook de provedor externo exige `verify_jwt = false`** em `supabase/config.toml`.
  Sem isso o provedor recebe 401 e o evento se perde **sem erro visível**.
- **`tsc` não cobre `supabase/functions/`** — o `tsconfig` só inclui `src/`. Use `deno` para as edges.
- **Repo dentro do Nextcloud:** se o git acusar `unable to open loose object` ou pastas de `src/`
  ficarem ilegíveis, o cliente Nextcloud está parado — suba-o e a árvore reidrata.

---

## 6. O que NÃO fazer

- **Nunca** hardcode API key/segredo no frontend.
- **Não** edite `src/integrations/supabase/client.ts` nem `types.ts` (são gerados).
- **Não** apague registro financeiro ou de auditoria — **anonimize** em vez de deletar.
- **Não** manipule o DOM manualmente — use estado/refs do React.
- **Não** opere o banco fora do MCP do Lovable.
- **Não** peça ao agente do Lovable para "melhorar" código — só deploy.

---

## 7. Navegação

| Preciso de… | Onde |
|---|---|
| Documentação de um módulo | [`docs/agents/README.md`](docs/agents/README.md) — índice dos 20 docs |
| Registro de alterações de banco, crons, matriz de integrações, riscos, **decisões já fechadas** | [`docs/agents/_transversais.md`](docs/agents/_transversais.md) |
| Docs oficiais de API externa (Asaas, Inter, Evolution, RMM…) | [`docs/integracoes-externas.md`](docs/integracoes-externas.md) |
| Regras de cobrança/boleto/NFS-e | [`docs/REGRAS_DE_COBRANCA.md`](docs/REGRAS_DE_COBRANCA.md) |
| Secrets, setup de integração, SQL dos crons, troubleshooting, onboarding | [`docs/ops/DEPLOYMENT_PLAYBOOK.md`](docs/ops/DEPLOYMENT_PLAYBOOK.md) |
| Backup/restauração do banco | [`docs/ops/BACKUP_PROCEDURE.md`](docs/ops/BACKUP_PROCEDURE.md) |
| Relay UniFi (bot `hermes@colmeiagsti.com.br` — **não remover**) | [`relay-unifi/RUNBOOK_HERMES.md`](relay-unifi/RUNBOOK_HERMES.md) |
| Ideias para futuro SaaS multi-tenant (não é roadmap) | [`docs/PRODUCT_IDEAS.md`](docs/PRODUCT_IDEAS.md) |
| Histórico de mudanças | [`CHANGELOG.md`](CHANGELOG.md) — mantenha atualizado |
