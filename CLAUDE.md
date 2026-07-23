@AGENTS.md

<!-- Manutenção: o AGENTS.md acima é compartilhado com outros agentes (Codex, Cursor).
     Só o que for específico do Claude Code entra abaixo. Meta: CLAUDE.md + AGENTS.md < 200 linhas
     somadas, conforme a recomendação da Anthropic — o que passar disso perde aderência. -->

# Claude Code — configuração deste projeto

## O que carrega quando

| Arquivo | Quando entra em contexto |
|---|---|
| `AGENTS.md` (importado acima) | **toda sessão** — só o essencial |
| `.claude/rules/frontend.md` | ao ler/editar `src/**/*.{ts,tsx}` |
| `.claude/rules/edge-functions.md` | ao ler/editar `supabase/functions/**` |
| `.claude/rules/banco-de-dados.md` | ao ler/editar `supabase/migrations/**` ou `src/integrations/supabase/**` |
| `.claude/skills/*/SKILL.md` | só quando você invoca a skill |
| `docs/**` | só quando alguém abre o arquivo |

Ao adicionar instrução nova, escolha o nível certo: regra que vale sempre → `AGENTS.md`;
regra de uma área → `.claude/rules/`; procedimento de vários passos → skill.
**Não repita a mesma regra em dois níveis** — instruções conflitantes fazem o Claude escolher uma ao acaso.

## Skills disponíveis

| Comando | Para quê |
|---|---|
| `/deploy-edge` | Deployar edge function no Lovable (push **não** deploya). |
| `/alterar-banco` | Aplicar DDL/DML pelo MCP do Lovable e registrar no log de alterações. |
| `/guards` | Rodar type-check, testes, build e checks de edge antes de commitar. |

## Fluxo de trabalho esperado

1. **Auditar antes de mudar.** Este é um sistema em produção que movimenta dinheiro real
   (boletos, PIX, NFS-e). Leia o fluxo afetado antes de editar.
2. **Verificar com evidência.** Sem CI: rode `/guards` e mostre a saída real. Teste que falhou
   é reportado, não omitido.
3. **Perguntar quando a resposta muda o resultado** — intenção, dado de produção, impacto financeiro.
4. **Plan mode** para mudanças que tocam faturamento, NFS-e ou cobrança.

## Ferramentas

- **MCP do Lovable** é o caminho para banco e deploy de edge. O **MCP do Supabase não deve ser usado**
  para operar este projeto.
- **graphify**: o grafo (`graphify-out/`) não é versionado — rode `graphify update .` para gerar o seu.
  As regras de uso vêm do `CLAUDE.md` do diretório pai.
