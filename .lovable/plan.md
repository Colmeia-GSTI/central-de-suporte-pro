

# Melhorar Detecao e Tratamento de Erros em NFS-e e Faturas

## Contexto

O sistema ja possui mecanismos de edicao, reenvio e validacao de NFS-e no `NfseDetailsSheet` e `NfseActionsMenu`. Porem, na listagem principal (`BillingNfseTab`), as notas com erro nao exibem o motivo do erro nem oferecem acoes rapidas -- o usuario precisa clicar na nota para descobrir o que aconteceu. Alem disso, os indicadores de boleto e NFS-e na aba de faturas (`BillingInvoicesTab`) estao mostrando status incorretos (boleto "pendente" quando ja existe barcode, e NFS-e "erro" quando ja existe uma autorizada).

## Mudancas

### 1. Linha expandida com erro na tabela de NFS-e

**Arquivo:** `src/components/billing/BillingNfseTab.tsx`

Quando uma nota tem status `erro` ou `rejeitada`, exibir imediatamente abaixo da linha um alerta compacto com:

- Mensagem de erro formatada (usando `parseNfseError` de `nfseFormat.ts`)
- Acao sugerida (ex: "Verifique os dados do prestador")
- Dois botoes inline: **Editar e Corrigir** (abre o sheet com edicao) e **Reprocessar** (reenvia direto)
- Para erros E0014, mostrar o botao **Vincular Nota** em vez de Reprocessar

Isso sera implementado como uma segunda `TableRow` condicional logo apos cada linha com erro:

```text
{(n.status === "erro" || n.status === "rejeitada") && n.mensagem_retorno && (
  <TableRow className="bg-destructive/5 hover:bg-destructive/10">
    <TableCell colSpan={8} className="py-2 px-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{parsed.title}</p>
          <p className="text-xs text-muted-foreground truncate">{parsed.description}</p>
          {parsed.action && <p className="text-xs text-muted-foreground mt-0.5">{parsed.action}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => { setSelected(n); setDetailsOpen(true); }}>
            Editar e Corrigir
          </Button>
          <Button size="sm" onClick={() => handleQuickReprocess(n)}>
            Reprocessar
          </Button>
        </div>
      </div>
    </TableCell>
  </TableRow>
)}
```

### 2. Funcao de reprocessamento rapido

**Arquivo:** `src/components/billing/BillingNfseTab.tsx`

Adicionar uma funcao `handleQuickReprocess` que chama `asaas-nfse` com `action: "emit"` diretamente, sem precisar abrir o sheet. Inclui:

- Atualizar o status local para "processando" antes de chamar a API
- Chamar a edge function com os dados da nota
- Mostrar toast de sucesso/erro
- Invalidar queries para atualizar a listagem

### 3. Corrigir indicador de Boleto na listagem de faturas

**Arquivo:** `src/components/billing/InvoiceInlineActions.tsx`

Alterar a logica de cor do boleto (linhas 66-70) para considerar `boleto_barcode`:

| Campo na interface | Antes | Depois |
|--------------------|-------|--------|
| Props | Nao inclui `boleto_barcode` | Inclui `boleto_barcode?: string \| null` |
| Logica de cor | Verifica apenas `boleto_url` | Verifica `boleto_url \|\| boleto_barcode` |
| Tooltip | "Boleto pendente" se nao tem URL | "Boleto gerado" se tem barcode ou URL |

### 4. Corrigir priorizacao de NFS-e na listagem de faturas

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

Alterar o `reduce` do `nfseByInvoice` (linhas 144-147) para priorizar "autorizada" sobre "erro":

```text
const statusPriority: Record<string, number> = {
  autorizada: 0, processando: 1, pendente: 2, erro: 3, rejeitada: 4, cancelada: 5,
};
return (data || []).reduce<NfseByInvoice>((acc, n) => {
  if (!n.invoice_id) return acc;
  const existing = acc[n.invoice_id];
  const existingPriority = existing ? (statusPriority[existing.status] ?? 99) : 99;
  const newPriority = statusPriority[n.status] ?? 99;
  if (newPriority < existingPriority) {
    acc[n.invoice_id] = { status: n.status, numero_nfse: n.numero_nfse };
  }
  return acc;
}, {});
```

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/billing/BillingNfseTab.tsx` | Linha expandida com erro + funcao de reprocessamento rapido |
| `src/components/billing/InvoiceInlineActions.tsx` | Considerar `boleto_barcode` no indicador de boleto |
| `src/components/billing/BillingInvoicesTab.tsx` | Priorizar NFS-e autorizada sobre erro no reduce |

## Resultado

- Notas com erro mostram o motivo diretamente na listagem, sem precisar abrir detalhes
- O usuario pode reprocessar ou editar com 1 clique a partir da tabela
- Erros E0014 (DPS duplicada) oferecem a opcao de vincular nota existente
- Indicadores de boleto e NFS-e mostram o status correto na aba de faturas
- Design responsivo com suporte a dark mode (usando classes Tailwind existentes)
- Nenhuma mudanca no banco de dados

