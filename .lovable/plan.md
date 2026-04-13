

## Plano: Soft-delete de contratos (status `cancelled`)

### Mudança

Em vez de deletar fisicamente o contrato (`DELETE FROM contracts`), atualizar o status para `cancelled` e registrar no histórico. Remover toda a lógica de bloqueio (checagem de faturas ativas) já que o soft-delete preserva todos os vínculos.

### Alterações em `src/pages/contracts/ContractsPage.tsx`

1. **Simplificar `handleDeleteClick`**: Remover a consulta assíncrona de faturas ativas e os estados `deleteBlocked`/`checkingDelete`. Abrir direto o dialog de confirmação.

2. **Converter `deleteMutation` para soft-delete**:
   - Trocar `supabase.from("contracts").delete()` por `.update({ status: "cancelled" })`
   - Inserir registro em `contract_history` com action `"cancelled"` e comment `"Contrato cancelado pelo usuário"`
   - Mensagem de sucesso: "Contrato cancelado com sucesso"

3. **Atualizar textos do dialog de confirmação**:
   - Título: "Cancelar Contrato"
   - Descrição: mencionar que o contrato será marcado como cancelado e poderá ser consultado no histórico
   - Botão: "Cancelar Contrato"

4. **Remover código morto**: estados `deleteBlocked`, `checkingDelete`, e o segundo `ConfirmDialog` de bloqueio.

5. **Ocultar botão para contratos já cancelados**: Não mostrar "Cancelar" no dropdown se `contract.status === 'cancelled'`.

### Resultado

- Nenhum contrato é deletado fisicamente
- Faturas, tickets e NFS-e permanecem vinculados
- Histórico completo preservado
- Auditoria íntegra

