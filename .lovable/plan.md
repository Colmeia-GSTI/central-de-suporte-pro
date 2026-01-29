
# Plano: Subcategorias e Tags para Tickets

## Visão Geral

Implementar um sistema hierárquico de classificação para tickets com **duas abordagens complementares**:

1. **Subcategorias**: Classificação estruturada vinculada à categoria principal (hierárquica)
2. **Tags**: Classificação livre e flexível para marcação adicional (não-hierárquica)

---

## Por que Duas Abordagens?

| Aspecto | Subcategorias | Tags |
|---------|--------------|------|
| **Estrutura** | Hierárquica (pertence a uma categoria) | Livre (independente) |
| **Controle** | Administrador define | Usuários podem criar |
| **Uso** | Classificação obrigatória | Marcação opcional |
| **Exemplo** | Infraestrutura → Servidor Virtual | #urgente, #cliente-vip, #recorrente |

---

## Exemplos Práticos para MSP de TI

### Subcategorias por Categoria

| Categoria | Subcategorias |
|-----------|---------------|
| **Infraestrutura** | Servidor Físico, Servidor Virtual, Storage, Switch/Roteador, Firewall, Virtualização |
| **Segurança** | Antivírus, Acesso Indevido, Phishing, Vazamento de Dados, Auditoria |
| **E-mail e Colaboração** | Outlook/365, Gmail/Workspace, Teams, Zoom, Calendário |
| **Backup e Recuperação** | Falha de Backup, Restore Parcial, Restore Completo, Teste DR |
| **Conectividade** | Internet, VPN, Wi-Fi, Link Dedicado, DNS/DHCP |
| **Suporte ao Usuário** | Reset de Senha, Configuração, Dúvida, Treinamento |
| **Hardware** | Notebook, Desktop, Monitor, Periférico, Celular/Tablet |
| **Impressão** | Impressora Local, Impressora Rede, Scanner, Toner/Papel |

### Tags Sugeridas

| Tipo | Tags |
|------|------|
| **Urgência** | #urgente, #recorrente, #incidente-crítico |
| **Cliente** | #cliente-vip, #contrato-sla-plus, #prospect |
| **Técnico** | #escalar, #documentar, #aguardando-peça |
| **Financeiro** | #cobrável, #garantia, #fora-escopo |

---

## Estrutura do Banco de Dados

### Nova Tabela: `ticket_subcategories`

```text
ticket_subcategories
├── id (UUID, PK)
├── category_id (UUID, FK → ticket_categories) *obrigatório*
├── name (TEXT) - Ex: "Servidor Virtual"
├── description (TEXT, nullable)
├── sla_hours_override (INTEGER, nullable) - SLA específico opcional
├── is_active (BOOLEAN, default true)
├── created_at (TIMESTAMPTZ)
```

### Nova Tabela: `ticket_tags`

```text
ticket_tags
├── id (UUID, PK)
├── name (TEXT, UNIQUE) - Ex: "urgente"
├── color (TEXT, nullable) - Cor hexadecimal para exibição
├── is_system (BOOLEAN, default false) - Tags do sistema não podem ser excluídas
├── created_at (TIMESTAMPTZ)
```

### Tabela de Vínculo: `ticket_tag_assignments`

```text
ticket_tag_assignments
├── id (UUID, PK)
├── ticket_id (UUID, FK → tickets)
├── tag_id (UUID, FK → ticket_tags)
├── created_at (TIMESTAMPTZ)
├── UNIQUE (ticket_id, tag_id)
```

### Alteração na Tabela `tickets`

```text
tickets
├── ... campos existentes ...
├── subcategory_id (UUID, FK → ticket_subcategories, nullable) *NOVO*
```

---

## Fluxo de Implementação

### Fase 1: Banco de Dados
1. Criar tabela `ticket_subcategories` com FK para `ticket_categories`
2. Criar tabela `ticket_tags` para tags globais
3. Criar tabela `ticket_tag_assignments` para vínculo N:N
4. Adicionar coluna `subcategory_id` na tabela `tickets`
5. Criar políticas RLS para todas as novas tabelas
6. Inserir subcategorias padrão para as categorias existentes

### Fase 2: Interface de Configurações
1. Expandir `CategoriesTab.tsx` para mostrar subcategorias vinculadas
2. Criar seção de gerenciamento de subcategorias (CRUD)
3. Criar nova aba "Tags" para gerenciar tags globais
4. Adicionar seletor de cor para tags

### Fase 3: Formulário de Tickets
1. Atualizar `TicketForm.tsx`:
   - Ao selecionar categoria, carregar subcategorias disponíveis
   - Adicionar campo de seleção de subcategoria (opcional)
   - Adicionar campo multi-select para tags
2. Atualizar `TicketDetailsTab.tsx` com mesmos campos

### Fase 4: Listagem e Filtros
1. Atualizar `TicketsPage.tsx`:
   - Mostrar subcategoria na tabela (ao lado da categoria)
   - Mostrar tags como badges coloridos
   - Adicionar filtro por subcategoria
   - Adicionar filtro por tag

