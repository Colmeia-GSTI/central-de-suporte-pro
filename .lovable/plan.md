

# Melhorias de UX: Ações Rápidas e Botão Atualizar no Faturamento

## 1. Ações Rápidas (QuickActionsFAB)

O FAB ja esta posicionado no canto inferior direito da tela (`fixed bottom-6 right-6`). No entanto, o layout atual expande os botoes verticalmente para cima. Nenhuma mudanca de posicao e necessaria, pois ja atende ao requisito de estar na parte inferior.

**Melhoria proposta**: Adicionar uma barra de fundo semi-transparente (backdrop) por tras dos botoes expandidos para melhor visibilidade em dark mode, e garantir que no mobile o FAB nao sobreponha elementos criticos.

## 2. Botao "Atualizar" na Secao de Faturas

Adicionar um botao de refresh na toolbar de faturas que:
- Invalida as queries `invoices`, `billing-counters` e `nfse-history` para buscar dados atualizados
- Mostra um icone de loading girando enquanto os dados sao recarregados
- Exibe um toast discreto "Dados atualizados" ao concluir
- Fica ao lado do botao "Inadimplencia" na toolbar

### Arquivos a Alterar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/billing/BillingInvoicesTab.tsx` | Adicionar botao "Atualizar" na toolbar (linha ~283). O botao usara `queryClient.invalidateQueries` para refresh de `invoices`, `billing-counters`. Mostra icone `RefreshCw` com animacao `animate-spin` durante o loading. |

### Implementacao do Botao

Na toolbar, antes do link de Inadimplencia (linha 283), inserir:

```text
<Button
  variant="outline"
  size="sm"
  className="h-9"
  disabled={isLoading || isFetching}
  onClick={() => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    toast.success("Dados atualizados");
  }}
>
  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />
  Atualizar
</Button>
```

Para detectar o estado de fetching, extrair `isFetching` da query de invoices existente (useQuery ja retorna esse valor).

### Notas Tecnicas
- O `RefreshCw` ja esta importado no arquivo (linha 23)
- O `cn` ja esta disponivel via `@/lib/utils`
- Sera necessario extrair `isFetching` do retorno do `useQuery` de faturas
- Compativel com dark mode por usar classes semanticas do design system (variant="outline")
- Responsivo: o botao se adapta ao layout flex existente

