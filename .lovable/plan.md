
# Revisão Completa E2E: Diagnóstico de Problemas no Sistema de Faturamento

## Resumo Executivo

Após análise profunda do sistema de faturamento, identifiquei **7 problemas críticos** que explicam por que a QUAZA não aparece no faturamento e outros erros detectados.

---

## Problema 1: QUAZA Sem Faturas (CAUSA RAIZ)

### Diagnóstico
O contrato da QUAZA existe e está **ativo** no banco de dados:
```
Contrato: "Gestão de TI - Remoto"
Cliente: QUAZA TECNOLOGIA LTDA
Valor Mensal: R$ 650,00
Status: active
nfse_service_code: 010701
billing_day: 7
```

Porém, **não existem faturas** na tabela `invoices` - a query retorna array vazio.

### Causa
O botão "Gerar Faturas Mensais" (`generate-monthly-invoices`) **nunca foi executado** para o mês atual:
- Tabela `invoice_generation_log` está vazia
- Nenhum log da edge function foi registrado
- A fatura precisa ser gerada manualmente ou via CRON job configurado

### Solução
1. Usuário deve clicar em "Gerar Faturas Mensais" na aba Faturas
2. OU configurar um CRON job para execução automática

---

## Problema 2: Erro de Console - ConfirmDialog sem forwardRef

### Diagnóstico
```
Warning: Function components cannot be given refs. 
Did you mean to use React.forwardRef()?
Check the render method of `BillingBoletosTab`.
```

### Causa
O componente `ConfirmDialog` em `src/components/ui/confirm-dialog.tsx` é um function component normal, mas o Radix UI `AlertDialog` tenta passar uma ref para ele.

### Código Atual (Linha 24-55)
```typescript
export function ConfirmDialog({...}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      ...
    </AlertDialog>
  );
}
```

### Solução
Converter para `React.forwardRef` ou simplificar removendo a necessidade de ref:
```typescript
import * as React from "react";

export const ConfirmDialog = React.forwardRef<HTMLDivElement, ConfirmDialogProps>(
  ({ open, onOpenChange, title, description, ... }, ref) => {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent ref={ref}>
          ...
        </AlertDialogContent>
      </AlertDialog>
    );
  }
);
ConfirmDialog.displayName = "ConfirmDialog";
```

---

## Problema 3: ContractHistorySheet - Query Inválida (nfse_records)

### Diagnóstico
O network request mostra erro 400:
```json
{
  "code": "PGRST200",
  "details": "Searched for a foreign key relationship between 'invoices' and 'nfse_records' in the schema 'public', but no matches were found.",
  "hint": "Perhaps you meant 'nfse_history' instead of 'nfse_records'."
}
```

### Causa
Em `ContractHistorySheet.tsx` (linha 144), a query usa `nfse_records` que não existe:
```typescript
.select(`
  id, invoice_number, amount, due_date, status, paid_date, reference_month,
  nfse_records(id, numero, status, created_at)  // ← INCORRETO
`)
```

### Tabela Correta
A tabela no banco é `nfse_history`, e ela tem:
- Relação `nfse_history.invoice_id → invoices.id`
- Campos: `numero_nfse` (não `numero`)

### Solução
```typescript
.select(`
  id, invoice_number, amount, due_date, status, paid_date, reference_month,
  nfse_history(id, numero_nfse, status, created_at)
`)
```

E atualizar o tipo `InvoiceEntry`:
```typescript
type InvoiceEntry = {
  ...
  nfse_history: Array<{  // Renomeado
    id: string;
    numero_nfse: string | null;  // Renomeado
    status: string;
    created_at: string;
  }>;
};
```

---

## Problema 4: ContractHistorySheet - Query FK Inválida (profiles:user_id)

### Diagnóstico
Network request erro 400:
```json
{
  "code": "PGRST200",
  "details": "Searched for a foreign key relationship between 'contract_history' and 'user_id' in the schema 'public', but no matches were found."
}
```

### Causa
Em `ContractHistorySheet.tsx` (linhas 89-95 e 113-119), as queries tentam fazer join com `profiles` via `user_id`:
```typescript
.select(`..., profiles:user_id(full_name)`)
```

Mas o `user_id` em `contract_history` e `contract_service_history` aponta para `auth.users`, não para `profiles`. A tabela `profiles` tem sua própria FK: `profiles.user_id → auth.users.id`.

### Solução
Remover o join aninhado e buscar profiles separadamente, ou alterar a query:
```typescript
// Opção 1: Buscar sem profiles (simplificado)
.select(`id, action, changes, comment, created_at, user_id`)

// Depois buscar o nome do usuário separadamente se necessário
```

---

## Problema 5: PIX Não Funciona - Escopos Não Habilitados

### Diagnóstico (Edge Function Logs)
```
[BANCO-INTER] Token error for scope "cob.read cob.write": No registered scope value for this client
[BANCO-INTER] Escopos de PIX não disponíveis: Escopo "cob.read cob.write" não está habilitado
```

### Causa
O Client ID do Banco Inter não tem os escopos de PIX habilitados no portal do banco.

