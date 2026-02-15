
# Pagina de Faturamento - Experiencia Mobile Imersiva (App-Like)

## Problemas Atuais no Mobile

- Header "Faturamento" ocupa espaco desnecessario com titulo grande e subtitulo
- Tabs aparecem como icones pequenos sem labels, dificeis de identificar (grid-cols-8 comprimido)
- Tabela desktop (colunas CLIENTE, FATURAMENTO, VENCIMENTO, etc.) nao funciona bem em telas pequenas -- texto truncado e scroll horizontal
- Summary chips (A Receber, Vencido, Recebido) cortados horizontalmente
- Padding de 24px (p-6) no conteudo principal desperdi espaco no mobile
- Barra de acoes em lote no rodape compete com o FAB

## Solucao: Layout App-Like para Mobile

### 1. Header Compacto no Mobile

**Arquivo: `src/pages/billing/BillingPage.tsx`**

- Reduzir titulo de `text-3xl` para `text-xl` no mobile (`text-xl md:text-3xl`)
- Esconder subtitulo no mobile (`hidden md:block`)
- Reduzir espacamento geral de `space-y-6` para `space-y-3 md:space-y-6`

### 2. Tabs como Scroll Horizontal (App-Like)

**Arquivo: `src/pages/billing/BillingPage.tsx`**

Substituir o `grid grid-cols-8` por um scroll horizontal no mobile:

```text
<TabsList className="flex w-full overflow-x-auto no-scrollbar md:inline-grid md:grid-cols-8 md:w-auto">
```

Cada tab mostra icone + label compacto no mobile, com scroll natural como em apps nativos. Adicionar classe CSS `no-scrollbar` para esconder a barra de scroll.

### 3. Cards de Fatura no Mobile (substituir tabela)

**Arquivo: `src/components/billing/BillingInvoicesTab.tsx`**

A mudanca principal: no mobile, substituir a tabela por cards empilhados. Usar `useIsMobile()` para alternar:

- **Desktop**: manter tabela atual sem mudancas
- **Mobile**: renderizar cada fatura como um card compacto com:
  - Linha 1: Nome do cliente (bold) + Badge de status
  - Linha 2: Numero da fatura + Valor (alinhado a direita, destaque)
  - Linha 3: Datas (emissao e vencimento) + icones de acao inline
  - Swipe-friendly, sem scroll horizontal

Exemplo de estrutura do card mobile:

```text
<div className="rounded-lg border p-3 space-y-2">
  <div className="flex items-center justify-between">
    <span className="font-medium text-sm truncate">{clientName}</span>
    <Badge>{status}</Badge>
  </div>
  <div className="flex items-center justify-between">
    <span className="text-xs text-muted-foreground">#{invoiceNumber}</span>
    <span className="text-sm font-semibold">{amount}</span>
  </div>
  <div className="flex items-center justify-between">
    <span className="text-xs text-muted-foreground">Venc: {dueDate}</span>
    <InvoiceInlineActions ... />
  </div>
</div>
```

### 4. Summary Chips Responsivos

**Arquivo: `src/components/billing/BillingInvoicesTab.tsx`**

- Chips financeiros em `grid grid-cols-3` no mobile (ocupam largura total) em vez de `flex flex-wrap`
- Texto mais compacto no mobile

### 5. Padding Reduzido no Mobile

**Arquivo: `src/components/layout/AppLayout.tsx`**

- Alterar padding do conteudo de `p-6` para `p-3 md:p-6`

### 6. CSS para Scroll sem Barra

**Arquivo: `src/index.css`**

Adicionar utilitario:

```text
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/billing/BillingPage.tsx` | Header compacto + tabs scroll horizontal no mobile |
| `src/components/billing/BillingInvoicesTab.tsx` | Cards mobile para faturas + summary chips responsivos |
| `src/components/layout/AppLayout.tsx` | Padding reduzido no mobile (p-3 md:p-6) |
| `src/index.css` | Classe utilitaria no-scrollbar |

## Resultado

- Tabs navegaveis por scroll horizontal (como apps de banco)
- Faturas em cards empilhados no mobile (sem tabela)
- Espacamento otimizado para telas pequenas
- Sem mudancas visuais no desktop -- todas as alteracoes sao condicionais via breakpoints ou hook `useIsMobile()`
- Suporte a dark mode mantido (usa classes existentes do design system)
