

# Reestruturar Portal do Cliente

## Problema

O portal do cliente exibe dados internos da operacao (aba Relatorios com SLA, horas trabalhadas, tendencias) que nao agregam valor ao cliente. Alem disso, o botao "Novo Chamado" esta escondido dentro da lista de chamados, dificultando o acesso rapido.

## Alteracoes

### 1. Remover aba "Relatorios"

**Arquivo**: `src/pages/client-portal/ClientPortalPage.tsx`

- Remover import de `ClientManagementReport` e icone `TrendingUp`
- Remover botao "Relatorios" da navegacao de secoes (linhas 394-401)
- Remover bloco condicional que renderiza `ClientManagementReport` (linhas 411-413)
- Tipo do `activeSection` passa a ser apenas `"chamados" | "financeiro"`

### 2. Adicionar botao de destaque "Abrir Chamado" no topo

Adicionar um botao primario grande e visivel logo apos o header (antes dos cards de estatisticas), para que o cliente veja imediatamente ao entrar no portal. O botao abrira o mesmo dialog de criacao de chamado que ja existe.

Posicionamento: entre a navegacao de secoes e os cards de estatisticas, dentro da secao `chamados`. Sera um banner/card de destaque com icone e texto claro:

```text
+------------------------------------------------------+
|  [+]  Precisa de ajuda? Abra um novo chamado agora   |
+------------------------------------------------------+
```

Implementacao:
- Um `Card` com fundo primario (ou outline com destaque) contendo um botao grande que aciona `setIsNewTicketOpen(true)`
- Visivel para todos os clientes (client e client_master)
- O botao existente "Novo Chamado" dentro da lista de chamados permanece como acesso secundario

### 3. Resumo de impacto

| Item | Antes | Depois |
|---|---|---|
| Aba Relatorios | Visivel para client_master | Removida |
| Metricas internas (SLA, horas, tendencia) | Expostas ao cliente | Ocultas |
| Botao "Abrir Chamado" no topo | Nao existia | CTA de destaque visivel ao entrar |
| Aba Financeiro | Visivel para client_master | Sem mudanca |
| Cards de estatisticas | 4 cards | Sem mudanca |
| Lista de chamados + botao secundario | Funcional | Sem mudanca |

### 4. Arquivo modificado

| Arquivo | Acao |
|---|---|
| `src/pages/client-portal/ClientPortalPage.tsx` | Editar -- remover aba Relatorios, adicionar CTA de abertura de chamado no topo |

