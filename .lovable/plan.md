

# Plano Consolidado: Melhorias no Portal do Cliente

## Visao Geral

Este plano consolida todas as melhorias discutidas para o Portal do Cliente em tres frentes: correcao de politicas de acesso (RLS), vinculo de dispositivos aos chamados, e relatorio gerencial para o cliente.

---

## Fase 1: Correcao das Politicas RLS do Portal

### Problema Atual

As politicas RLS atuais impedem o funcionamento correto do portal:

1. **Tickets (SELECT)**: `client_master` so ve chamados onde ele proprio e o `requester_contact_id`. Deveria ver todos os chamados da empresa (`client_id`).
2. **Comentarios (SELECT)**: Clientes so veem comentarios de tickets onde `tickets.created_by = auth.uid()`. Isso falha quando o ticket foi criado por outro contato da mesma empresa.
3. **Comentarios (INSERT)**: Mesma restricao -- clientes so comentam em tickets que eles mesmos criaram via `created_by`.

### Correcoes

**Tickets -- Policy "Client users can view own tickets":**
- `client` ve tickets onde e o `requester_contact_id`
- `client_master` ve TODOS os tickets da empresa (via `client_owns_record(auth.uid(), client_id)`)

**Ticket Comments -- Policy "Users can view non-internal comments":**
- Alterar para permitir que clientes vejam comentarios nao-internos de tickets onde sao o requester OU sao `client_master` da empresa dona do ticket

**Ticket Comments -- Policy "Users can add comments":**
- Alterar para permitir que clientes adicionem comentarios nao-internos em tickets onde sao o requester OU sao `client_master` da empresa

### SQL das Migrations

```text
-- 1. DROP e recriacao da policy de SELECT de tickets para clientes
DROP POLICY "Client users can view own tickets" ON tickets;
CREATE POLICY "Client users can view own tickets" ON tickets FOR SELECT
USING (
  is_staff(auth.uid())
  OR (
    has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), client_id)
  )
  OR (
    has_role(auth.uid(), 'client') AND EXISTS (
      SELECT 1 FROM client_contacts
      WHERE client_contacts.user_id = auth.uid()
        AND client_contacts.id = tickets.requester_contact_id
    )
  )
);

-- 2. DROP e recriacao da policy de SELECT de comentarios para clientes
DROP POLICY "Users can view non-internal comments" ON ticket_comments;
CREATE POLICY "Users can view non-internal comments" ON ticket_comments FOR SELECT
USING (
  NOT is_internal AND (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN client_contacts cc ON cc.user_id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND (
          cc.id = t.requester_contact_id
          OR (has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), t.client_id))
        )
    )
  )
);

-- 3. DROP e recriacao da policy de INSERT de comentarios para clientes
DROP POLICY "Users can add comments" ON ticket_comments;
CREATE POLICY "Users can add comments" ON ticket_comments FOR INSERT
WITH CHECK (
  NOT is_internal AND (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN client_contacts cc ON cc.user_id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND (
          cc.id = t.requester_contact_id
          OR (has_role(auth.uid(), 'client_master') AND client_owns_record(auth.uid(), t.client_id))
        )
    )
  )
);
```

---

## Fase 2: Vinculo de Dispositivo ao Chamado no Portal

### Problema

O formulario de novo chamado no portal possui apenas titulo, descricao, prioridade e categoria. O cliente nao consegue informar qual dispositivo esta com problema. A tabela `tickets` ja possui as colunas `asset_id` e `asset_description`, mas o portal nao as utiliza.

### Solucao

Adicionar selecao de dispositivo no formulario de novo chamado:

1. Buscar ativos do cliente via `assets` (RLS ja permite SELECT para clientes)
2. Exibir dropdown com lista de dispositivos, agrupados por tipo (icones)
3. Opcao "Outro" com campo de descricao livre
4. Se nao houver ativos, exibir apenas campo de descricao

### Alteracoes no Codigo

**Arquivo: `src/pages/client-portal/ClientPortalPage.tsx`**

1. Adicionar `useQuery` para buscar ativos:
```text
const { data: clientAssets = [] } = useQuery({
  queryKey: ["client-assets", clientData?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("id, name, asset_type, status")
      .eq("client_id", clientData.id)
      .eq("status", "active")
      .order("name");
    if (error) throw error;
    return data;
  },
  enabled: !!clientData?.id,
});
```

