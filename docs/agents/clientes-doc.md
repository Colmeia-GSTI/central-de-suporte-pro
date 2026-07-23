# Clientes e Documentação Técnica

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo cobre CRUD de clientes (lista cursor-based + form com auto-preenchimento CNPJ e validação WhatsApp), merge de duplicatas (detecção por CNPJ normalizado + RPC transacional), filiais (sede única), dossiê técnico em 14 seções (doc_* via React Query direto + RLS), alertas de vencimento (edge cron), sync TRMM/UniFi e export PDF. Está majoritariamente sólido e todos os arquivos do escopo estão em uso, mas há 3 problemas reais persistentes: merge_clients NÃO migra tabelas doc_* (risco de perda de dados no DELETE em cascata), invalidateAll do useDocSync usa queryKeys que não casam com useDocTableCrud (tabelas não re-renderizam pós-sync), e há dois caminhos de exclusão de cliente (um seguro via RPC, um hard-delete cru na lista).

## Integrações

- ReceitaWS (receitaws.com.br) via cnpj-lookup — auto-preenchimento de CNPJ (tier gratuito, rate-limit 3/min tratado)
- ViaCEP (viacep.com.br) — direto no frontend em ClientBranchesList (CEP->endereço)
- Tactical RMM — sync-doc-devices lê integration_settings + client_external_mappings, importa agents para doc_devices
- UniFi (direct via /api/login e cloud via api.ui.com) — sync-doc-devices importa devices/VLANs/firewall/port-forward/VPN
- validate-whatsapp (edge) — validação de número no ClientForm
- asaas-nfse (edge) — sync_customer + regenerate_payment ao mudar dados fiscais do cliente
- @react-pdf/renderer — geração do PDF do dossiê (import dinâmico)
- RPCs: detect_duplicate_clients, merge_clients, delete_client_safely (SECURITY DEFINER)

## Fluxos (rota → componente → hook → edge → tabela)

- GET /clients -> ClientsPage -> useQuery(clients, cursor-based) + DuplicatesBanner(RPC detect_duplicate_clients) -> tabela clients
- ClientsPage -> ClientForm.searchCNPJ -> invoke('cnpj-lookup') -> ReceitaWS -> form.setValue (não persiste até salvar) -> insert/update clients
- ClientForm submit (edição fiscal) -> update clients -> invoke('asaas-nfse' sync_customer) + regenerate_payment de invoices pending/overdue -> tabelas clients/invoices
- DuplicatesBanner -> MergeClientsDialog (3 passos) -> RPC merge_clients(source,target,overrides) -> migra tickets/contracts/invoices/contacts/assets/branches/etc + audit_logs + client_history + DELETE source
- /clients/:id?tab=branches -> ClientBranchesList -> useClientBranches -> client_branches (CEP via ViaCEP); UNIQUE sede/nome tratada no onError
- /clients/:id?tab=documentation -> ClientDocumentation -> 14 seções: useDocSection (doc_infrastructure/telephony/support_hours) e useDocTableCrud (11 doc_* tabelas) -> supabase-js direto + RLS
- Dossiê -> DocSyncStatusBar/DocTableWorkstations -> useDocSync -> invoke('sync-doc-devices' {action,client_id}) -> TRMM/UniFi -> upsert doc_devices/doc_vlans/doc_firewall_rules/doc_vpn + doc_sync_log
- Cron -> check-doc-expiries -> varre doc_licenses/doc_domains/doc_internet_links/doc_software_erp/doc_external_providers -> doc_alerts + notifications -> useDocAlerts -> DocAlertsPanel
- Dossiê -> botão PDF -> useDocPdfGenerator (fetch paralelo doc_*) -> import dinâmico DocPdfExport/@react-pdf/renderer -> download blob
- /clients/:id?tab=network -> ClientNetworkTab -> useUnifiedNetworkDevices + network_sites/network_topology/doc_vlans/doc_firewall_rules -> NetworkTopologyMap
- ClientDetailPage header -> DeleteClientButton -> RPC delete_client_safely(preview) -> blockers(active_contracts/open_tickets/pending_invoices); confirmação -> delete_client_safely(execute)
- Inventário: AssetForm/ClientAssetsList -> DocDeviceLinkDialog -> useDocDeviceSync.findMatch/promoteToDoc/linkAsset -> assets.doc_device_id + doc_devices

