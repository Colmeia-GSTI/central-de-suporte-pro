
# Limpeza do Badge "NFS-e" Redundante na Coluna Situacao

## O que sera removido

O badge generico azul "NFS-e" que aparece ao lado do status de pagamento na coluna "Situacao". Ele apenas indica que existe um registro de NFS-e, sem diferenciar se esta autorizada, processando ou com erro.

## Validacao: Nenhuma informacao sera perdida

| Informacao | Badge "NFS-e" (removido) | Icone FileText na coluna Acoes (mantido) |
|---|---|---|
| NFS-e existe? | Sim (aparece o badge) | Sim (icone muda de cinza para outra cor) |
| NFS-e autorizada? | Nao diferencia | Verde + tooltip "NFS-e autorizada" |
| NFS-e processando? | Nao diferencia | Azul + tooltip "NFS-e: processando" |
| NFS-e com erro? | Nao diferencia | Vermelho + tooltip "NFS-e com erro" |
| Acao ao clicar? | Nenhuma (badge estatico) | Abre PDF, redireciona para erros, ou abre emissao |

**Resultado: zero perda de funcionalidade. O icone de acao ja comunica tudo que o badge comunicava, e mais.**

## Alteracao

### Arquivo: `src/components/billing/BillingInvoicesTab.tsx`

**Desktop (linhas 689-693)** -- Remover o bloco:
```typescript
{nfseInfo && (
  <Badge variant="outline" className="text-xs bg-info/20 text-info border-info/40">
    NFS-e
  </Badge>
)}
```

**Mobile (linhas 528-531)** -- Remover o mesmo bloco no card mobile.

A coluna "Situacao" passara a exibir apenas o badge de status de pagamento (PENDENTE, PAGO, VENCIDO, etc.), ficando mais limpa e sem informacao duplicada.

| Arquivo | Alteracao |
|---|---|
| `src/components/billing/BillingInvoicesTab.tsx` | Remover badge "NFS-e" generico em 2 pontos (desktop linha 689-693, mobile linha 528-531) |
