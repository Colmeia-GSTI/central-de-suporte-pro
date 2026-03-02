

# Dashboard Segmentado por Perfil de Usuario

## Regras de Visibilidade

| Papel | O que ve |
|---|---|
| **admin** | Dashboard completo da empresa (6 cards: Abertos, Em Andamento, Resolvidos Hoje, SLA Violado, Clientes Ativos, Taxa de Resolucao + graficos + lista recente) |
| **manager** | Dashboard da empresa simplificado (3 cards: Abertos, Em Andamento, Resolvidos Hoje + graficos + lista recente). Sem SLA Violado, Clientes Ativos, Taxa de Resolucao |
| **technician** (somente) | TechnicianDashboard pessoal (ja existe, sem mudancas) |
| **financial** (somente) | Novo FinancialDashboard (faturas pendentes, vencidas, receita do mes, NFS-e pendentes) |
| **client / client_master** | Redireciona para /portal (ja existe) |

## Alteracoes

### 1. Criar `src/components/dashboard/FinancialDashboard.tsx`

Dashboard focado no setor financeiro:
- **4 Cards**: Faturas Pendentes, Faturas Vencidas, Receita do Mes, NFS-e Pendentes
- **Lista**: Proximas faturas a vencer (7 dias)
- Dados das tabelas `invoices` e `nfse_history`
- Segue o padrao visual do TechnicianDashboard (cards animados, scroll area, links)

### 2. Editar `src/pages/Dashboard.tsx`

Mudancas na logica de roteamento:

```text
client/client_master -> /portal (sem mudanca)
technician-only -> TechnicianDashboard (sem mudanca)
financial-only (sem admin/manager) -> FinancialDashboard (NOVO)
admin -> Dashboard completo com 6 cards + graficos (sem mudanca)
manager (sem admin) -> Dashboard com apenas 3 cards (Abertos, Em Andamento, Resolvidos Hoje) + graficos + lista recente
```

Implementacao: condicional `isAdmin` para decidir quais cards mostrar. Para manager, filtrar o array `statCards` removendo SLA Violado, Clientes Ativos e Taxa de Resolucao. O grid passa de `xl:grid-cols-6` para `xl:grid-cols-3` quando 3 cards.

### 3. Arquivos

| Arquivo | Acao |
|---|---|
| `src/components/dashboard/FinancialDashboard.tsx` | Criar |
| `src/pages/Dashboard.tsx` | Editar -- adicionar roteamento financial-only e filtrar cards para manager |