## Regras de negócio

- Merge exige mesmo normalized_document e documento não-vazio (defesa) — supabase/migrations/20260427092735...:29-32
- Merge estratégia híbrida B+A: override > destino > source (COALESCE) — 20260427092735...:74-91; espelhada em client-merge.ts:36-64 (resolveMergedFields) e previewMerge:77-99
- Merge só admin (has_role admin) — 20260427092735...:15; DuplicatesBanner.tsx:35,51 (gate isAdmin)
- Merge só em pares; 3+ duplicatas bloqueadas com aviso — MergeClientsDialog.tsx:127-134 e disabled 258
- Merge exige digitar nome exato do source para confirmar — MergeClientsDialog.tsx:113,267
- Merge migra client_branches resolvendo conflito de sede única (rebaixa) e nome homônimo (' (migrada)') — 20260427092735...:109-136
- Filial: apenas uma is_main por cliente (UNIQUE uniq_client_branches_main_per_client) — ClientBranchesList.tsx:199-206
- Filial: nome único por cliente (uniq_client_branches_name_per_client) — ClientBranchesList.tsx:208-214
- Filial: não excluir a Sede se houver outras filiais — ClientBranchesList.tsx:240-248
- Filial: auto-preenche endereço/cidade/UF via ViaCEP no blur do CEP — ClientBranchesList.tsx:113-161
- Cliente: guarda de duplicata por normalized_document exige window.confirm antes de criar — ClientForm.tsx:461-496; erro 23505/uq_clients_normalized_document tratado — 446-458
- Cliente: mudança fiscal (CNPJ/nome/endereço/CEP) sincroniza Asaas e regenera boletos pending/overdue (evita cobrança duplicada) — ClientForm.tsx:328-413
- Cliente: CNPJ auto-preenchido via cnpj-lookup; edge valida 14 dígitos, timeout 8s, trata 429/502/504 — cnpj-lookup/index.ts:25-84
- Cliente: WhatsApp auto-validado (debounce 2s) via invoke('validate-whatsapp') — ClientForm.tsx:141-151,208-277
- Técnicos não veem document (CPF/CNPJ) nem financial_email — ClientsPage.tsx:344; ClientDetailPage.tsx:193; ClientForm.tsx:511,745
- Exclusão segura: RPC delete_client_safely bloqueia se houver contratos ativos/chamados abertos/faturas pendentes + confirmação por nome — DeleteClientButton.tsx:32-36,56-92
- Sync: campos manuais nunca sobrescritos (ram,primary_user,physical_location,notes,purpose,context,isolated) e flag '+manual' preservada — sync-doc-devices/index.ts:12,28-43
- Sync TRMM: match por trmm_agent_id (fallback nome), conflito de hostname registrado sem sobrescrever — sync-doc-devices/index.ts:106-148
- Asset->doc_device: match prioridade serial_number depois name(ilike) — useDocDeviceSync.ts:37-62
- Alertas: severidade critical(<0 ou <=7d)/warning(<=30d)/info; dedup por alerta ativo existente e resolve fora do limiar — check-doc-expiries/index.ts:63-68,123-215; dedup de notificação não-lida — 189-203
- daysUntil: badge destructive <=30d, warning <=60d — doc-utils.ts:12-24

## Arquivos-chave