### Fase 5: Relatórios
1. Adicionar agrupamento por subcategoria nos relatórios
2. Adicionar filtro por tags nos relatórios de tempo

---

## Interface de Usuário

### Na Aba de Categorias (Configurações)

```text
┌─────────────────────────────────────────────────────────┐
│ Categorias de Tickets                    [Nova Categoria]│
├─────────────────────────────────────────────────────────┤
│ ▼ Infraestrutura (8h SLA)                     [Editar] │
│   ├── Servidor Físico (8h)                             │
│   ├── Servidor Virtual (4h)                            │
│   ├── Storage (4h)                                     │
│   └── [+ Nova Subcategoria]                            │
│                                                         │
│ ▼ Segurança (4h SLA)                          [Editar] │
│   ├── Antivírus (4h)                                   │
│   ├── Acesso Indevido (2h)                             │
│   └── [+ Nova Subcategoria]                            │
└─────────────────────────────────────────────────────────┘
```

### Nova Aba de Tags

```text
┌─────────────────────────────────────────────────────────┐
│ Tags de Tickets                              [Nova Tag] │
├─────────────────────────────────────────────────────────┤
│ ● urgente          🔴 Vermelho          [Editar] [X]   │
│ ● cliente-vip      🟡 Amarelo           [Editar] [X]   │
│ ● recorrente       🔵 Azul              [Editar] [X]   │
│ ● cobrável         🟢 Verde             [Editar] [X]   │
│ ● documentar       ⚪ Cinza             [Editar] [X]   │
└─────────────────────────────────────────────────────────┘
```

### No Formulário de Ticket

```text
┌─────────────────────────────────────────────────────────┐
│ Categoria            │ Subcategoria                     │
│ [Infraestrutura ▼]   │ [Servidor Virtual ▼]             │
├─────────────────────────────────────────────────────────┤
│ Tags                                                    │
│ [urgente ×] [cliente-vip ×] [+ Adicionar tag]          │
└─────────────────────────────────────────────────────────┘
```

### Na Listagem de Tickets

```text
┌────┬──────────────┬──────────────────────┬────────────┐
│ #  │ Título       │ Categoria            │ Tags       │
├────┼──────────────┼──────────────────────┼────────────┤
│ 42 │ Erro no ERP  │ Infraestrutura       │ 🔴urgente  │
│    │              │ → Servidor Virtual   │ 🟡vip      │
├────┼──────────────┼──────────────────────┼────────────┤
│ 41 │ Lentidão VPN │ Conectividade → VPN  │ 🔵recorr.  │
└────┴──────────────┴──────────────────────┴────────────┘
```

---

## Arquivos a Criar/Modificar

### Novos Arquivos
| Arquivo | Descrição |
|---------|-----------|
| `src/components/settings/SubcategoriesSection.tsx` | Gerenciamento de subcategorias dentro de CategoriesTab |
| `src/components/settings/TagsTab.tsx` | Nova aba de gerenciamento de tags |
| `src/components/tickets/TagsInput.tsx` | Componente multi-select de tags para formulário |
| `src/components/tickets/TagBadge.tsx` | Badge colorido para exibir tag |

### Arquivos a Modificar
| Arquivo | Alteração |
|---------|-----------|
| `src/components/settings/CategoriesTab.tsx` | Adicionar expansão para subcategorias |
| `src/pages/settings/SettingsPage.tsx` | Adicionar aba "Tags" |
| `src/components/tickets/TicketForm.tsx` | Adicionar campos subcategoria e tags |
| `src/components/tickets/TicketDetailsTab.tsx` | Adicionar exibição/edição de subcategoria e tags |
| `src/pages/tickets/TicketsPage.tsx` | Adicionar colunas e filtros |
| `src/pages/client-portal/ClientPortalPage.tsx` | Exibir subcategoria/tags para clientes |

---

## Dados Iniciais (Subcategorias Padrão)

### Para Categoria "Infraestrutura"
- Servidor Físico, Servidor Virtual, Storage, Switch/Roteador, Firewall, Hypervisor

### Para Categoria "Segurança"
- Antivírus/EDR, Firewall/UTM, Acesso Indevido, Phishing/Spam, Certificados SSL

### Para Categoria "Backup e Recuperação"
- Falha de Backup, Restore Parcial, Restore Completo, Teste DR, Retenção

### Para Categoria "Conectividade"
- Internet, VPN, Wi-Fi, Link Dedicado, DNS/DHCP

### Tags Padrão do Sistema
- urgente (vermelho), recorrente (azul), cliente-vip (amarelo), cobrável (verde), fora-escopo (laranja), documentar (cinza)

---

## Resumo do Impacto

| Aspecto | Benefício |
|---------|-----------|
| **Classificação precisa** | Saber exatamente o tipo de problema |
| **Relatórios detalhados** | Análise por subcategoria |
| **SLA granular** | SLA diferente por subcategoria |
| **Flexibilidade** | Tags para marcações ad-hoc |
| **Rastreabilidade** | Identificar padrões (recorrência, clientes VIP) |
| **Cobrança** | Marcar tickets cobráveis ou fora do escopo |
