# Inventário

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo de inventário de TI: gerencia ativos (assets) e licenças de software (software_licenses, com mascaramento de chave via view segura + RPC get_license_key admin-only auditada) e uma aba "Visão Geral" que agrega monitoramento (dispositivos online/offline, alertas, licenças a vencer). Todos os arquivos do escopo estão em uso e roteados. Estado geral: FUNCIONAL exceto a aba "Licenças", que tem um BUG CRÍTICO de runtime — o select da view software_licenses_safe pede colunas inexistentes (license_key, max_activations, current_activations, status), o que quebra a query no PostgREST. O MAPA_DE_SETORES.md do módulo está incomum e notavelmente preciso (já documenta o bug), mas as correções continuam pendentes no código.

## Integrações

- Supabase PostgREST direto (assets, software_licenses, software_licenses_safe, clients, monitored_devices, monitoring_alerts)
- RPC get_license_key (SECURITY DEFINER, admin-only, grava audit_logs)
- Módulo Clientes: DocDeviceLinkDialog vincula ativo a doc_devices; useClientBranchOptions (filiais)
- Módulo Tickets: deep-link /tickets?action=new a partir de dispositivo offline/alerta
- Módulo Monitoramento: InventoryOverview consome monitored_devices/monitoring_alerts; MonitoringPage invoca edge functions checkmk-sync / tactical-rmm-sync / unifi-sync
- Auth/Permissões: PermissionGate module='inventory' (create/edit/delete); rota /inventory protegida por requireStaff

## Fluxos (rota → componente → hook → edge → tabela)

- /inventory -> InventoryPage (aba Ativos) -> AssetForm -> supabase.from('assets') insert/update; ao criar -> DocDeviceLinkDialog -> doc_devices
- /inventory -> InventoryPage (aba Licenças) -> useQuery software_licenses_safe (view) [QUERY QUEBRADA: colunas inexistentes] + deleteLicenseMutation software_licenses; LicenseForm -> insert/update software_licenses; botão Revelar -> supabase.rpc('get_license_key') -> audit_logs (LICENSE_KEY_ACCESS)
- /inventory -> InventoryPage (aba Visão Geral) -> InventoryOverview -> monitored_devices + monitoring_alerts + software_licenses (tabela base); Reconhecer -> update monitoring_alerts.status='acknowledged'; Abrir Ticket -> navigate('/tickets?action=new&...')
- /monitoring -> MonitoringPage -> monitored_devices + monitoring_alerts; Sincronizar -> supabase.functions.invoke('checkmk-sync' | 'tactical-rmm-sync' | 'unifi-sync')

## Regras de negócio

- get_license_key é SECURITY DEFINER, admin-only (RAISE EXCEPTION se não-admin) e grava audit_logs LICENSE_KEY_ACCESS — supabase/migrations/20260129235822_...sql:144,153; consumido em src/components/inventory/LicenseForm.tsx:141
- Chave de licença nunca é pré-preenchida no form e só é enviada no update se explicitamente alterada (keyChanged) — src/components/inventory/LicenseForm.tsx:104,183-189
- Validação: used_licenses <= total_licenses — src/components/inventory/LicenseForm.tsx:45-50
- Validação: expire_date >= purchase_date quando ambos presentes — src/components/inventory/LicenseForm.tsx:51-62
- Licenças 'a vencer' = expire_date entre agora e +30 dias — src/components/inventory/InventoryOverview.tsx:99-100,162-168
- View software_licenses_safe mascara license_key ('****'+últimos 4) com security_invoker — supabase/migrations/20260204131545_...sql:26-29
- Rascunho do LicenseForm exclui license_key da persistência — src/components/inventory/LicenseForm.tsx:119
- Deep-link de ticket (offline/alerta) pré-preenche e usa priority=high — src/components/inventory/InventoryOverview.tsx:336-343

## Arquivos-chave

- `src/pages/inventory/InventoryPage.tsx` — Página raiz do módulo: tabs Visão Geral / Ativos / Licenças / Garantias; CRUD de assets e software_licenses via useQuery/useMutation inline.
- `src/components/inventory/InventoryOverview.tsx` — Aba Visão Geral: 4 contadores + tabelas de dispositivos offline, alertas ativos (reconhecer) e licenças a vencer; deep-link para abrir ticket.
- `src/components/inventory/AssetForm.tsx` — Formulário de criar/editar ativo (RHF+Zod); ao criar, oferece vínculo com doc_devices via DocDeviceLinkDialog.
- `src/components/inventory/LicenseForm.tsx` — Formulário de criar/editar licença; revela chave completa (admin) via RPC get_license_key; nunca pré-preenche a chave.
- `src/pages/monitoring/MonitoringPage.tsx` — Página do módulo Monitoramento (separada): lista monitored_devices/monitoring_alerts, filtros, agrupamento, sincroniza CheckMK/RMM/UniFi. Adjacente ao Inventário (a 'visão geral de monitoramento' do escopo é a aba InventoryOverview).

