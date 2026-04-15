

## Plano: Implementar Seções 1, 2, 3 e 11 da Documentação Técnica

### Arquitetura

Criar 4 componentes de seção + 1 hook reutilizável para o padrão read/edit/upsert.

### Componentes novos

| Arquivo | Propósito |
|---|---|
| `src/hooks/useDocSection.ts` | Hook genérico para fetch + upsert de registros doc_ (1 por cliente) |
| `src/components/clients/documentation/DocSectionClientInfo.tsx` | Seção 1 — dados da tabela `clients` |
| `src/components/clients/documentation/DocSectionInfrastructure.tsx` | Seção 2 — `doc_infrastructure` |
| `src/components/clients/documentation/DocSectionTelephony.tsx` | Seção 3 — `doc_telephony` (só telefonia) |
| `src/components/clients/documentation/DocSectionSupportHours.tsx` | Seção 11 — `doc_support_hours` |

### Hook `useDocSection`

- Recebe `tableName`, `clientId`, `selectColumns`
- Query com `.eq('client_id', clientId).maybeSingle()`
- Função `upsert` que faz insert ou update baseado na existência do registro
- Retorna `{ data, isLoading, save, isSaving }`
- Seção 1 usará variante especial (update direto na `clients` pelo `id`)

### Padrão visual de cada seção

- Estado `isEditing` local (useState)
- **Modo leitura**: Grid de labels (text-muted-foreground text-xs) + valores (text-sm font-medium), campos vazios mostram "—". Botão "Editar" (ícone Pencil) no canto superior direito.
- **Modo edição**: Mesmos campos como `Input`/`Select`/`Textarea`/`Switch`. Botões "Salvar" e "Cancelar" no rodapé.
- Campos condicionais com `transition-all` para aparecer/sumir suavemente.
- Subseções com `Separator` + título discreto (text-xs uppercase tracking-wider text-muted-foreground).

### Seção 1 — Dados gerais do cliente

- Lê da query existente `["client", id]` (já carregada no `ClientDetailPage`)
- Passa o `client` como prop do `ClientDetailPage` para `ClientDocumentation` e depois para o componente
- Campos: name, trade_name, document (máscara CNPJ), address, phone, whatsapp, email, notes
- Upsert = `supabase.from('clients').update({...}).eq('id', clientId)`
- Após salvar, `invalidateQueries(['client', clientId])`

### Seção 2 — Infraestrutura

- Tabela: `doc_infrastructure`
- 3 subseções visuais: "Geral", "Rede — Console UniFi", "Rede — Gateway / Firewall"
- Campo `cloud_provider` visível apenas se `server_type` in ['VPS', 'Nuvem', 'Híbrido']
- Campo `ad_location` visível apenas se `active_directory` = 'Sim'
- Notas informativas em badges discretos nas subseções UniFi e Gateway

### Seção 3 — Telefonia

- Tabela: `doc_telephony`
- Campos: type (select), provider, extensions_count, support_phone, notes
- Links de internet ficam como placeholder "[Tabela de links em construção]"

### Seção 11 — Horários de suporte

- Tabela: `doc_support_hours`
- Campo `oncall_phone` visível apenas se `has_oncall` = true
- Switch para `has_oncall`

### Alteração em `ClientDocumentation.tsx`

- Importar os 4 componentes
- No render do accordion, para seções 1/2/3/11 renderizar o componente específico em vez do placeholder
- Seções restantes mantêm o placeholder atual
- Passar `clientId` para cada componente

### Alteração em `ClientDetailPage.tsx`

- Passar `client` como prop para `ClientDocumentation` (para seção 1 reutilizar os dados já carregados)

### Banco de dados

Nenhuma migração necessária — todas as tabelas e colunas já existem.

### Arquivos modificados/criados

| Arquivo | Ação |
|---|---|
| `src/hooks/useDocSection.ts` | Criar |
| `src/components/clients/documentation/DocSectionClientInfo.tsx` | Criar |
| `src/components/clients/documentation/DocSectionInfrastructure.tsx` | Criar |
| `src/components/clients/documentation/DocSectionTelephony.tsx` | Criar |
| `src/components/clients/documentation/DocSectionSupportHours.tsx` | Criar |
| `src/components/clients/ClientDocumentation.tsx` | Editar — integrar componentes |
| `src/pages/clients/ClientDetailPage.tsx` | Editar — passar `client` como prop |

