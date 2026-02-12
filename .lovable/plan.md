

# Permitir Valor Manual por Servico na Secao de Servicos do Contrato

## Problema
Atualmente, ao adicionar um servico ao contrato, o valor unitario e calculado automaticamente (`base_value * multiplier`) e nao pode ser alterado. Porem, valores podem variar de cliente para cliente.

## Solucao

### Alteracoes em `src/components/contracts/ContractServicesSection.tsx`

**1. Adicionar campo de valor unitario editavel no formulario de adicao:**
- Incluir um campo `CurrencyInput` ao lado do seletor de servico e quantidade
- Quando o usuario selecionar um servico, o campo de valor sera preenchido automaticamente com o valor padrao (`base_value * multiplier`), mas o usuario podera alterar manualmente

**2. Tornar o valor unitario editavel na tabela de servicos ja adicionados:**
- Substituir a celula de "Valor Unit." (atualmente apenas texto) por um `CurrencyInput` editavel
- Ao alterar o valor, recalcular o subtotal automaticamente (`unit_value * quantity`)

### Detalhes tecnicos

**Estado adicional no formulario de adicao:**
- Novo state `unitValue` inicializado como `0`
- Ao selecionar um servico no Select, preencher `unitValue` com `service.base_value * service.multiplier`
- O usuario pode sobrescrever esse valor antes de clicar "Adicionar"

**Nova funcao `handleUnitValueChange`:**
- Recebe `serviceId` e `newValue`
- Atualiza o `unit_value` do servico e recalcula o `subtotal`

**Campo de adicao (formulario superior):**
```text
[ Servico (select) ] [ Quantidade ] [ Valor Unit. (R$) ] [ Adicionar ]
```

**Tabela de servicos:**
- Coluna "Valor Unit." passa de texto para `CurrencyInput` editavel
- Subtotal recalcula automaticamente

Nenhuma alteracao de banco de dados e necessaria -- a tabela `contract_services` ja possui a coluna `unit_value`.