## Pontos de atenção / riscos

- BUG CRÍTICO CONFIRMADO (runtime): InventoryPage.tsx:138-139 seleciona colunas inexistentes na view software_licenses_safe (license_key, max_activations, current_activations, status) — a aba Licenças quebra com erro PostgREST. As colunas corretas seriam total_licenses, used_licenses, license_key_masked, purchase_date, purchase_value, notes (ver migration 20260204131545 e types.ts:6826).
- Redundância: gestão de ativos duplicada entre src/components/inventory/AssetForm.tsx e src/components/clients/ClientAssetsList.tsx (schema/form/insert próprios) — viola 'uma única fonte de verdade' do CLAUDE.md §6.0.2.
- AssetForm.tsx:210-216: Select de tipo não oferece 'software' nem 'license' embora estejam no enum asset_type — não é possível criar/editar esses tipos por aqui (o label existe em InventoryPage.tsx:81-82).
- InventoryOverview.acknowledgeMutation (InventoryOverview.tsx:178-191) não tem onError; forms de asset/license não invalidam a query ['inventory-counters'], então os cards da Visão Geral ficam defasados após criar/editar.
- Aba 'Garantias' (InventoryPage.tsx:483-490) é placeholder estático.
- Cast desnecessário de ip_address em AssetForm.tsx:67 (coluna já tipada em types.ts:196).
- deleteLicenseMutation (InventoryPage.tsx:194-207) faz DELETE direto sem tratar possível FK (ex.: license_assets) — falha cai só no toast onError.
- Duplicação da contagem de licenças a vencer: calculada no counter (InventoryOverview.tsx:96-100) e de novo na query expiringLicenses (L162-168), com a mesma janela de 30 dias.
- MonitoringPage.tsx pertence ao módulo Monitoramento (separado); foi incluído por adjacência ao escopo 'visão geral de monitoramento', que na prática é a aba InventoryOverview.

## Notas de divergência (auditoria vs MAPA antigo)

- docs/MAPA_DE_SETORES.md (§ Inventário, L560-602) está NOTAVELMENTE ALINHADO com o código — poucas divergências. CONFIRMADO: o 'BUG CRÍTICO' que o MAPA descreve na L578 é real e continua NÃO remediado. Prova: InventoryPage.tsx:139 seleciona 'license_key, max_activations, current_activations, status' de software_licenses_safe, mas a view (migration 20260204131545 L14-29 e types.ts:6826-6841) só expõe id, client_id, name, vendor, total_licenses, used_licenses, purchase_date, expire_date, purchase_value, notes, created_at, updated_at, license_key_masked. As colunas pedidas não existem => PostgREST 400 quebra a aba Licenças.
- MAPA L579 (inconsistência de tipos): CONFIRMADO — o type LicenseWithClientSafe e o render usam used_licenses/total_licenses (InventoryPage.tsx:438-439) que o select nem pede.
- MAPA L580 (mascaramento incoerente): CONFIRMADO — InventoryOverview lê a tabela base software_licenses (InventoryOverview.tsx:97,165), não a view safe (aqui só nome/data, sem chave, então baixo risco).
- MAPA L581 (AssetForm sem 'software'/'license' no Select): CONFIRMADO — enum asset_type inclui software/license (InventoryPage.tsx:81-82) mas o Select do AssetForm.tsx:210-216 omite ambos.
- MAPA L583 (cast desnecessário de ip_address): CONFIRMADO — assets.ip_address é coluna tipada real (types.ts:196), então o cast '(asset as Record<string,unknown>)?.ip_address' em AssetForm.tsx:67 é desnecessário.
- Divergência não listada no MAPA: existe um CRUD de ativos PARALELO em src/components/clients/ClientAssetsList.tsx (assetSchema/form/DocDeviceLinkDialog/useClientBranchOptions próprios, from('assets') em L197,354,359,428) — duplica AssetForm; o MAPA não menciona esse caminho redundante.

