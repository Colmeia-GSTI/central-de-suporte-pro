

# Implementacao: Fluxo Completo de Atendimento de Tickets

Com base no plano aprovado, vou implementar as seguintes funcionalidades:

## Componentes a Criar

### 1. RequesterContactCard.tsx
- Card com informacoes do solicitante (quem abriu o chamado)
- Botoes de acao: Ligar, WhatsApp, Email
- Busca dados de `client_contacts` via `requester_contact_id`

### 2. TicketRatingDialog.tsx
- Dialog para cliente avaliar atendimento (1-5 estrelas)
- Campo de comentario opcional
- Ao enviar: muda status de `resolved` para `closed`
- Registra no historico e gamificacao

### 3. NoContactButton.tsx
- Botao para marcar "Sem Contato"
- Dialog com campo de observacoes
- Muda status para `no_contact`
- Registra tentativa no historico

## Arquivos a Modificar

### TicketDetailsTab.tsx
- Adicionar RequesterContactCard no topo
- Buscar dados do solicitante no select

### TicketDetails.tsx
- Adicionar botao NoContactButton na barra de acoes

### TicketsPage.tsx
- Apos iniciar atendimento: abrir detalhes do ticket
- Ticket automaticamente aberto para visualizacao

### ClientPortalPage.tsx
- Adicionar secao de avaliacao para tickets `resolved`
- Botao "Avaliar e Encerrar" para cada ticket resolvido
- Integrar TicketRatingDialog

### send-ticket-notification/index.ts
- Adicionar link de avaliacao na mensagem de resolucao
- Texto: "Acesse o portal para avaliar o atendimento"

## Resumo do Fluxo

```
1. Tecnico clica "Iniciar" -> Status = in_progress
                           -> Atribuido ao tecnico
                           -> Timer inicia
                           -> Detalhes abrem

2. Tecnico ve card do solicitante com telefone/WhatsApp

3. Se nao conseguir contato -> Clica "Sem Contato"
                            -> Status = no_contact
                            -> Registra tentativa

4. Tecnico faz anotacoes nos comentarios

5. Tecnico clica "Finalizar" -> Status = resolved
                             -> Tempo contabilizado
                             -> Cliente notificado

6. Cliente acessa portal -> Ve chamado "Resolvido"
                         -> Clica "Avaliar"
                         -> Da nota 1-5 estrelas
                         -> Status = closed
```