2. Adicionar campos no formulario de novo chamado (entre categoria e botoes):
   - Select de dispositivo com icones por tipo (Monitor, Laptop, Server, Printer, etc.)
   - Opcao "Outro dispositivo (especificar)"
   - Campo Textarea condicional para descricao manual

3. Atualizar `createTicketMutation` para incluir `asset_id` ou `asset_description` no payload:
```text
const { error } = await supabase.from("tickets").insert({
  ...ticketData,
  client_id: clientData.id,
  created_by: user?.id,
  requester_contact_id: clientData.contactId,
  origin: "portal",
  asset_id: ticketData.asset_id || null,
  asset_description: ticketData.asset_description || null,
});
```

4. Importar icones de dispositivo: `Monitor, Laptop, Server, Printer, Network, Wifi, Box`

### Banco de Dados

Nenhuma alteracao necessaria -- `tickets.asset_id` e `tickets.asset_description` ja existem.

---

## Fase 3: Relatorio Gerencial para o Cliente

### Objetivo

Criar um relatorio consolidado que o `client_master` acesse pelo portal e que o staff possa gerar na pagina de detalhe do cliente.

### 3.1 RPC no banco: `get_client_management_report`

Funcao que recebe `p_client_id`, `p_start_date`, `p_end_date` e retorna JSON com:

| Secao | Dados |
|-------|-------|
| Chamados | total, abertos, resolvidos, fechados, tempo medio de resolucao, distribuicao por prioridade |
| SLA | total com deadline, atendidos no prazo, percentual |
| Horas | total minutos, faturaveis, nao faturaveis |
| Financeiro | total faturado, pago, pendente, vencido |
| Ativos | contagem por status |
| Tendencia | chamados abertos/resolvidos por mes (ultimos 6 meses) |

Seguranca: `SECURITY DEFINER` com verificacao interna -- staff pode consultar qualquer cliente, clientes so consultam seus proprios dados via `client_owns_record`.

### 3.2 Componente: `ClientManagementReport.tsx`

Novo componente reutilizavel em `src/components/reports/`:

- Cards de resumo: Chamados resolvidos, SLA %, Horas trabalhadas, Valor faturado
- Grafico de tendencia (AreaChart -- recharts ja instalado)
- Grafico de prioridade (PieChart)
- Seletor de periodo (30, 60, 90 dias ou personalizado)
- Botao de exportar CSV usando `ExportButton` existente

### 3.3 Integracao no Portal do Cliente

Em `ClientPortalPage.tsx`, adicionar botao "Relatorios" ao lado de "Chamados" e "Financeiro" (visivel apenas para `client_master`). Ao clicar, renderiza o `ClientManagementReport` passando o `clientId`.

### 3.4 Integracao na Area Interna

Em `ClientDetailPage.tsx`, adicionar nova aba "Relatorio Gerencial" ao `Tabs` existente. Renderiza o mesmo `ClientManagementReport`.

### 3.5 Exportacao

Adicionar config em `src/lib/export.ts` para exportar dados do relatorio gerencial em CSV com colunas: periodo, total chamados, SLA %, horas trabalhadas, valor faturado, valor pago, valor pendente.

---

## Resumo de Arquivos Afetados

| Arquivo | Acao | Fase |
|---------|------|------|
| Nova migration SQL | Corrigir RLS de tickets e comments | 1 |
| Nova migration SQL | Criar RPC `get_client_management_report` | 3 |
| `src/pages/client-portal/ClientPortalPage.tsx` | Corrigir form + adicionar assets + aba relatorios | 2, 3 |
| `src/components/reports/ClientManagementReport.tsx` | Novo componente | 3 |
| `src/pages/clients/ClientDetailPage.tsx` | Adicionar aba relatorio | 3 |
| `src/lib/export.ts` | Adicionar config de exportacao | 3 |

## Ordem de Execucao

1. **Fase 1** primeiro -- sem RLS correto, nada funciona para clientes
2. **Fase 2** em seguida -- melhoria rapida no formulario
3. **Fase 3** por ultimo -- depende das fases anteriores para dados consistentes

