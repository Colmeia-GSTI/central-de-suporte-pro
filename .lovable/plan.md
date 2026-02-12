

# Compactar Perfil na Sidebar: Avatar + Nome + Sair em uma unica linha

## Objetivo
Reduzir drasticamente o espaco do perfil no rodape da sidebar, colocando avatar, nome e botao "Sair" todos na mesma linha.

## Layout Proposto

```text
[ Avatar(6) ]  Nome do Usuario  [ Sair icon ]
               Badge Role
```

Tudo em uma unica area compacta, sem o bloco separado do botao "Sair".

## Alteracoes em `src/components/layout/AppSidebar.tsx`

### SidebarFooter (linhas 325-383):
- Reduzir padding do footer para `p-2`
- Remover `mb-2` do link do perfil (nao precisa mais de margem pois o botao Sair sera inline)
- Reduzir avatar para `h-6 w-6` e remover o efeito de glow completamente
- Mover o botao "Sair" (icone LogOut) para dentro da mesma linha do perfil, alinhado a direita
- Remover o bloco `SidebarMenu` separado do botao Sair
- O icone LogOut fica como um botao pequeno no canto direito da linha do perfil
- Manter o link para `/profile` no avatar e nome
- O badge de role fica abaixo do nome em tamanho menor

### Resultado esperado:
O footer passa de ~3 linhas visuais (perfil + espaco + botao sair) para ~1.5 linhas (avatar + nome/badge + icone sair), economizando cerca de 50% do espaco vertical.

