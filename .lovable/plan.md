

## Plano: Migrar sync TRMM para client_external_mappings

### 1. Edge Function `sync-doc-devices/index.ts`

Substituir linhas 46-85 (busca por `trmm_client_name` + filtro por nome) por:
- Busca em `client_external_mappings` com `client_id` + `external_source = 'tactical_rmm'`
- Filtro primário por `external_id` numérico (`a.client_id` ou `a.client?.id`)
- Fallback por `external_name` caso ID não bata
- Mensagem de erro atualizada: "Cliente não mapeado no Tactical RMM. Configure em Operações → Mapeamentos."

### 2. Hook `useDocSync.ts`

Substituir a query `trmmConfigured` (linhas 51-68): trocar busca de `clients.trmm_client_name` por busca em `client_external_mappings` com `external_source = 'tactical_rmm'` + verificação de `integration_settings` ativa.

### 3. `DocSyncStatusBar.tsx`

- Texto "Não configurado" do TRMM → "Não mapeado — Configure em Operações → Mapeamentos"
- Tornar clicável com `useNavigate` para `/settings?tab=mappings`

### 4. `DocSectionClientInfo.tsx`

Remover do formulário e da visualização:
- Campo `trmm_client_name` do state `form`
- Input "Nome do cliente no TRMM" do modo edição
- Field "Nome do cliente no TRMM" do modo leitura
- Referências em `startEditing`

**Não** remover a coluna do banco.

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/sync-doc-devices/index.ts` | Editar trecho TRMM (linhas 46-85) |
| `src/hooks/useDocSync.ts` | Editar query `trmmConfigured` |
| `src/components/clients/documentation/DocSyncStatusBar.tsx` | Editar texto + link |
| `src/components/clients/documentation/DocSectionClientInfo.tsx` | Remover campo TRMM |

