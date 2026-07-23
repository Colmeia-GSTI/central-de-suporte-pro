# Documentação por módulo

Um arquivo por setor do sistema, gerado a partir de re-auditoria direta do código (2026-07-21).
Cada um traz: escopo, arquivos front/back, fluxo de dados (rota → componente → hook → edge → tabela),
regras de negócio com `arquivo:linha`, e pontos de atenção.

**Leia o do módulo antes de mexer nele.** Não carregam automaticamente — abra sob demanda.

| Módulo | Doc | Escopo em uma linha |
|---|---|---|
| Autenticação, usuários e permissões | [auth.md](auth.md) | login, convites, RBAC, anomalias de cadastro |
| Chamados / tickets e SLA | [tickets-sla.md](tickets-sla.md) | ciclo do chamado, atendimento, pausas, SLA |
| Clientes e documentação técnica | [clientes-doc.md](clientes-doc.md) | CRUD de clientes, dossiê técnico, sync de dispositivos |
| Contratos e reajustes | [contratos.md](contratos.md) | reajuste anual, índices econômicos, renegociação |
| Faturamento e cobrança | [faturamento.md](faturamento.md) | geração de faturas, boleto/PIX, inadimplência |
| NFS-e e certificados digitais | [nfse-certificados.md](nfse-certificados.md) | emissão/cancelamento de nota, certificados A1 |
| Monitoramento (RMM/UniFi/CheckMK) | [monitoramento.md](monitoramento.md) | devices e alertas de 3 fontes externas |
| Notificações e comunicação | [notificacoes.md](notificacoes.md) | entrega multicanal e rastreio de status |
| Calendário e agendamento | [calendario.md](calendario.md) | agenda da equipe, OAuth Google |
| Inventário | [inventario.md](inventario.md) | ativos e licenças de software |
| Base de conhecimento | [base-conhecimento.md](base-conhecimento.md) | artigos, busca, feedback |
| Relatórios e dashboards | [relatorios.md](relatorios.md) | dashboards, TV dashboard, exportação |
| Gamificação | [gamificacao.md](gamificacao.md) | ranking de técnicos, badges, metas |
| Portal do cliente | [portal-cliente.md](portal-cliente.md) | área autenticada do cliente |
| Configurações e feature flags | [configuracoes.md](configuracoes.md) | centro de config, UI das integrações |
| Auditoria, segurança e logs | [auditoria-seguranca.md](auditoria-seguranca.md) | trilha de auditoria, logs, RLS |
| Banco, migrations e schema | [banco-schema.md](banco-schema.md) | schema, RPCs, Vault |
| Infraestrutura, build, PWA e testes | [infraestrutura.md](infraestrutura.md) | build, PWA, shell de UI, testes |
| Libs/hooks/UI/edge compartilhados | [compartilhados.md](compartilhados.md) | `src/lib`, `src/hooks`, `ui/`, `_shared/` |
| **Transversais** | [_transversais.md](_transversais.md) | maturidade dos setores, **registro de alterações de banco**, crons, matriz de integrações, riscos, decisões fechadas |

## Manutenção

- **Alterou o banco?** Registre em [`_transversais.md`](_transversais.md) §2.1. É o único log dessas mudanças.
- **Mudou um agendamento?** Atualize o snapshot de crons em `_transversais.md`.
- **Fechou um risco ou decidiu não fazer algo?** Registre em `_transversais.md` §8 (decisões fechadas),
  para não voltar como "achado novo" na próxima revisão.
- Estes docs descrevem o **estado real** do código, incluindo bugs conhecidos. Ao corrigir um, atualize o doc.
