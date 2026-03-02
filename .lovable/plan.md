

# Adicionar Navegacao para Clientes no Menu Lateral

## Problema

Quando um usuario com perfil `client` ou `client_master` acessa paginas como `/profile`, ele entra no layout principal (`AppLayout` + `AppSidebar`). O menu lateral so exibe itens de staff (Chamados, Clientes, Contratos...) que o cliente nao tem permissao de acessar. O cliente fica "preso" sem conseguir voltar ao seu portal.

## Solucao

Detectar no `AppSidebar` se o usuario logado e um cliente e, nesse caso, exibir um menu simplificado com apenas os itens relevantes:

- **Dashboard** -> `/portal` (leva de volta ao portal do cliente)
- **Perfil** -> `/profile` (configuracoes pessoais)

Os menus de staff (Principal, Operacoes, Financeiro, Equipe, Administracao) ficam ocultos para clientes.

## Alteracoes

### 1. Editar `src/components/layout/AppSidebar.tsx`

- Importar o hook `useAuth` (ja importado) e verificar se o usuario tem apenas roles de cliente (`client`, `client_master`)
- Quando `isClientUser` for true, renderizar um menu simplificado com 2 itens:
  - "Dashboard" com icone `LayoutDashboard` apontando para `/portal`
  - "Perfil" com icone `User` apontando para `/profile`
- Os grupos de menu de staff (Principal, Operacoes, Financeiro, Equipe, Administracao) sao renderizados apenas quando o usuario NAO e cliente
- O footer com avatar e botao de logout permanece igual para todos

### 2. Adicionar link "Meu Perfil" no header do ClientPortalPage

No `src/pages/client-portal/ClientPortalPage.tsx`, adicionar um botao/link para `/profile` no header do portal, ao lado do botao "Sair", para que o cliente possa acessar suas configuracoes pessoais e depois voltar ao portal pelo menu lateral.

## Arquivos modificados

| Arquivo | Acao |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Editar -- adicionar menu simplificado para clientes |
| `src/pages/client-portal/ClientPortalPage.tsx` | Editar -- adicionar link para Perfil no header |

