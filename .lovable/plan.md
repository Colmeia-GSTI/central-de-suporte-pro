

# Auditoria UX: Funções Fantasmas, Navegação e Organização Visual

## 1. Funções Fantasmas Encontradas

| Função/Componente | Situação | Ação |
|---|---|---|
| **`LogsViewerTab`** | Importado em `IntegrationsTab.tsx` mas **nunca renderizado** | Adicionar aba "Logs" no `IntegrationsTab` |
| **`notify-sla-breach`** | Edge function sem UI de status ou trigger manual | CRON-only — adicionar card de status em `IntegrationStatusPanel` |
| **`check-contract-adjustments`** | Edge function sem trigger manual | CRON-only — adicionar indicador visual em `ContractsPage` para contratos com reajuste pendente |
| **`generate-invoice-payments`** | Edge function sem trigger manual | CRON-only — OK (executado automaticamente) |
| **`apply-contract-adjustment`** | Chamado pelo `ContractAdjustmentDialog` | OK — tem UI |
| **`BusinessHoursForm`** | Componente existe mas **não aparece em nenhuma tab de Settings** | Adicionar na aba "Sistema" do `SettingsPage` |

## 2. Problemas de Organização Visual

| Problema | Onde | Correção |
|---|---|---|
| **Aba Integrações com 7 tabs inline** | `IntegrationsTab.tsx` | Grid de 8 colunas (adicionar "Logs") |
| **Settings com 14+ tabs em `flex-wrap`** | `SettingsPage.tsx` | Agrupar logicamente em seções colapsáveis ou sub-tabs categorizadas |
| **Sidebar "Serviços" aponta para `/billing?tab=services`** | Confuso — item financeiro dentro de operações | Mover para dentro do grupo Financeiro (já está, OK) |
| **"Dashboard TV" sem gate de permissão** | `specialRoutes` usa roles inline, mas a rota em `AnimatedRoutes` não tem `ProtectedRoute` | Adicionar `ProtectedRoute` com `allowedRoles` |

## 3. Plano de Correções

### Tarefa 1: Renderizar `LogsViewerTab` no `IntegrationsTab`
- Adicionar 8ª aba "Logs" com ícone `FileText`
- Atualizar grid de `grid-cols-7` → `grid-cols-8`

### Tarefa 2: Adicionar `BusinessHoursForm` ao Settings
- Importar e renderizar dentro da aba "Sistema" (`SystemTab`) ou como nova aba "Horários"
- Verificar se o componente já está funcional

### Tarefa 3: Reorganizar `SettingsPage` em categorias
Agrupar as 14+ abas em **4 seções lógicas** usando um layout mais claro:

```text
┌─────────────────────────────────────────┐
│ GESTÃO          │ OPERAÇÕES             │
│ • Usuários      │ • Categorias          │
│ • Permissões    │ • Tags                │
│ • Departamentos │ • SLA                 │
│                 │ • Mapeamentos         │
├─────────────────┼───────────────────────┤
│ EMPRESA         │ COMUNICAÇÃO           │
│ • Dados         │ • Regras Notificação  │
│ • Integrações   │ • Templates Email     │
│ • Sistema       │ • Histórico Mensagens │
│ • Auditoria     │ • Métricas            │
└─────────────────┴───────────────────────┘
```

Implementação: Manter `Tabs` mas com `TabsList` visualmente segmentado usando separadores e labels de grupo.

### Tarefa 4: Proteger rota `/tv-dashboard`
- Em `AnimatedRoutes.tsx`: envolver com `<ProtectedRoute allowedRoles={["admin", "manager"]}>` 

### Tarefa 5: Indicador de Reajuste Pendente em Contratos
- Em `ContractsPage.tsx`: Adicionar badge visual em contratos com `adjustment_date` próximo (< 30 dias), para que a função `check-contract-adjustments` tenha representação visual

### Tarefa 6: Card de Status de CRONs em IntegrationStatusPanel
- Adicionar seção "Automações Agendadas" mostrando status das funções CRON: `notify-sla-breach`, `check-contract-adjustments`, `generate-invoice-payments`, `poll-services`

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/components/settings/IntegrationsTab.tsx` | Renderizar `LogsViewerTab`, grid-cols-8 |
| `src/pages/settings/SettingsPage.tsx` | Reorganizar tabs em seções visuais com separadores |
| `src/components/layout/AnimatedRoutes.tsx` | `ProtectedRoute` no `/tv-dashboard` |
| `src/pages/contracts/ContractsPage.tsx` | Badge de reajuste pendente |
| `src/components/settings/integrations/IntegrationStatusPanel.tsx` | Seção de CRONs agendados |

