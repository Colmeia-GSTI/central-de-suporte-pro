

# Fluxo Completo: Iniciar Atendimento com Vinculação Automática e Redirecionamento

## Problema Atual

1. Após clicar "Iniciar", o técnico é vinculado e o status muda para `in_progress`, mas o Dialog abre com o objeto **desatualizado** (status ainda `open`).
2. O Dialog sempre abre na aba "Detalhes" em vez de "Comentários/Interações".
3. Não há feedback visual imediato na listagem após a ação.

## Correções

### 1. TicketDetails - Aceitar `initialTab` (src/components/tickets/TicketDetails.tsx)

- Adicionar prop opcional `initialTab?: "details" | "comments" | "history"`
- Usar `initialTab` como valor padrão do `useState` do tab ativo
- Quando o chamado for aberto após "Iniciar", já cair direto em "Comentários"

### 2. TicketsPage - Atualização otimista e redirecionamento (src/pages/tickets/TicketsPage.tsx)

- Adicionar estado `selectedTicketInitialTab` para controlar a aba inicial
- No `onSuccess` do `startTicketMutation`:
  - Construir o ticket atualizado otimisticamente (status `in_progress`, `assigned_to` preenchido, `first_response_at` definido) em vez de usar o objeto stale da lista
  - Definir `selectedTicketInitialTab = "comments"`
  - Abrir o Dialog com esses dados atualizados
- Ao abrir ticket normalmente (clique na linha ou botão "Ver"), resetar `selectedTicketInitialTab` para `undefined` (aba "Detalhes" padrão)
- Passar `initialTab` para o componente `TicketDetails`

### 3. Invalidação global de cache

- O `onSuccess` já chama `queryClient.invalidateQueries({ queryKey: ["tickets"] })`, o que propaga a atualização para todos os painéis/dashboards que usam a mesma query key.
- Isso garante sincronização global sem delay perceptível.

## Fluxo Final

```text
Técnico clica "Iniciar"
  -> Dialog de seleção de ativo abre
  -> Técnico preenche e confirma
  -> Mutation executa:
     - status -> in_progress
     - assigned_to -> user.id
     - first_response_at -> agora
     - asset_id / asset_description -> preenchido
     - ticket_history -> registrado
  -> onSuccess:
     - Cache invalidado globalmente
     - Ticket atualizado otimisticamente
     - Dialog abre na aba "Comentários"
  -> Técnico começa a registrar interações imediatamente
```

## Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| `src/components/tickets/TicketDetails.tsx` | Adicionar prop `initialTab`, usar como valor default do tab |
| `src/pages/tickets/TicketsPage.tsx` | Estado `selectedTicketInitialTab`, atualização otimista do ticket no onSuccess, passar `initialTab` ao TicketDetails |

## Impacto

| Cenário | Antes | Depois |
|---|---|---|
| Após clicar Iniciar | Abre na aba Detalhes com status "Aberto" | Abre na aba Comentários com status "Em Andamento" |
| Técnico vinculado | Já funciona | Mantido, sem alteração |
| Propagação para dashboards | Já funciona via invalidateQueries | Mantido |
| Abrir chamado normalmente | Aba Detalhes | Aba Detalhes (inalterado) |

