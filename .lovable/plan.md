

# Plano: Otimizacao do Fluxo de Atendimento de Tickets

## Analise do Estado Atual

### O que ja existe no sistema:
1. **Timer de Tempo**: Componente `TicketTimeTracker` com cronometro e registro manual
2. **Iniciar Atendimento**: Botao "Play" que atribui o ticket ao tecnico e muda status para `in_progress`
3. **Status "Sem Contato"**: Ja existe como `no_contact` no enum de status
4. **Comentarios**: Sistema completo com marcacao de interno/publico e registro no historico
5. **Historico**: Timeline completa de todas as acoes no chamado
6. **Finalizacao**: Dialog `TicketResolveDialog` que registra tempo e solucao
7. **Notificacoes**: Edge function `send-ticket-notification` que envia WhatsApp/Email no evento `resolved`
8. **Campo de Avaliacao**: Tabela `tickets` ja tem colunas `satisfaction_rating` e `satisfaction_comment`
9. **Contato Solicitante**: Campo `requester_contact_id` vincula ticket ao contato que abriu

### O que esta faltando:

| Funcionalidade | Status | Acao Necessaria |
|----------------|--------|-----------------|
| Exibir informacoes de contato de quem abriu | Faltando | Adicionar card com telefone/WhatsApp do solicitante |
| Inicio automatico do timer ao iniciar atendimento | Faltando | Iniciar cronometro automaticamente ao clicar "Iniciar" |
| Fluxo "Sem Contato" com notificacao visual | Parcial | Melhorar destaque e criar lembrete |
| Avaliacao do cliente para fechar chamado | Faltando | Criar interface no portal do cliente |
| Status "Concluido" vs "Fechado" | Parcial | Ajustar fluxo de 2 etapas |
| Notificacao para cliente avaliar | Faltando | Incluir link de avaliacao na notificacao |

---

## Etapas de Implementacao

### Etapa 1: Card de Informacoes do Solicitante

Criar componente que exibe dados de contato de quem abriu o chamado, visivel na aba Detalhes:

```text
+----------------------------------------+
| SOLICITANTE                            |
| Nome: Joao Silva                       |
| Cargo: Gerente de TI                   |
| Telefone: (47) 99999-9999  [Ligar]     |
| WhatsApp: (47) 99999-9999  [Mensagem]  |
| Email: joao@empresa.com                |
+----------------------------------------+
```

**Arquivo**: `src/components/tickets/RequesterContactCard.tsx` (novo)
**Modificar**: `src/components/tickets/TicketDetailsTab.tsx`

### Etapa 2: Timer Automatico ao Iniciar Atendimento

Modificar o fluxo para que ao clicar em "Iniciar Chamado":
1. Atribui o ticket ao tecnico
2. Muda status para `in_progress`
3. Inicia automaticamente o cronometro de tempo
4. Abre a janela de detalhes do ticket

**Modificar**: 
- `src/pages/tickets/TicketsPage.tsx` - Abrir detalhes apos iniciar
- `src/components/tickets/TicketTimeTracker.tsx` - Prop para iniciar automaticamente

### Etapa 3: Melhorar Fluxo "Sem Contato"

Criar botao dedicado na interface do ticket para marcar como "Sem Contato":

```text
+-------------------------------------------+
| [Finalizar]  [Pausar]  [Sem Contato]  ... |
+-------------------------------------------+
```

Ao marcar como "Sem Contato":
- Muda status para `no_contact`
- Registra no historico com timestamp
- Agenda lembrete (se configurado no sistema)

**Modificar**: `src/components/tickets/TicketDetails.tsx`

### Etapa 4: Fluxo de Encerramento em 2 Etapas

**Etapa 4.1: Tecnico Conclui (ja existe parcialmente)**
- Status muda para `resolved`
- Tempo e contabilizado
- Notificacao enviada ao cliente com link para avaliar

**Etapa 4.2: Cliente Avalia e Fecha (novo)**
- Criar formulario de avaliacao no portal do cliente
- Cliente ve tickets com status `resolved` e pode avaliar
- Apos avaliar, status muda para `closed`

### Etapa 5: Interface de Avaliacao no Portal do Cliente

Criar componente de avaliacao com estrelas e comentario:

```text
+----------------------------------------+
| AVALIAR ATENDIMENTO                    |
| Chamado #1234 - Problema no email      |
|                                        |
| Como voce avalia o atendimento?        |
| [*] [*] [*] [*] [ ]  4/5 estrelas      |
|                                        |
| Comentario (opcional):                 |
| +------------------------------------+ |
| |                                    | |
| +------------------------------------+ |
|                                        |
| [Enviar Avaliacao]                     |
+----------------------------------------+
```

**Novo arquivo**: `src/components/tickets/TicketRatingDialog.tsx`
**Modificar**: `src/pages/client-portal/ClientPortalPage.tsx`

### Etapa 6: Atualizar Notificacao de Resolucao

Incluir link para avaliacao na mensagem de WhatsApp/Email:

```text
Seu chamado #1234 foi resolvido!
Clique aqui para avaliar o atendimento e encerrar o chamado:
[Link para portal do cliente]
```

**Modificar**: `supabase/functions/send-ticket-notification/index.ts`

---

## Arquivos a Serem Modificados/Criados

| Arquivo | Acao |
|---------|------|
| `src/components/tickets/RequesterContactCard.tsx` | CRIAR |
| `src/components/tickets/TicketRatingDialog.tsx` | CRIAR |
| `src/components/tickets/TicketDetailsTab.tsx` | MODIFICAR - Adicionar card de contato |
| `src/components/tickets/TicketDetails.tsx` | MODIFICAR - Adicionar botao "Sem Contato" |
| `src/components/tickets/TicketTimeTracker.tsx` | MODIFICAR - Prop autoStart |
| `src/pages/tickets/TicketsPage.tsx` | MODIFICAR - Abrir detalhes apos iniciar |
| `src/pages/client-portal/ClientPortalPage.tsx` | MODIFICAR - Adicionar fluxo de avaliacao |
| `supabase/functions/send-ticket-notification/index.ts` | MODIFICAR - Incluir link de avaliacao |

---

## Secao Tecnica

### Busca de Dados do Solicitante

```typescript
// Adicionar ao select do ticket
const { data: ticket } = await supabase
  .from("tickets")
  .select(`
    *,
    requester_contact:client_contacts!requester_contact_id(
      id, name, email, phone, whatsapp, role
    )
  `)
  .eq("id", ticketId)
  .single();
```

### Componente de Rating

```typescript
interface TicketRatingDialogProps {
  ticketId: string;
  ticketNumber: number;
  onSuccess: () => void;
}

// Usa slider ou estrelas para nota de 1-5
// Salva em tickets.satisfaction_rating e satisfaction_comment
```

### Fluxo de Status

```text
open -> in_progress -> resolved -> closed
           |               ^
           v               |
       no_contact ---------|
           |
           v
        waiting
```

### Validacao de Fechamento

Antes de mudar para `closed`, verificar:
1. `satisfaction_rating` deve estar preenchido
2. Apenas o cliente (ou admin) pode fechar apos avaliacao

---

## Resultado Esperado

1. **Tecnico ve informacoes de contato** ao abrir o chamado
2. **Timer inicia automaticamente** quando clica em "Iniciar"
3. **Botao "Sem Contato"** facilita marcar tentativas de contato
4. **Todos os comentarios e acoes** aparecem no historico
5. **Ao finalizar**, cliente recebe notificacao com link para avaliar
6. **Cliente avalia** no portal e o chamado e fechado definitivamente
7. **Tempo total e contabilizado** automaticamente ao finalizar

