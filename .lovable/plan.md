

# Revisao E2E: Adequacoes as Diretrizes da Base de Conhecimento

## Problemas Encontrados

A revisao identificou violacoes das regras definidas no AI_RULES.md e na base de conhecimento customizada. Abaixo estao categorizadas por severidade.

---

## CRITICO (causa erro de build)

### 1. Imports duplicados em `ClientDetailPage.tsx`

Linhas 30-32 duplicam imports das linhas 26-28. Isso causa erro de compilacao.

**Arquivo:** `src/pages/clients/ClientDetailPage.tsx`
**Acao:** Remover linhas 30-32.

---

## ALTO (violacoes de regras explicitas da base de conhecimento)

### 2. Uso de `as any` -- viola regra "NEVER use any"

Dois arquivos usam `as any` onde tipagem adequada e possivel:

**a) `ClientDetailPage.tsx` (linhas 124-127):**
```text
{(client as any).nickname && ...
{(client as any).nickname}
```
O campo `nickname` ja existe no tipo `Client` (a tabela `clients` tem `nickname`). Corrigir o tipo `Client` para incluir `nickname` explicitamente, removendo o cast.

**b) `ClientPortalPage.tsx` (linha 117):**
```text
return { ...(contact.clients as any), contactId: contact.id };
```
Criar uma interface tipada para o retorno da query.

**c) `ClientPortalPage.tsx` (linhas 620, 667, 727):**
```text
openTickets.map((ticket: any) => ...
resolvedTickets.map((ticket: any) => ...
closedTickets.map((ticket: any) => ...
```
Substituir por tipo inferido da query ou interface explicita.

### 3. Textarea sem `text-base` -- viola regra "No Input Zoom (iOS)"

O componente `Textarea` (`src/components/ui/textarea.tsx`) usa `text-sm`, o que causa zoom automatico no iOS Safari quando o usuario toca no campo. A regra exige font-size minimo de 16px em todos os inputs.

**Acao:** Alterar para `text-base md:text-sm` (mesmo padrao do `Input`).

### 4. `min-h-screen` em vez de `min-h-[100dvh]` -- viola regra "Dynamic Viewport"

Multiplos arquivos usam `min-h-screen` em vez de `min-h-[100dvh]`:
- `ClientPortalPage.tsx` (linhas 316, 330)
- `Login.tsx`, `ForgotPassword.tsx`, `Register.tsx`, `Setup.tsx`
- `AppLayout.tsx`, `NotFound.tsx`, `Unauthorized.tsx`, `ErrorBoundary.tsx`
- `TVDashboardPage.tsx`, `Index.tsx`

**Acao:** Substituir `min-h-screen` por `min-h-[100dvh]` em todos esses arquivos.

### 5. Ausencia de `staleTime` em queries -- viola regra "React Query Caching"

As queries em `ClientPortalPage.tsx` e `ClientManagementReport.tsx` nao configuram `staleTime`, causando refetches desnecessarios.

**Acao:** Adicionar `staleTime: 5 * 60 * 1000` (5 minutos) nas queries de dados que nao mudam frequentemente (clientData, categories, clientAssets, report).

### 6. Ausencia de `aria-label` em botoes com icone -- viola regra "Screen Readers & Focus"

Botoes icon-only sem `aria-label`:
- `ClientPortalPage.tsx` linha 818: botao de enviar comentario (`<MessageSquare />` sem label)
- `ClientDetailPage.tsx` linha 106-112: botao de voltar (`<ArrowLeft />` sem label)

**Acao:** Adicionar `aria-label` em todos os botoes icon-only.

### 7. Ausencia de `active:scale-[0.98]` -- viola regra "Tactile Feedback"

Os botoes de acao no portal do cliente (Novo Chamado, Avaliar, Sair, etc.) nao possuem feedback tatil.

**Acao:** Adicionar `active:scale-[0.98] transition-transform` nos botoes interativos principais do portal.

---

## MEDIO (melhorias de qualidade/consistencia)

### 8. Tipo `Client` incompleto em `ClientDetailPage.tsx`

O tipo `Client` marca `documentation` e `trade_name` como opcionais com `?`, mas esses campos ja existem na tabela base. O `nickname` e acessado via `as any`. Corrigir para usar o tipo correto da tabela.

**Acao:** Remover o tipo custom e usar `Tables<"clients">` diretamente, ou estender corretamente sem `as any`.

### 9. Botao de enviar comentario sem `disabled` durante mutation

Em `ClientPortalPage.tsx` linha 818, o botao de enviar comentario nao verifica `addCommentMutation.isPending`, permitindo duplo envio.

**Acao:** Adicionar `disabled={addCommentMutation.isPending}` ao botao.

### 10. Erro contextual ausente em `onError` da mutation de comentario

A mutation `addCommentMutation` nao possui callback `onError` com toast de erro.

**Acao:** Adicionar `onError` com toast descritivo.

---

## Resumo de Alteracoes

| # | Arquivo | Acao | Regra Violada |
|---|---------|------|---------------|
| 1 | `ClientDetailPage.tsx` | Remover imports duplicados (L30-32) | Build quebrado |
| 2a | `ClientDetailPage.tsx` | Remover `as any` do `nickname` | TypeScript strict |
| 2b | `ClientPortalPage.tsx` | Remover `as any` (L117, L620, L667, L727) | TypeScript strict |
| 3 | `textarea.tsx` | Adicionar `text-base md:text-sm` | iOS zoom prevention |
| 4 | 12 arquivos | `min-h-screen` -> `min-h-[100dvh]` | Dynamic viewport |
| 5 | `ClientPortalPage.tsx`, `ClientManagementReport.tsx` | Adicionar `staleTime` | React Query caching |
| 6 | `ClientPortalPage.tsx`, `ClientDetailPage.tsx` | Adicionar `aria-label` em botoes icon-only | Acessibilidade |
| 7 | `ClientPortalPage.tsx` | Adicionar `active:scale-[0.98]` nos botoes | Tactile feedback |
| 8 | `ClientDetailPage.tsx` | Corrigir tipo `Client` | TypeScript strict |
| 9 | `ClientPortalPage.tsx` | Adicionar `disabled` no botao de comentario | Mutation guard |
| 10 | `ClientPortalPage.tsx` | Adicionar `onError` na mutation de comentario | Error handling |

## Ordem de Execucao

1. Correcao critica de build (item 1)
2. Correcoes de tipagem (itens 2, 8)
3. Correcoes de UX/Mobile (itens 3, 4, 7)
4. Correcoes de acessibilidade (item 6)
5. Melhorias de performance (item 5)
6. Melhorias de resiliencia (itens 9, 10)

