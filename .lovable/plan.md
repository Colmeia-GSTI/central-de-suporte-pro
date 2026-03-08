

# Correção de Contraste e Visibilidade no Tema Escuro

## Problema Identificado

A captura mostra o dialog "Emitir NFS-e Avulsa" em dark mode com problemas sérios de contraste:

1. **Switch (estado OFF)** — usa `bg-input` que no dark é `hsl(220 12% 18%)`, praticamente invisível contra o fundo `hsl(220 12% 10%)`
2. **Bordas** — `--border` e `--input` são `220 12% 18%` vs card `220 12% 10%` = apenas 8% de diferença de luminosidade (WCAG exige mínimo 3:1 para elementos UI)
3. **Texto `muted-foreground`** — `220 10% 55%` é pálido demais para labels críticos
4. **Botão "Cancelar" (outline)** — borda quase invisível no dark mode

## Correções

### 1. Aumentar contraste das variáveis CSS do dark theme (`src/index.css`)
- `--border`: `220 12% 18%` → `220 12% 24%` (bordas mais visíveis)
- `--input`: `220 12% 18%` → `220 12% 24%` (inputs e switches mais distinguíveis)
- `--muted-foreground`: `220 10% 55%` → `220 10% 62%` (labels mais legíveis)
- `--muted`: `220 12% 14%` → `220 12% 16%` (fundos muted ligeiramente mais claros)

### 2. Melhorar Switch unchecked visibility (`src/components/ui/switch.tsx`)
- Alterar `data-[state=unchecked]:bg-input` para incluir um mínimo de contraste visual adicional

### 3. Melhorar separadores e seções nos dialogs de NFS-e
- `NfseTributacaoSection.tsx`: Adicionar `border-border/60` para melhor separação visual
- `NfseAvulsaDialog.tsx`: Melhorar contraste da seção "Gerar fatura junto"

### Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/index.css` | Ajustar 4 variáveis CSS do dark theme |
| `src/components/ui/switch.tsx` | Melhorar visibilidade do estado unchecked |
| `src/components/billing/nfse/NfseTributacaoSection.tsx` | Melhorar contraste das bordas e seções |
| `src/components/billing/nfse/NfseAvulsaDialog.tsx` | Melhorar contraste da seção de fatura |

