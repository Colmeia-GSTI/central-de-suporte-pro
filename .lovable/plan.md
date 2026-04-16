

## Plano: Sincronização Bidirecional assets ↔ doc_devices

### Visão Geral

Adicionar campo `doc_device_id` em `assets` para vincular registros entre tabelas. Após salvar/editar ativos manuais, o técnico é convidado a vincular ou promover dados para `doc_devices` — sempre com confirmação explícita.

### Passo 1 — Migração

```sql
ALTER TABLE assets ADD COLUMN doc_device_id uuid REFERENCES doc_devices(id) ON DELETE SET NULL;
CREATE INDEX idx_assets_doc_device_id ON assets(doc_device_id);
```

### Passo 2 — Utilitário de mapeamento (`doc-utils.ts`)

Adicionar função exportada `mapAssetTypeToDeviceType`:

| asset_type | device_type |
|---|---|
| computer | workstation |
| notebook | notebook |
| server | server |
| printer | printer |
| switch | switch |
| router | other |
| other | other |

### Passo 3 — Hook `useDocDeviceSync`

Novo hook em `src/hooks/useDocDeviceSync.ts` que encapsula:

- `findMatch(clientId, name, serialNumber)` — busca doc_device por serial_number exato ou name lowercase, retorna o match ou null
- `linkAsset(assetId, docDeviceId)` — UPDATE assets SET doc_device_id
- `promoteToDoc(assetData)` — INSERT em doc_devices com mapeamento de campos, retorna id criado, depois faz linkAsset
- `syncFieldsToDoc(docDeviceId, changedFields)` — UPDATE doc_devices (apenas name, brand_model, serial_number, ip_local, physical_location, notes)
- Usa React Query mutations com invalidação de `client-assets`, `client-doc-devices`, `assets`

### Passo 4 — Dialog de vinculação pós-save

Novo componente `src/components/clients/DocDeviceLinkDialog.tsx`:

**Estado 1 — Match encontrado:**
> "Encontramos um dispositivo na Documentação com nome/serial similar: **[nome]**. Deseja vincular?"
> [Vincular] [Não vincular]

**Estado 2 — Sem match:**
> "Deseja também adicionar este dispositivo à Documentação Técnica?"
> [Adicionar à Documentação] [Agora não]

### Passo 5 — Dialog de vinculação manual

Novo componente `src/components/clients/DocDeviceManualLinkDialog.tsx`:
- Select com doc_devices do cliente que NÃO têm asset vinculado (`WHERE id NOT IN (SELECT doc_device_id FROM assets WHERE doc_device_id IS NOT NULL AND client_id = ?)`)
- Ao confirmar: `linkAsset(assetId, selectedDocDeviceId)`

### Passo 6 — Alterações em `ClientAssetsList.tsx`

1. **Fluxo de criação**: Após `saveMutation.onSuccess` para novo asset, abrir `DocDeviceLinkDialog` passando o asset recém-criado
2. **Fluxo de edição**: Após `saveMutation.onSuccess` para edição de asset com `doc_device_id`, mostrar toast com ação "Sincronizar" que chama `syncFieldsToDoc`
3. **Coluna "Documentado"**: Para itens manuais com `doc_device_id`, mostrar badge verde "Sim" (igual aos documentados) e tornar linha clicável para abrir detalhes
4. **Botão "Vincular à Documentação"**: Na coluna de ações de ativos manuais sem `doc_device_id`, adicionar botão que abre `DocDeviceManualLinkDialog`
5. **Merge logic**: Na seção 3 (manual assets), incluir `doc_device_id` na query do assets e usar para definir `documented: true` quando preenchido
6. **Tooltip**: Ativos manuais sem vínculo mostram tooltip "Ativo manual sem vínculo com Documentação"

### Passo 7 — Atualização no `AssetForm.tsx` (Inventário)

A mesma lógica de vinculação pós-save se aplica ao formulário do Inventário (`/inventory`), que também salva em assets. Integrar o `DocDeviceLinkDialog` no `onSuccess` da mutation.

### Arquivos

| Arquivo | Ação |
|---|---|
| Migração SQL | Criar (ADD COLUMN + INDEX) |
| `src/lib/doc-utils.ts` | Adicionar `mapAssetTypeToDeviceType` |
| `src/hooks/useDocDeviceSync.ts` | Criar (match, link, promote, sync) |
| `src/components/clients/DocDeviceLinkDialog.tsx` | Criar (dialog pós-save) |
| `src/components/clients/DocDeviceManualLinkDialog.tsx` | Criar (vinculação manual) |
| `src/components/clients/ClientAssetsList.tsx` | Integrar dialogs, atualizar merge e UI |
| `src/components/inventory/AssetForm.tsx` | Integrar dialog pós-save |

Nenhuma alteração em tabelas existentes além do ADD COLUMN. Nenhuma sync automática — tudo com confirmação do técnico.

