

# Feedback visual do mínimo de 10 caracteres no campo de solução

## Problema
O usuário não sabe que precisa digitar no mínimo 10 caracteres para habilitar o botão "Finalizar Chamado".

## Solução

### Arquivo: `src/components/tickets/TicketResolveDialog.tsx`

Adicionar um contador de caracteres abaixo do textarea:
- Quando abaixo de 10 caracteres: exibir em vermelho "Faltam X caracteres"
- Quando 10 ou mais: exibir contagem em cor neutra

Nenhuma outra alteração -- o mínimo de 10 caracteres permanece.

