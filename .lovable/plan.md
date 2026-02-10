

# Solucao Definitiva: Substituir DropdownMenu por Popover no Menu de Acoes

## Diagnostico Final

Apos investigacao profunda com browser automatizado, confirmei que o `DropdownMenu` do Radix UI nao abre em NENHUM lugar da aplicacao (testei o menu kebab das faturas E o seletor de tema do header - ambos falharam). O problema e global e esta na forma como o `DropdownMenu` do Radix lida com eventos `onPointerDown`.

Multiplas tentativas anteriores falharam:
- Remover tooltips de dentro do menu
- Trocar `Button` por `<button>` nativo
- Desabilitar efeito ripple

Nenhuma resolveu porque o problema esta no proprio componente `DropdownMenu`.

## Solucao

Substituir o `DropdownMenu` por `Popover` no menu de acoes das faturas. O `Popover` do Radix usa um modelo de eventos diferente (`onClick` vs `onPointerDown`) e e muito mais confiavel.

Para manter a mesma aparencia visual (itens clicaveis com icones), os `DropdownMenuItem` serao substituidos por botoes estilizados dentro do `PopoverContent`.

## Mudancas

### 1. Novo componente: `src/components/billing/InvoiceActionsPopover.tsx`

Extrair toda a logica do menu de acoes para um componente dedicado que usa `Popover` + `PopoverTrigger` + `PopoverContent` em vez de `DropdownMenu`.

O componente recebera:
- `invoice` - dados da fatura
- `nfseInfo` - status da NFS-e vinculada
- Callbacks para cada acao (emitir completo, gerar boleto, baixa manual, etc.)
- Estados de loading (generatingPayment, processingComplete, etc.)

O layout interno usara botoes com a mesma aparencia visual dos `DropdownMenuItem` antigos:

```text
<button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
  <Icon className="mr-2 h-4 w-4" />
  Label da Acao
</button>
```

O Popover fechara automaticamente apos cada acao ser clicada (usando estado `open` controlado).

### 2. Atualizar: `src/components/billing/BillingInvoicesTab.tsx`

- Remover todos os imports de `DropdownMenu*`
- Importar o novo `InvoiceActionsPopover`
- Substituir o bloco do `DropdownMenu` (linhas 681-896) pela chamada ao novo componente
- Manter toda a logica de negocio existente (permissoes, estados condicionais)

### 3. Manter funcionalidade identica

Todas as acoes existentes serao preservadas:
- Emitir Completo (pending/overdue)
- Gerar Boleto via Banco Inter ou Asaas (pending/overdue, sem boleto)
- Gerar PIX via Banco Inter ou Asaas (pending/overdue, sem PIX)
- Baixa Manual (pending/overdue)
- Marcar como Pago rapido (pending/overdue)
- Segunda Via (overdue)
- Renegociar (overdue)
- Enviar por Email/WhatsApp/Ambos (pending/overdue com boleto/PIX)
- Emitir NFS-e Manual (pending/overdue com contrato)
- Cancelar Boleto (com boleto, nao paga)
- Cancelar NFS-e (NFS-e autorizada)
- Ver Historico (sempre visivel)

Para sub-menus (Gerar Boleto, Gerar PIX), usarei um sistema de dois niveis dentro do Popover: ao clicar em "Gerar Boleto", a lista muda para mostrar "Banco Inter" e "Asaas" com um botao de voltar.

## Beneficios

- Resolve o problema de forma definitiva sem depender do DropdownMenu
- Componente isolado e mais facil de manter (o BillingInvoicesTab esta com 1086 linhas)
- Mesma experiencia visual para o usuario
- Popover e um primitivo Radix mais simples e robusto

## Arquivos a criar/modificar

- **Criar:** `src/components/billing/InvoiceActionsPopover.tsx`
- **Modificar:** `src/components/billing/BillingInvoicesTab.tsx`

