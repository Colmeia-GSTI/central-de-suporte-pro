
# Correção: Menu de 3 pontinhos não abre na listagem de faturas

## Causa Raiz

O `DropdownMenuContent` contém componentes `Tooltip` + `TooltipProvider` aninhados (linhas 848-898 de `BillingInvoicesTab.tsx`). Isso causa um conflito conhecido no Radix UI onde o tooltip intercepta eventos de ponteiro (`onPointerDownOutside`) e fecha o dropdown imediatamente após abrir.

Os dois blocos problemáticos são:
- Linhas 848-870: Tooltip no "Cancelar Boleto"
- Linhas 877-898: Tooltip no "Cancelar NFS-e"

## Solução

Remover todos os `Tooltip`/`TooltipProvider` de dentro do `DropdownMenuContent` e substituir por texto descritivo inline nos itens desabilitados.

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

### Mudancas especificas:

**1. Bloco "Cancelar Boleto" (linhas 844-870)** - substituir o wrapper Tooltip por um `DropdownMenuItem` simples com texto de ajuda:

```text
{/* Cancelar Boleto */}
{(() => {
  const hasBoleto = !!invoice.boleto_url;
  const canCancelBoleto = hasBoleto && invoice.status !== "paid";
  const boletoHint = !hasBoleto 
    ? "Nenhum boleto gerado" 
    : "Boleto de fatura paga não pode ser cancelado";
  return (
    <DropdownMenuItem
      onClick={() => canCancelBoleto && setCancelBoletoInvoice(invoice)}
      disabled={!canCancelBoleto}
      className={canCancelBoleto ? "text-destructive focus:text-destructive" : ""}
    >
      <Ban className="mr-2 h-4 w-4" />
      <div className="flex flex-col">
        <span>Cancelar Boleto</span>
        {!canCancelBoleto && (
          <span className="text-xs text-muted-foreground">{boletoHint}</span>
        )}
      </div>
    </DropdownMenuItem>
  );
})()}
```

**2. Bloco "Cancelar NFS-e" (linhas 872-899)** - mesma abordagem:

```text
{/* Cancelar NFS-e */}
{(() => {
  const nfseInfo = nfseByInvoice[invoice.id];
  const hasAuthorizedNfse = nfseInfo?.status === "autorizada";
  const nfseHint = nfseInfo 
    ? `NFS-e "${nfseInfo.status}" não pode ser cancelada` 
    : "Sem NFS-e vinculada";
  return (
    <DropdownMenuItem
      onClick={() => hasAuthorizedNfse && setCancelNfseInvoice(invoice)}
      disabled={!hasAuthorizedNfse}
      className={hasAuthorizedNfse ? "text-destructive focus:text-destructive" : ""}
    >
      <XCircle className="mr-2 h-4 w-4" />
      <div className="flex flex-col">
        <span>Cancelar NFS-e</span>
        {!hasAuthorizedNfse && (
          <span className="text-xs text-muted-foreground">{nfseHint}</span>
        )}
      </div>
    </DropdownMenuItem>
  );
})()}
```

## Impacto
- O menu de 3 pontinhos voltara a abrir normalmente para todas as faturas
- As dicas de "por que esta desabilitado" aparecerao como texto inline (abaixo do nome da acao) em vez de tooltip
- Nenhuma funcionalidade sera perdida

## Arquivo a modificar
- `src/components/billing/BillingInvoicesTab.tsx` - remover Tooltip/TooltipProvider de dentro do DropdownMenuContent
