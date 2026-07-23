# Product Ideas — Para Remix SaaS Futuro

Este documento registra ideias de produto que NÃO são prioridade para Colmeia atual mas devem ser consideradas quando o projeto for transformado em SaaS multi-tenant via remix do Lovable.

## Multi-tenancy

A migração para multi-tenant será feita via REMIX do projeto no Lovable, mantendo Colmeia atual operacional. Pré-requisitos para iniciar:
- Pelo menos 2 clientes externos pagando OU compromisso firme de compra
- Validação de que o produto MSP entrega valor real para Colmeia
- Documentação completa de casos de uso e fluxos

Trabalho estimado quando começar: 3-6 semanas (tabela tenants, RLS tenant-scoped, edges, frontend, onboarding, billing por tenant).

## Departments (escondido via flag hoje)

Sistema de departamentos de técnicos (N1, N2, NOC, Field, etc). Útil para clientes SaaS com 5+ técnicos divididos em squads.

Atual implementação: tabelas departments e department_members existem (vazias), coluna tickets.department_id existe, UI escondida via feature flag departments_enabled=false.

No remix SaaS: refatorar para tenant-scoped (cada empresa cliente sua tem seus próprios departamentos), reativar via flag por tenant.

## Gamificação (escondido via flag hoje)

Sistema de pontos e badges para técnicos. Útil para clientes SaaS com 5+ técnicos competindo. Funciona mal com 1-3 técnicos.

Atual implementação: tabelas technician_points, technician_badges, badges existem (1 ponto único cadastrado), página /gamification existe, widget MiniRanking no Dashboard, UI escondida via feature flag gamification_enabled=false.

No remix SaaS: refatorar para tenant-scoped (ranking por empresa, regras configuráveis por tenant, badges customizáveis), integrar com folha/bonificação se cliente quiser.

## Camada 3 do Financeiro (futuro)

- Reajuste automático IGPM/IPCA em contratos
- Faturamento por hora extra (quando técnico passa do contrato)
- Comissão de vendedor terceirizado
- Integração SPED/contabilidade externa
- Multi-empresa (cliente SaaS opera várias empresas)
- Multi-moeda (cliente exterior)

Ativar conforme primeiro cliente SaaS solicitar — não construir no escuro.

## Outras ideias (acumular aqui conforme aparecerem)

(vazio por enquanto)
