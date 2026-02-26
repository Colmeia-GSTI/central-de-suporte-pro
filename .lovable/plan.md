
# Plano: Corrigir Layout da Listagem de Contratos

## Problema

A tabela de contratos esta com muitas colunas e muitos botoes de acao na mesma linha, causando um layout "esculhambado" onde os elementos ficam apertados e dificeis de ler. O print de referencia mostra um layout mais limpo com as mesmas informacoes, mas melhor distribuidas.

## Correcoes

### 1. Compactar acoes em DropdownMenu

O principal problema e a coluna "Acoes" com 7+ botoes em linha. Sera reorganizada:
- Manter apenas 3 icones visiveis: Historico Financeiro ($), Historico de Alteracoes, e Gerar Fatura
- Agrupar o restante (Reajuste, Adicionais, Editar, Excluir) em um DropdownMenu com icone "..." (MoreHorizontal)

### 2. Ajustar larguras das colunas

Adicionar classes de largura fixa nas colunas para evitar que o conteudo empurre o layout:
- Contrato: `max-w-[180px] truncate`
- Cliente: `max-w-[200px] truncate`  
- Modelo: largura fixa para badge
- Valor Mensal: `whitespace-nowrap`
- Vigencia: exibir apenas data inicio (sem intervalo completo para economizar espaco)
- Prox. Reajuste: compacto
- Quitado/Atrasado: icone + numero (valor escondido em telas menores, ja implementado com `hidden lg:inline`)

### 3. Corrigir tipo `paid_at` no ContractInvoicesSheet

O campo `paid_at` nao existe na tabela `invoices` - o campo correto e `paid_date`. A query e o tipo `Invoice` serao corrigidos.

### 4. Tornar tabela responsiva com scroll horizontal

Envolver a tabela em um container com `overflow-x-auto` para garantir scroll horizontal em telas menores, em vez de comprimir todo o conteudo.

## Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/pages/contracts/ContractsPage.tsx` | Reorganizar acoes em DropdownMenu, ajustar larguras, compactar vigencia |
| `src/components/contracts/ContractInvoicesSheet.tsx` | Corrigir `paid_at` para `paid_date` |

## Detalhes Tecnicos

### Novo layout da coluna Acoes

```text
[ $ ] [ Historico ] [ Fatura ] [ ... ]
                                  |
                                  +-- Reajuste
                                  +-- Adicionais  
                                  +-- Editar
                                  +-- Excluir
```

O DropdownMenu usara `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` e `DropdownMenuItem` do Shadcn, mantendo consistencia com o design system.

### Coluna Vigencia simplificada

Em vez de exibir "31/01/2026 - 31/01/2027", exibir apenas a data de inicio com icone de calendario. Se nao tiver data fim, mostrar "Ilimitado" como badge (igual ao print de referencia).

### Impacto no Banco

Nenhum.
