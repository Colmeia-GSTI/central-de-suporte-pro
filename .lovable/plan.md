

## Plano: Implementar Seções CRUD com Tabela Expansível e Drawer

### Escopo

Implementar 11 seções de tabela com CRUD completo na aba Documentação: Seções 3 (links), 4, 5, 6, 8, 9, 10, 11 (contatos), 13, 14. Seção 7 (Licenças) não foi mencionada no pedido — manter placeholder.

### Arquitetura

**1. Hook genérico `useDocTableCrud`** — Reutilizável para todas as seções de tabela.
- Recebe `tableName`, `clientId`, filtro opcional (ex: `device_type IN (...)`)
- Retorna `{ items, isLoading, create, update, remove, count }`
- Usa React Query com invalidação automática
- Mutation com toast de sucesso/erro

**2. Componente reutilizável `DocTableSection`** — Container visual padrão.
- Recebe: `title`, `items`, `columns`, `renderRow`, `renderExpandedRow`, `drawerContent`, etc.
- Tabela com linhas clicáveis que expandem inline (Collapsible)
- Botões Editar/Excluir na linha expandida
- Botão "+ Adicionar" abaixo da tabela
- Sheet lateral (direita) para formulário de criação/edição
- ConfirmDialog para exclusão
- Empty state quando sem registros

**3. Hook `useDocCredentialOptions`** — Para campos "referência → seção 10".
- Busca credenciais do cliente e retorna como opções de select: `[Tipo] — [Sistema]`

### Componentes por seção

| # | Componente | Tabela | Filtro |
|---|---|---|---|
| 3 | `DocTableInternetLinks` | doc_internet_links | — |
| 4 | `DocTableWorkstations` | doc_devices | device_type IN (workstation, server, notebook) |
| 5 | `DocTableNetworkDevices` | doc_devices | device_type IN (switch, access_point, printer, tv, clock, facial, nas, other) |
| 6 | `DocTableCftv` | doc_cftv | — |
| 8 | `DocTableSoftwareErp` | doc_software_erp | — |
| 9 | `DocTableDomains` | doc_domains | — |
| 10 | `DocTableCredentials` | doc_credentials | — |
| 11 | `DocTableContacts` | doc_contacts | — |
| 13 | `DocTableExternalProviders` | doc_external_providers | — |
| 14 | `DocTableRoutines` | doc_routines | — |

Todos ficam em `src/components/clients/documentation/`.

### Detalhes de implementação por seção

**Seção 3 — Links de Internet**: Colunas: Tipo, Provedor, Plano, IP, Vencimento. Badge de dias restantes no vencimento. Drawer com select de tipo, campos de IP, date picker para vencimento.

**Seção 4 — Estações/Servidores**: Status com badge colorido (online=verde, offline=vermelho, overdue=amarelo, unknown=cinza). Drawer com 2 abas (Tabs): "Geral" e "Detalhes". Campo `last_seen` readonly quando `data_source !== 'manual'`.

**Seção 5 — Dispositivos de rede**: Campos condicionais por `device_type`. Drawer mostra/oculta campos extras conforme tipo selecionado (Switch: portas/VLANs, AP: SSIDs/clientes, Impressora: conexão/toner, TV: uso/SO, Relógio: software/leitura, Facial: acesso/RH, NAS: RAID/capacidade).

**Seção 6 — CFTV**: Campos condicionais NVR vs Câmera. Para câmeras, select de NVR vinculado busca doc_cftv WHERE device_type='nvr' AND client_id. Credencial como referência → seção 10.

**Seção 8 — Softwares**: Toggle `support_contract` controla visibilidade de `support_expiry`. Credencial como referência.

**Seção 9 — Domínios**: Badge de vencimento: <30 dias → vermelho, <60 dias → amarelo. Credenciais de registrador e DNS como referências.

**Seção 10 — Credenciais**: Senha exibida como `••••••••` com botão copiar (clipboard API). Password input com toggle mostrar/ocultar no drawer. Campos MFA condicionais.

**Seção 11 — Contatos**: Toggle `is_emergency` para emergência. Integrar abaixo dos campos fixos já implementados.

**Seção 13 — Prestadores**: Credencial como referência. Date picker para vencimento contrato.

**Seção 14 — Rotinas**: Campo `procedure` como textarea grande. Date picker para última execução.

### Utilidades compartilhadas

**Função `daysUntil(date)`**: Retorna texto formatado ("em 45 dias", "vencido há 3 dias", "hoje") + cor para badges de vencimento.

### Contadores dinâmicos

Atualizar `ClientDocumentation.tsx` para buscar contadores reais via queries paralelas (head count) e passar para o array de seções. Usar `useQuery` com `select: 'id'` + `.eq('client_id')` para cada tabela, retornando `.length`.

### Integração

- Atualizar `DocSectionTelephony` para substituir placeholder de links pelo `DocTableInternetLinks`
- Atualizar `DocSectionSupportHours` para substituir placeholder de contatos pelo `DocTableContacts`
- Atualizar `ClientDocumentation.tsx`: mapear seções 4–10, 13, 14 para os novos componentes
- Atualizar `useDocSection.ts`: não precisa mudar (usado apenas para campos fixos)

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/hooks/useDocTableCrud.ts` | Criar — hook genérico CRUD para tabelas doc_ |
| `src/hooks/useDocCredentialOptions.ts` | Criar — opções de credenciais para selects |
| `src/lib/doc-utils.ts` | Criar — utilitários (daysUntil, etc.) |
| `src/components/clients/documentation/DocTableInternetLinks.tsx` | Criar |
| `src/components/clients/documentation/DocTableWorkstations.tsx` | Criar |
| `src/components/clients/documentation/DocTableNetworkDevices.tsx` | Criar |
| `src/components/clients/documentation/DocTableCftv.tsx` | Criar |
| `src/components/clients/documentation/DocTableSoftwareErp.tsx` | Criar |
| `src/components/clients/documentation/DocTableDomains.tsx` | Criar |
| `src/components/clients/documentation/DocTableCredentials.tsx` | Criar |
| `src/components/clients/documentation/DocTableContacts.tsx` | Criar |
| `src/components/clients/documentation/DocTableExternalProviders.tsx` | Criar |
| `src/components/clients/documentation/DocTableRoutines.tsx` | Criar |
| `src/components/clients/documentation/DocSectionTelephony.tsx` | Editar — integrar links |
| `src/components/clients/documentation/DocSectionSupportHours.tsx` | Editar — integrar contatos |
| `src/components/clients/ClientDocumentation.tsx` | Editar — contadores dinâmicos + integrar seções |

### Observações

- Seção 7 (Licenças) e Seção 12 (Segurança) ficam com placeholder — não incluídas no pedido
- Sem integrações TRMM/UniFi — apenas CRUD manual
- Sheet lateral usa `sm:max-w-lg` para formulários mais largos

