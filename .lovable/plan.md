
# Plano: Adicionar Ações de Cancelamento/Exclusão em Boletos Aguardando Processamento

## Objetivo
Implementar na listagem de boletos aguardando processamento:
1. Opções individuais de cancelamento e exclusão no dropdown de cada boleto
2. Seleção múltipla com barra de ações em lote (cancelar/excluir vários)

---

## Escopo das Alterações

### Arquivo: `src/components/billing/BillingBoletosTab.tsx`

### Mudanças Necessárias

#### 1. Adicionar Estado para Seleção Múltipla
```text
- selectedBoletos: Set<string> - conjunto de IDs selecionados
- isDeleting: boolean - estado de loading para exclusão
- isBatchCancelling: boolean - estado de loading para cancelamento em lote
- deleteDialog: { open, invoice, isLoading } - modal de confirmação exclusão individual
- batchActionDialog: { open, action, isLoading } - modal de confirmação em lote
```

#### 2. Adicionar Coluna de Checkbox na Tabela "Aguardando Processamento"
```text
Posição: Primeira coluna
Elementos:
- Header: Checkbox "selecionar todos"
- Cada linha: Checkbox individual
```

#### 3. Adicionar Coluna de Ações na Tabela "Aguardando Processamento"
```text
Posição: Última coluna
Elementos por linha:
- Dropdown com:
  - "Cancelar Boleto" (invoca banco-inter action=cancel)
  - "Excluir Fatura" (remove registro do banco de dados)
```

#### 4. Barra de Seleção Múltipla
```text
Quando: selectedBoletos.size > 0
Localização: Acima da tabela "Aguardando Processamento"
Elementos:
- Contador: "X boleto(s) selecionado(s)"
- Botão "Cancelar Selecionados" (ícone XCircle)
- Botão "Excluir Selecionados" (ícone Trash2, variante destructive)
```

#### 5. Modais de Confirmação
```text
Modal Individual:
- Cancelar: Confirma cancelamento do boleto no Banco Inter
- Excluir: Confirma remoção da fatura do sistema

Modal em Lote:
- Cancelar em lote: "Deseja cancelar X boletos selecionados?"
- Excluir em lote: "Deseja excluir X faturas selecionadas? Esta ação não pode ser desfeita."
```

---

## Implementação Técnica

### Funções a Adicionar

```text
toggleBoletoSelection(id: string)
  - Adiciona ou remove ID do Set selectedBoletos

toggleSelectAllPending()
  - Se todos selecionados: limpa Set
  - Senão: adiciona todos os IDs de pendingProcessing

handleDeleteInvoice(invoiceId: string)
  - supabase.from("invoices").delete().eq("id", invoiceId)
  - Invalida queries e fecha modal

handleBatchCancel()
  - Loop pelos IDs selecionados
  - Para cada: supabase.functions.invoke("banco-inter", { action: "cancel", invoice_id })
  - Contabiliza sucesso/erro
  - Toast com resultado
  - Limpa seleção

handleBatchDelete()
  - supabase.from("invoices").delete().in("id", Array.from(selectedBoletos))
  - Toast de sucesso
  - Limpa seleção
  - Invalida queries
```

### Estrutura da Tabela Atualizada

```text
TableHeader:
  [Checkbox] | # | Cliente | Valor | Vencimento | Status | Ações

TableRow:
  [Checkbox] | #123 | Nome Cliente | R$ 500,00 | 15/02/2025 | Badge Processando | DropdownMenu
```

### Dropdown de Ações (Individual)

```text
<DropdownMenu>
  <DropdownMenuTrigger>
    <Button variant="ghost" size="icon">
      <MoreHorizontal />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={handleCancelSingle}>
      <XCircle /> Cancelar Boleto
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleDeleteSingle} className="text-destructive">
      <Trash2 /> Excluir Fatura
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Visual da Interface

### Banner de Seleção
```text
┌─────────────────────────────────────────────────────────────────────────┐
│  3 boleto(s) selecionado(s)               [Cancelar] [Excluir Seleção]  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tabela Aguardando Processamento (Atualizada)
```text
┌───┬──────┬─────────────┬───────────┬────────────┬─────────────┬─────────┐
│ ☑ │  #   │   Cliente   │   Valor   │ Vencimento │   Status    │  Ações  │
├───┼──────┼─────────────┼───────────┼────────────┼─────────────┼─────────┤
│ ☐ │ #456 │ QUAZA TEC.  │ R$ 800,00 │ 20/02/2025 │ Processando │   ...   │
│ ☑ │ #457 │ ABC Corp    │ R$ 500,00 │ 22/02/2025 │ Processando │   ...   │
│ ☑ │ #458 │ XYZ Ltda    │ R$ 300,00 │ 25/02/2025 │ Processando │   ...   │
└───┴──────┴─────────────┴───────────┴────────────┴─────────────┴─────────┘
```

---

## Imports Adicionais Necessários

```typescript
import { Trash2, MoreHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

---

## Segurança

- Botões protegidos por `PermissionGate module="financial" action="manage"`
- Confirmação obrigatória antes de ações destrutivas
- Log de auditoria (já existe via trigger no banco)

---

## Arquivos Modificados

| Arquivo | Alterações |
|---------|------------|
| `src/components/billing/BillingBoletosTab.tsx` | Estado de seleção, checkboxes, dropdown de ações, barra de lote, modais de confirmação |

---

## Fluxo de Usuário

1. Usuário acessa aba "Boletos" 
2. Na seção "Aguardando Processamento", vê checkboxes
3. Pode selecionar boletos individuais ou usar "selecionar todos"
4. Com seleção ativa, aparece barra com botões de ação em lote
5. Ao clicar em ação, modal de confirmação aparece
6. Após confirmar, sistema processa e exibe resultado

