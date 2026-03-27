

## Problema: Chamados recentes não são clicáveis

O componente `RecentTicketsList.tsx` renderiza cada chamado com `cursor-pointer` (aparenta ser clicável), mas **não possui nenhum `onClick`** nem `<Link>` — o clique não faz nada.

## Correção

### Arquivo: `src/components/dashboard/RecentTicketsList.tsx`

Envolver cada card de chamado com navegação para a página de chamados com o painel de detalhes aberto:

- Usar `useNavigate` do `react-router-dom`
- Adicionar `onClick={() => navigate(`/tickets?open=${ticket.id}`)}` em cada `motion.div`
- Isso segue o padrão de deep-linking já existente no sistema (`/tickets?open={id}`)

Mudança mínima: importar `useNavigate`, adicionar o hook no componente, e adicionar o `onClick` no card.

