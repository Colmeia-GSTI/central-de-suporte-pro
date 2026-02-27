

# Correção de 4 Problemas na Listagem de Chamados e Dashboard

## Problemas Identificados

### 1. Dashboard: "Chamados Abertos" não navega
O card `AnimatedStatCard` tem `cursor-pointer` mas nenhum `onClick` ou `Link`. Clicar nele não faz nada.

### 2. "SLA expirado" sem clareza
O indicador mostra "Expirado" quando `remainingMinutes <= 0`, mas o texto é pouco informativo. O tooltip já explica, mas visualmente o badge poderia ser mais descritivo.

### 3. Descrição manual de dispositivo não permite iniciar
Quando o cliente tem ativos cadastrados, o usuário pode selecionar "Outro" e digitar. Mas quando o cliente **não tem nenhum ativo**, o campo de descrição aparece (textarea), porém a lógica `canSubmit` exige `selectedAssetId === "other"` ou `!clientId`. Como `clientId` existe e o Select não é exibido (não há ativos), o `selectedAssetId` fica vazio e `canSubmit` retorna `false`, impedindo o início.

### 4. Botão "Iniciar" não fica verde dentro do SLA
O botão usa `variant="default"` (cor da marca/amarelo), sem lógica para mudar para verde quando o SLA está OK.

---

## Correções

### 1. Tornar cards do Dashboard clicáveis (Dashboard.tsx)

Adicionar props `href` ao `AnimatedStatCard` e envolver o card com `Link` quando `href` estiver presente.

**Arquivo: `src/components/dashboard/AnimatedStatCard.tsx`**
- Adicionar prop opcional `href?: string`
- Envolver o card com `Link` do react-router-dom quando `href` for fornecido

**Arquivo: `src/pages/Dashboard.tsx`**
- Adicionar `href` nos cards relevantes:
  - "Chamados Abertos" -> `/tickets?status=open`
  - "Em Andamento" -> `/tickets?status=in_progress`
  - "SLA Violado" -> `/tickets?status=active` (filtro de ativos)
  - "Clientes Ativos" -> `/clients`

### 2. Melhorar clareza do "SLA expirado" (SLAIndicator)

Pequeno ajuste visual: quando o SLA está expirado no modo compact, mostrar "SLA expirado" em vez de apenas "Expirado" para dar mais contexto.

**Arquivo: `src/lib/sla-calculator.ts`**
- Sem alteração necessaria (o texto "Expirado" é correto).

**Arquivo: `src/components/tickets/SLAIndicator.tsx`**
- No modo compact, quando `critical` (breached), substituir o texto de `formatMinutesToDisplay(remaining)` (que retorna "Expirado") por "SLA expirado" para maior clareza visual.

### 3. Corrigir `canSubmit` para clientes sem ativos (AssetSelectionDialog)

**Arquivo: `src/components/tickets/AssetSelectionDialog.tsx`**

Adicionar condição no `canSubmit`:
```
if (clientId && !hasAssets && customDescription.trim()) {
  return true; // Cliente sem ativos cadastrados, com descrição manual
}
```

Isso permite que quando o cliente não tem ativos e o textarea de descrição é exibido, o botão "Iniciar Atendimento" fique habilitado.

### 4. Botão "Iniciar" com cor baseada no SLA (TicketsPage)

**Arquivo: `src/pages/tickets/TicketsPage.tsx`**

O botão "Iniciar" atualmente usa `variant="default"`. Para refletir o estado do SLA:
- Usar a classe `bg-green-600 hover:bg-green-700 text-white` como estilo padrão do botão Iniciar (pois chamados abertos sem atribuição normalmente estão dentro do SLA)
- Isso dá feedback visual imediato de que o chamado pode ser iniciado

Alternativa mais robusta: como o SLA já é renderizado na coluna ao lado, o botão "Iniciar" pode simplesmente usar verde fixo (`bg-green-600`) para indicar "ação disponível/positiva", diferenciando-o visualmente do botão padrão amarelo da marca.

---

## Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/dashboard/AnimatedStatCard.tsx` | Adicionar prop `href` com navegacao |
| `src/pages/Dashboard.tsx` | Passar `href` nos stat cards relevantes |
| `src/components/tickets/AssetSelectionDialog.tsx` | Corrigir `canSubmit` para clientes sem ativos |
| `src/components/tickets/SLAIndicator.tsx` | Texto "SLA expirado" mais descritivo no compact |
| `src/pages/tickets/TicketsPage.tsx` | Botao Iniciar com cor verde |

## Impacto

| Cenario | Antes | Depois |
|---|---|---|
| Clicar "Chamados Abertos" no dashboard | Nada acontece | Navega para /tickets filtrado |
| SLA expirado na listagem | Texto "Expirado" sem contexto | "SLA expirado" com icone de alerta |
| Cliente sem ativos, digitar descricao manual | Botao desabilitado | Botao habilitado com descricao preenchida |
| Botao Iniciar na listagem | Cor amarela (default) | Cor verde indicando acao positiva |
