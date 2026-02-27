

# Correção: Contabilizar tempo desde abertura na finalização do chamado

## Problema

O dialog de finalização (`TicketResolveDialog`) só exibe o tempo registrado manualmente via cronômetro ou entrada manual (`ticket_time_entries`). Se o técnico não usou essas ferramentas, o tempo aparece como **0min**, mesmo que o chamado esteja aberto há horas.

O sistema deveria calcular automaticamente o tempo útil transcorrido desde o início do atendimento (`first_response_at`) até o momento da finalização, usando o horário comercial configurado.

## Causa Raiz

O componente `TicketResolveDialog` não recebe `created_at` nem `first_response_at` do ticket, e não calcula o tempo transcorrido usando o `sla-calculator.ts` que já existe no projeto.

## Solução

### 1. Adicionar props de datas ao TicketResolveDialog

Adicionar as props `ticketCreatedAt` e `firstResponseAt` para que o dialog saiba quando o chamado foi criado e quando o atendimento começou.

### 2. Calcular tempo transcorrido automaticamente

Dentro do dialog, buscar o `business_hours` da `company_settings` e usar a função `calculateElapsedBusinessMinutes` (já existente em `src/lib/sla-calculator.ts`) para calcular:
- **Tempo desde início do atendimento** (`first_response_at` até agora)
- Considerar pausas do chamado (`ticket_pauses`)

### 3. Exibir tempo calculado no card de resumo

O card "Tempo Registrado" passará a mostrar:
- **Tempo total de atendimento** (calculado automaticamente desde `first_response_at`)
- **Tempo registrado manualmente** (entradas existentes)
- **Tempo faturável** (entradas com `is_billable = true`)

### 4. Passar as props no TicketsPage

Atualizar a chamada ao `TicketResolveDialog` em `TicketsPage.tsx` para passar `ticketCreatedAt` e `firstResponseAt` do ticket selecionado.

## Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| `src/components/tickets/TicketResolveDialog.tsx` | Adicionar props de datas, buscar business_hours e pausas, calcular tempo automaticamente, exibir no card |
| `src/pages/tickets/TicketsPage.tsx` | Passar `ticketCreatedAt` e `firstResponseAt` ao dialog |

## Detalhes Técnicos

```text
TicketResolveDialog
  -> Recebe ticketCreatedAt + firstResponseAt
  -> Busca company_settings.business_hours
  -> Busca ticket_pauses do ticket
  -> Calcula: calculateElapsedBusinessMinutes(firstResponseAt, now, businessHours) - pausas
  -> Exibe no card:
     "Tempo de atendimento: Xh Ymin" (automático)
     "Tempo registrado: Xh Ymin" (manual)
     "Faturável: Xh Ymin"
```

## Impacto

| Cenário | Antes | Depois |
|---|---|---|
| Finalizar sem cronômetro | Mostra 0min | Mostra tempo real desde início do atendimento |
| Finalizar com cronômetro | Mostra apenas entradas manuais | Mostra tempo automático + entradas manuais |
| Registro no histórico | Tempo pode ser 0 | Inclui tempo real trabalhado |