### Solução
1. Acessar o portal de desenvolvedores do Banco Inter
2. Editar a aplicação vinculada ao Client ID
3. Habilitar os escopos: `cob.read`, `cob.write`
4. Aguardar a aprovação do banco (pode levar até 24h)

---

## Problema 6: NFS-e Avulsa Sem Vínculo

### Diagnóstico
A única NFS-e no sistema é avulsa:
```sql
id: 6832765e-dbaf-49c0-92f3-c873b8581422
contract_id: NULL  -- Sem contrato
invoice_id: NULL   -- Sem fatura
client_id: 45e19c3b-53b9... (CXA DE PREST...)
numero_nfse: 78
status: autorizada
valor_servico: 1461.44
```

### Observação
Esta NFS-e foi emitida de forma avulsa para outro cliente (CXA/CAPASEMU), não para a QUAZA. Isso é comportamento esperado para NFS-e avulsas.

---

## Problema 7: Checkbox com Estado Indeterminate (Bug Visual)

### Diagnóstico
Em `BillingInvoicesTab.tsx` (linha 653), o checkbox usa a prop `indeterminate`:
```tsx
<Checkbox
  checked={selectedInvoices.size > 0 && selectedInvoices.size === invoices.length}
  indeterminate={selectedInvoices.size > 0 && selectedInvoices.size < invoices.length}
  ...
/>
```

### Problema
O componente Radix UI Checkbox não suporta a prop `indeterminate` nativamente. Isso pode causar comportamento inesperado.

### Solução
Usar `checked="indeterminate"` como valor do estado:
```tsx
<Checkbox
  checked={
    selectedInvoices.size === invoices.length 
      ? true 
      : selectedInvoices.size > 0 
        ? "indeterminate" 
        : false
  }
  ...
/>
```

---

## Resumo dos Arquivos a Corrigir

| # | Arquivo | Problema | Prioridade |
|---|---------|----------|------------|
| 1 | `src/components/ui/confirm-dialog.tsx` | forwardRef missing | Alta |
| 2 | `src/components/contracts/ContractHistorySheet.tsx` | nfse_records → nfse_history | Alta |
| 3 | `src/components/contracts/ContractHistorySheet.tsx` | profiles:user_id FK inválida | Alta |
| 4 | `src/components/billing/BillingInvoicesTab.tsx` | Checkbox indeterminate | Média |
| 5 | **Portal Banco Inter** | Habilitar escopos PIX | Externa |

---

## Ações Imediatas para o Usuário

### Para ver a QUAZA no faturamento:
1. Vá para `/billing` → aba "Faturas"
2. Clique no botão "Gerar Faturas Mensais"
3. A fatura da QUAZA será criada para Fevereiro/2026
4. Depois use "Processar Selecionados" para gerar boleto e NFS-e

### Para habilitar PIX:
1. Acesse https://developers.inter.co/
2. Vá para sua aplicação
3. Habilite os escopos `cob.read` e `cob.write`
4. Aguarde aprovação do banco

---

## Plano de Implementação

### Fase 1: Correções Críticas de Frontend
1. **ConfirmDialog**: Adicionar forwardRef
2. **ContractHistorySheet**: Corrigir queries do Supabase

### Fase 2: Melhorias de UX
3. **BillingInvoicesTab**: Corrigir estado indeterminate do checkbox

### Fase 3: Validações Preventivas
4. Adicionar verificação se existem faturas antes de processar
5. Melhorar mensagens de erro quando contrato não tem código de serviço

---

## Detalhes Técnicos das Correções

### 1. confirm-dialog.tsx (forwardRef)
```typescript
import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog = React.forwardRef<
  React.ElementRef<typeof AlertDialogContent>,
  ConfirmDialogProps
>(({ open, onOpenChange, title, description, confirmLabel = "Confirmar", 
     cancelLabel = "Cancelar", variant = "default", onConfirm, isLoading = false }, ref) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent ref={ref}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {isLoading ? "Processando..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
ConfirmDialog.displayName = "ConfirmDialog";
```

### 2. ContractHistorySheet.tsx (Queries Corrigidas)
```typescript
// Tipo corrigido
type InvoiceEntry = {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date: string | null;
  reference_month: string | null;
  nfse_history: Array<{
    id: string;
    numero_nfse: string | null;
    status: string;
    created_at: string;
  }>;
};

// Query de invoices corrigida (linha 134)
.select(`
  id, invoice_number, amount, due_date, status, paid_date, reference_month,
  nfse_history(id, numero_nfse, status, created_at)
`)

// Queries de history sem join de profiles (linhas 88 e 110)
// Remover profiles:user_id() das queries
.select(`id, action, changes, comment, created_at, user_id`)
.select(`id, action, service_name, old_value, new_value, created_at, user_id`)
```

### 3. BillingInvoicesTab.tsx (Checkbox)
```typescript
// Linha 651-655
<Checkbox
  checked={
    selectedInvoices.size === invoices.length
      ? true
      : selectedInvoices.size > 0
        ? "indeterminate"
        : false
  }
  onCheckedChange={toggleSelectAll}
  disabled={invoices.length === 0}
/>
```