- `src/pages/clients/ClientsPage.tsx` — Lista de clientes com busca, paginação cursor-based, filtro 'sem cobrança', banner de duplicatas e CRUD via dialog
- `src/pages/clients/ClientDetailPage.tsx` — Detalhe do cliente com 8 abas (info, filiais, usuários, documentação, ativos, rede, técnicos, relatório)
- `src/components/clients/ClientForm.tsx` — Form Zod de criar/editar cliente: lookup CNPJ, validação WhatsApp, guarda de duplicata, propagação fiscal p/ Asaas
- `src/components/clients/ClientDocumentation.tsx` — Orquestrador do dossiê técnico: renderiza as 14 seções em accordion + painel de alertas + barra de sync + botão PDF
- `src/components/clients/DuplicatesBanner.tsx` — Banner admin que chama RPC detect_duplicate_clients e abre sheet para escolher grupo a mesclar
- `src/components/clients/MergeClientsDialog.tsx` — Wizard 3 passos de merge (escolher destino, preview de campos, confirmar por nome) que chama RPC merge_clients
- `src/components/clients/ClientBranchesList.tsx` — CRUD de filiais com sede única, CEP via ViaCEP, tratamento de violação UNIQUE (sede/nome)
- `src/components/clients/DeleteClientButton.tsx` — Exclusão segura de cliente via RPC delete_client_safely (preview de bloqueios + confirmação por nome)
- `src/components/clients/ClientNetworkTab.tsx` — Aba Rede: dispositivos unificados, sites UniFi, topologia, VLANs, contagem de firewall
- `src/components/clients/NetworkTopologyMap.tsx` — Mapa visual de topologia de rede (devices + links)
- `src/components/clients/ClientAssetsList.tsx` — Lista de ativos do cliente com vínculo/promoção a doc_devices
- `src/components/clients/ClientUsersList.tsx` — Gestão de usuários/contatos do portal do cliente
- `src/components/clients/ClientTechniciansList.tsx` — Vínculo de técnicos responsáveis pelo cliente
- `src/components/clients/ClientSearchCombobox.tsx` — Combobox reusável de busca de cliente (substring nome+doc+apelido) — usado fora do módulo
- `src/components/clients/DocDeviceLinkDialog.tsx` — Dialog auto de vincular/promover ativo a doc_device (usa useDocDeviceSync)
- `src/components/clients/DocDeviceManualLinkDialog.tsx` — Dialog de vínculo manual ativo->doc_device
- `src/components/clients/documentation/DocSectionClientInfo.tsx` — Seção 1: dados gerais do cliente, edição inline via useClientUpdate (grava em clients)
- `src/components/clients/documentation/DocSectionInfrastructure.tsx` — Seção 2: infraestrutura (useDocSection doc_infrastructure)
- `src/components/clients/documentation/DocSectionTelephony.tsx` — Seção 3: internet/telefonia (useDocSection doc_telephony)
- `src/components/clients/documentation/DocSectionSupportHours.tsx` — Seção 11: horários de suporte + renderiza DocTableContacts
- `src/components/clients/documentation/DocSectionSecurity.tsx` — Seção 12: segurança/políticas de rede + sync UniFi (VLANs/firewall)
- `src/components/clients/documentation/DocTableWorkstations.tsx` — Seção 4: estações/servidores (useDocTableCrud doc_devices) + sync TRMM
- `src/components/clients/documentation/DocTableNetworkDevices.tsx` — Seção 5: dispositivos de rede (doc_devices) + sync UniFi
- `src/components/clients/documentation/DocTableCftv.tsx` — Seção 6: CFTV câmeras/NVR (doc_cftv)
- `src/components/clients/documentation/DocTableLicenses.tsx` — Seção 7: licenças com vencimento (doc_licenses)
- `src/components/clients/documentation/DocTableSoftwareErp.tsx` — Seção 8: softwares/ERPs (doc_software_erp)
- `src/components/clients/documentation/DocTableDomains.tsx` — Seção 9: domínios/DNS com vencimento (doc_domains)
- `src/components/clients/documentation/DocTableCredentials.tsx` — Seção 10: credenciais de acesso (doc_credentials)
- `src/components/clients/documentation/DocTableExternalProviders.tsx` — Seção 13: prestadores externos (doc_external_providers)
- `src/components/clients/documentation/DocTableRoutines.tsx` — Seção 14: rotinas e procedimentos (doc_routines)
- `src/components/clients/documentation/DocTableInternetLinks.tsx` — Tabela de links de internet (doc_internet_links) usada na seção de conectividade
- `src/components/clients/documentation/DocTableContacts.tsx` — Tabela de contatos (doc_contacts) da seção 11
- `src/components/clients/documentation/DocSyncStatusBar.tsx` — Barra de status/ação de sync TRMM+UniFi no topo do dossiê
- `src/components/clients/documentation/DocAlertsPanel.tsx` — Painel de alertas de vencimento com acknowledge
- `src/components/clients/documentation/DocPdfExport.tsx` — Documento @react-pdf/renderer (DocPdfDocument) do dossiê técnico
- `src/components/clients/documentation/shared/Field.tsx` — Componente label/valor read-only
- `src/components/clients/documentation/shared/SourceBadge.tsx` — Badge de origem do dado (manual/trmm/unifi)
- `src/components/clients/documentation/shared/StatusBadge.tsx` — Badge de status online/offline (usa statusColors de doc-utils)
- `src/hooks/useDocSection.ts` — CRUD 1:1 de seções misto (doc_infrastructure/telephony/support_hours) + useClientUpdate (grava clients)
- `src/hooks/useDocTableCrud.ts` — CRUD genérico das 14 tabelas doc_* com React Query
- `src/hooks/useDocAlerts.ts` — Lê doc_alerts ativos, agrupa por seção/severidade, acknowledge
- `src/hooks/useDocSync.ts` — Dispara sync-doc-devices (TRMM/UniFi/tudo), lê doc_sync_log, checa config
- `src/hooks/useDocDeviceSync.ts` — Match/link/promote/sync entre assets e doc_devices (usa mapAssetTypeToDeviceType)
- `src/hooks/useDocPdfGenerator.ts` — Busca todas as doc_* em paralelo e gera/baixa o PDF do dossiê
- `src/hooks/useClientBranches.ts` — CRUD de client_branches (enabled:!!clientId)
- `src/hooks/useClientBranchOptions.ts` — Deriva options/mainBranchId de filiais para dropdowns de CMDB
- `src/hooks/useDocCredentialOptions.ts` — Options de doc_credentials para vincular em outras tabelas doc_*
- `src/lib/client-merge.ts` — Lógica pura de resolução de campos do merge (previewMerge + resolveMergedFields, estratégia híbrida B+A) _(uso: parcial)_
- `src/lib/doc-utils.ts` — Utils: daysUntil, display, mapAssetTypeToDeviceType, statusColors
- `supabase/functions/cnpj-lookup/index.ts` — Proxy ReceitaWS: valida 14 dígitos, timeout 8s, trata 429/erro/JSON inválido
- `supabase/functions/check-doc-expiries/index.ts` — Cron: varre 5 fontes doc_* (licenças/domínios/links/software/prestadores), cria/atualiza/resolve doc_alerts + notifica técnicos _(uso: incerto)_
- `supabase/functions/sync-doc-devices/index.ts` — Sync TRMM (agents) e UniFi (direct+cloud: devices/VLANs/firewall/portfwd/VPN) para doc_*, com mergeWithProtection

