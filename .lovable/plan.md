

## Análise: Exclusão de Contrato e Tratamento de Registros Vinculados

### Descobertas (Foreign Keys no banco)

| Tabela filha | Ação ao deletar contrato |
|---|---|
| `contract_services` | **CASCADE** (deleta junto) |
| `contract_history` | **CASCADE** |
| `contract_additional_charges` | **CASCADE** |
| `contract_service_history` | **CASCADE** |
| `contract_adjustments` | **CASCADE** |
| `invoices` | **SET NULL** (perde vínculo) |
| `nfse_history` | **SET NULL** |
| `tickets` | **SET NULL** |
| `sla_configs` | **SET NULL** |
| `invoice_generation_log` | **SET NULL** |

### Problema Atual

O contrato de teste ("Contrato Teste Editado") possui a fatura #120 (R$ 169,00, pendente). Se deletado agora:
- A fatura #120 ficará **órfã** (`contract_id = NULL`), sem rastreabilidade
- Isso viola a regra de negócio: *"O sistema proíbe a deleção de registros financeiros para preservar a integridade da auditoria"*
- O frontend não avisa o usuário sobre faturas/tickets vinculados antes de deletar

### Plano de Correção

| Arquivo | Mudança |
|---|---|
| `src/pages/contracts/ContractsPage.tsx` | 1. Antes de confirmar exclusão, consultar faturas e tickets vinculados ao contrato |
|  | 2. Se houver faturas não-canceladas, **bloquear exclusão** e exibir mensagem informando quantas faturas/tickets existem |
|  | 3. Se todas as faturas forem `cancelled`, permitir exclusão com aviso |
|  | 4. Melhorar o dialog de confirmação para mostrar resumo do impacto |

### Lógica do Bloqueio

```text
Ao clicar "Excluir":
  1. Consultar COUNT de invoices WHERE contract_id = X AND status != 'cancelled'
  2. Se count > 0 → Dialog: "Este contrato possui N fatura(s) ativa(s). 
     Cancele as faturas antes de excluir o contrato."
  3. Se count = 0 → Dialog padrão de confirmação com exclusão permitida
```

### Resultado

- Contratos com faturas ativas não podem ser deletados acidentalmente
- Integridade financeira e de auditoria preservada
- Usuário recebe feedback claro sobre por que não pode excluir

