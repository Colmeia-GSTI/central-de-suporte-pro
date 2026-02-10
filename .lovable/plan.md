

# Correcao: Menu Kebab Nao Abre na Listagem de Faturas

## Investigacao Realizada

Testei o menu diretamente no browser automatizado: cliquei o botao varias vezes (por click e por teclado), e confirmei que o dropdown **nunca aparece**. O `Select` de filtro de status na mesma pagina funciona normalmente, entao o problema e especifico do `DropdownMenu`.

## Causa Raiz Identificada

O componente `Button` (`src/components/ui/button.tsx`) tem um efeito **ripple** habilitado por padrao que adiciona `overflow-hidden` ao botao (linha 73). Mais criticamente, o `Button` intercepta o `onClick` com um `handleClick` customizado (linhas 47-67) que manipula o DOM diretamente (cria e remove elementos `span`).

Quando o `DropdownMenuTrigger` usa `asChild`, o Radix mescla seus event handlers (`onPointerDown`) com os do `Button`. O handler `onPointerDown` do Radix chama `event.preventDefault()` internamente para evitar que o foco mude. Porem, o ripple effect do Button insere elementos no DOM durante o ciclo de eventos, o que pode interferir com o calculo de posicionamento do Popper e causar o fechamento imediato do menu.

**A solucao mais segura e direta**: desabilitar o ripple no botao do trigger do DropdownMenu adicionando `ripple={false}`.

## Mudancas

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

Na linha 687, alterar o `Button` do trigger para desabilitar o ripple:

```text
// ANTES:
<Button variant="outline" size="sm">

// DEPOIS:
<Button variant="outline" size="sm" ripple={false}>
```

Isso remove o `overflow-hidden` e a manipulacao de DOM no click, eliminando a interferencia com o Radix DropdownMenu.

## Verificacao Adicional

Se a mudanca acima nao resolver, a alternativa e substituir o `Button` por um `button` nativo com as mesmas classes visuais, removendo completamente a camada do componente Button:

```text
<DropdownMenuTrigger asChild>
  <button className="inline-flex items-center justify-center rounded-md border border-input bg-background h-9 px-3 text-sm hover:bg-accent hover:text-accent-foreground">
    {generatingPayment?.startsWith(invoice.id) ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <MoreHorizontal className="h-4 w-4" />
    )}
  </button>
</DropdownMenuTrigger>
```

Essa segunda abordagem elimina qualquer possibilidade de conflito entre o Button customizado e o Radix.

**Recomendacao**: implementar as DUAS abordagens em sequencia -- primeiro tentar `ripple={false}`, e se nao resolver, usar o `button` nativo.

## Limpeza

Remover o import nao utilizado de `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` (linhas 48-50) ja que nenhuma tooltip e mais usada neste componente.

## Arquivo a modificar
- `src/components/billing/BillingInvoicesTab.tsx`

