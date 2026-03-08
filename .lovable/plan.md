

# QA: Correção de Bugs, Links Quebrados e Fluxos Incompletos

## Bugs Encontrados

### Bug 1 (CRÍTICO): FAB "Ações Rápidas" navega para páginas de listagem em vez de criação

O `QuickActionsFAB.tsx` tem 6 botões rotulados como "Novo Chamado", "Novo Cliente", etc., mas todos navegam para a página de **listagem** (`/tickets`, `/clients`, `/contracts`, `/billing`, `/calendar`, `/inventory`).

| Botão FAB | Navega para | Deveria navegar para |
|---|---|---|
| Novo Chamado | `/tickets` | `/tickets/new` |
| Novo Cliente | `/clients` (abre lista, sem ação) | `/clients?action=new` ou abrir dialog |
| Nova Fatura | `/billing` (abre lista) | `/billing?action=new` ou abrir dialog |
| Novo Contrato | `/contracts` (abre lista) | `/contracts/new` |
| Novo Evento | `/calendar` (abre lista) | `/calendar?action=new` |
| Novo Ativo | `/inventory` (abre lista) | `/inventory?action=new` |

**Solução pragmática**: Corrigir os paths do FAB para as rotas de criação que existem (`/tickets/new`, `/contracts/new`) e adicionar query param `?action=new` para as páginas que usam Dialog inline (`/clients`, `/billing`, `/calendar`, `/inventory`). Nas respectivas páginas, detectar o param e abrir o formulário automaticamente.

### Bug 2: Clientes — sem auto-abertura do formulário via URL

`ClientsPage.tsx` não lê nenhum query param para abrir automaticamente o Dialog de criação.

**Correção**: Ler `searchParams.get("action") === "new"` e chamar `setIsFormOpen(true)`.

### Bug 3: Calendário — sem auto-abertura do formulário via URL  

Mesma situação. Precisa ler param e abrir form de evento.

### Bug 4: Inventário — sem auto-abertura do formulário via URL

Mesma situação.

### Bug 5: Billing — sem auto-abertura do formulário de fatura via URL

Mesma situação.

## Plano de Correções

### 1. `src/components/layout/QuickActionsFAB.tsx`
- Atualizar paths: `"/tickets"` → `"/tickets/new"`, `"/contracts"` → `"/contracts/new"`
- Para páginas com Dialog inline: `"/clients"` → `"/clients?action=new"`, `"/billing"` → `"/billing?action=new"`, `"/calendar"` → `"/calendar?action=new"`, `"/inventory"` → `"/inventory?action=new"`

### 2. `src/pages/clients/ClientsPage.tsx`  
- Adicionar `useEffect` que lê `searchParams.get("action") === "new"` e executa `setIsFormOpen(true)`

### 3. `src/pages/calendar/CalendarPage.tsx`
- Adicionar leitura de `?action=new` para abrir form de evento

### 4. `src/pages/inventory/InventoryPage.tsx`
- Adicionar leitura de `?action=new` para abrir form de ativo

### 5. `src/pages/billing/BillingPage.tsx`
- Adicionar leitura de `?action=new` para abrir form de fatura (tab invoices)

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/components/layout/QuickActionsFAB.tsx` | Corrigir todos os 6 paths de navegação |
| `src/pages/clients/ClientsPage.tsx` | Auto-abrir Dialog via `?action=new` |
| `src/pages/calendar/CalendarPage.tsx` | Auto-abrir form via `?action=new` |
| `src/pages/inventory/InventoryPage.tsx` | Auto-abrir form via `?action=new` |
| `src/pages/billing/BillingPage.tsx` | Auto-abrir form via `?action=new` |

