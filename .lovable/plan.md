

# Remover QuickActionsFAB

## Mudanças

### 1. Deletar o arquivo do componente
- `src/components/layout/QuickActionsFAB.tsx` — remover completamente

### 2. Limpar referências em `src/components/layout/AppLayout.tsx`
- Remover o import de `QuickActionsFAB`
- Remover a linha que renderiza o componente (`{!location.pathname.startsWith("/settings") && <QuickActionsFAB />}`)

Nenhuma outra funcionalidade depende deste componente. Ele é usado exclusivamente no `AppLayout`.

