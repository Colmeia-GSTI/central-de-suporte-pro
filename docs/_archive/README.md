# 📦 Arquivo de Documentação Histórica

Esta pasta contém documentos que **não refletem mais o estado atual do projeto** mas são preservados como referência histórica e auditoria.

## Por que arquivar em vez de deletar?

- Decisões antigas explicam o "porquê" do código atual
- Auditoria interna pode precisar voltar a contextos antigos
- Análises de outros agentes / consultores ficam como evidência

## Conteúdo arquivado

| Arquivo | Data original | O que era | Substituído por |
|---|---|---|---|
| `REFACTORING_ROADMAP_2026-04-29.md` | 29/abr/2026 | Roadmap antigo de refatoração com seções 1-4.6 | `docs/PROJECT_REFACTOR_PLAN.md` (guarda-chuva) + `docs/BILLING_AUDIT.md` (módulo billing) |
| `SYSTEM_DOCUMENTATION_2026-02-13.md` | 13/fev/2026 | Documentação técnica completa do sistema (1.590 linhas) | Sem substituto único — informação dispersa em código + docs específicos. Re-criar é trabalho grande, fica para PR-K se necessário |
| `RELATORIO_OTIMIZACAO_2026-02-27.md` | 27/fev/2026 | Análise de otimização de outro agente (branch `claude/optimize-support-ticketing-FPaIE`) | Itens relevantes incorporados ao `PROJECT_REFACTOR_PLAN.md` |
| `IMPLEMENTATION_GUIDE_2026-02-05.md` | 5/fev/2026 | Guia de implementação inicial | Conhecimento absorvido pelo `CHANGELOG.md` |

## Onde está a verdade atual?

- **Roadmap geral do projeto** → `docs/PROJECT_REFACTOR_PLAN.md`
- **Auditoria do módulo Billing** → `docs/BILLING_AUDIT.md`
- **Histórico de mudanças** → `CHANGELOG.md` (raiz)
- **Operação** → `BACKUP_PROCEDURE.md`, `ADMIN_TOOLS.md`, `DEPLOYMENT_PLAYBOOK.md`, `SECURITY.md`, `FEATURE_FLAGS.md`, `TESTING.md` (raiz)
- **Princípios de IA** → `AI_RULES.md` (raiz)
- **Ideias futuras** → `PRODUCT_IDEAS.md` (raiz)

## Política de arquivamento

Quando arquivar:
- Doc tem mais de 60 dias E foi substituído por outro
- Doc descreve estado/decisões que já não se aplicam
- Doc é snapshot de análise pontual (não vivo)

Quando NÃO arquivar:
- Doc operacional (procedimento de backup, deploy, etc)
- Doc de princípios (AI_RULES, SECURITY)
- Doc vivo (CHANGELOG, roadmaps atuais)

## Histórico de movimentações

- **2026-05-07** — primeira leva: `REFACTORING_ROADMAP`, `SYSTEM_DOCUMENTATION`, `RELATORIO_OTIMIZACAO`, `IMPLEMENTATION_GUIDE`. Motivo: pós-PR-D, consolidação de roadmaps em `PROJECT_REFACTOR_PLAN.md` + `BILLING_AUDIT.md`.