## Pontos de atenção / riscos

- RISCO DE PERDA DE DADOS (confirmado no código, impacto depende de FK): merge_clients (20260427092735) deleta o source sem migrar nenhuma tabela doc_* (doc_devices/credentials/licenses/domains/vlans/vpn/firewall/alerts/sync_log). Se as FKs client_id forem ON DELETE CASCADE, todo o dossiê técnico do cliente mesclado é apagado silenciosamente. Não pude confirmar o modo da FK (regra: sem consultar banco).
- BUG (confirmado): useDocSync.invalidateAll (useDocSync.ts:92-98) invalida chaves que não existem — prefixo literal 'doc-table' vs chave real de useDocTableCrud [tableName,clientId,'all']. Efeito: após sincronizar TRMM/UniFi, as tabelas de dispositivos/VLANs não atualizam sem refresh manual.
- REDUNDÂNCIA/RISCO: dois fluxos de exclusão de cliente — ClientsPage.tsx:171 hard-delete direto (sem bloqueio de contratos/faturas, sem anonimização) e DeleteClientButton via RPC delete_client_safely. O primeiro contraria a regra do projeto (não apagar registros financeiros; anonimizar) e ignora os blockers. Unificar no RPC seguro.
- cnpj-lookup e check-doc-expiries/sync-doc-devices não têm entrada em supabase/config.toml → verify_jwt=true (default). cnpj-lookup é chamado com JWT do usuário (ok); check-doc-expiries precisa de JWT/service-role no agendador (se agendado).
- resolveMergedFields (client-merge.ts) duplica em TS a lógica que a RPC SQL já faz; mantida só por teste. Baixa prioridade, mas é fonte-dupla de verdade da regra de merge.
- check-doc-expiries reabre/atualiza alertas O(N) com uma query de notificação por técnico dentro do loop (index.ts:189-203) — potencial N+1 em bases grandes; sem paginação/batch.
- ClientsPage.trade_name é lido via type-cast solto (as any) em vários pontos (nickname/trade_name) — types gerados podem estar desatualizados para colunas recém-adicionadas.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `resolveMergedFields` (src/lib/client-merge.ts:36) — Exportada e testada, mas sem uso em produção — o merge real é feito na RPC SQL merge_clients (COALESCE). Só previewMerge é usada na UI. Função espelha a lógica do SQL apenas como spec/teste.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §5.12/tabela (linhas 233,1000) diz 'cnpj-lookup sem token/rate-limit/timeout' — DESATUALIZADO: a edge já tem AbortController timeout 8s + tratamento de 429/502/504 + JSON inválido (cnpj-lookup/index.ts:34-84).
- MAPA tem contradição interna sobre o cron de check-doc-expiries: linha 97 lista 'check-doc-expiries-daily 0 9 * * *', mas linha 235 diz 'cron nao encontrado nas migrations'. Confirmado: NÃO há cron.schedule em supabase/migrations (agendamento, se existir, é externo/Lovable — não verificável sem banco).
- MAPA (linhas 228,241,1441) marca como RISCO ALTO/pendente que merge_clients não migra doc_* — CONFERE com o código: a migration mais recente 20260427092735 migra 13 tabelas mas nenhuma doc_* nem doc_alerts/doc_sync_log; risco permanece aberto (MAPA correto, não resolvido).
- MAPA (linhas 230,243) aponta bug de cache do useDocSync.invalidateAll com queryKeys que não casam — CONFERE: invalidateAll usa ['doc-table','doc_devices',clientId] (useDocSync.ts:94-97) mas useDocTableCrud monta ['doc_devices',clientId,'all'] (useDocTableCrud.ts:35); tabelas não re-renderizam pós-sync.
- MAPA não menciona o SEGUNDO caminho de exclusão de cliente: ClientsPage.tsx:169-183 faz hard-delete cru (.from('clients').delete()) sem checagem de bloqueios, paralelo ao RPC seguro delete_client_safely usado em DeleteClientButton — redundância/risco não documentado.
- MAPA (linha 215) lista useClientMonitoredDevices.ts como hook do módulo Clientes, mas ele é consumido por tickets/portal do cliente (TicketForm, ClientPortalPage, DeviceSelector), não pela UI de Clientes/Documentação.
- MAPA (linha 214) lista os componentes do dossiê de forma parcial ('DocSectionSecurity, DocTableCredentials, DocTableLicenses...'); o módulo real tem 11 DocTable* + 5 DocSection* + 3 shared (Field/SourceBadge/StatusBadge) — contagem/inventário incompleto.

