# NFS-e e Certificados Digitais

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo de emissão/cancelamento/arquivamento de NFS-e delegada ao Asaas (idempotente por fatura via índice único + NFSE_BLOCKING_STATUSES), com sync por webhook (baixa PDF/XML, auto-emite no pagamento, reemissão pós-cancelamento) e polling (check_single_status). Toda a lógica de negócio vive no monólito asaas-nfse/index.ts (3010 linhas, mistura NFS-e + cobrança boleto/PIX). O frontend (BillingNfseTab e diálogos em src/components/billing/nfse/**) está coeso e em uso. Os certificados A1 (parse-certificate + certificate-vault + tabela certificates) servem hoje apenas como registro/monitoramento — a emissão fiscal usa o certificado dentro do próprio Asaas, então a senha criptografada e a action 'decrypt' nunca são consumidas. Estado geral: funcional, porém com código morto (5 actions + decrypt), duplicação de fonte de dados de certificado e um monólito que fere a regra de arquivos pequenos.

## Integrações

- Asaas API (sandbox/produção) — emissão/cancelamento de NFS-e e cobrança boleto/PIX; ASAAS_URLS em asaas-nfse/index.ts:160-163
- Resend (via edge send-email-resend) — e-mail da NFS-e com PDF/XML anexos (send-nfse-notification:273)
- WhatsApp/Evolution (via edge send-whatsapp) — canal opcional de compartilhamento da nota (send-nfse-notification:351)
- Supabase Storage — buckets 'nfse-files' (PDF/XML da nota) e 'certificates' (.pfx/.p12)
- node-forge (esm.sh, PKCS12) — leitura do certificado A1 em parse-certificate
- Web Crypto (PBKDF2/AES-GCM) usando SUPABASE_SERVICE_ROLE_KEY como key material em certificate-vault

## Fluxos (rota → componente → hook → edge → tabela)

- Emissão via fatura (UI): BillingInvoicesTab/EmitNfseDialog -> invoke asaas-nfse(emit) -> ensureCustomerSync(clients) -> insere nfse_history('processando') -> POST /invoices Asaas -> espelha invoices.nfse_status(pendente/gerada)
- Emissão avulsa: BillingNfseTab -> NfseAvulsaDialog -> asaas-nfse(emit_standalone) [+ asaas-nfse(create_payment) p/ boleto] -> nfse_history / invoices
- Emissão automática na geração de fatura: generate-monthly-invoices(cron) -> asaas-nfse(emit) -> nfse_history (política: emite na geração; webhook é fallback)
- Auto-emissão no pagamento (fallback): Asaas PAYMENT_RECEIVED -> webhook-asaas-nfse -> asaas-nfse(emit) se contract.nfse_service_code e !auto_nfse_emitted -> nfse_history
- Sync de status: Asaas INVOICE_* -> webhook-asaas-nfse -> nfse_history(status/numero/pdf_url/xml_url) + invoices.nfse_status -> send-nfse-notification(email) só na 1ª autorização -> financial_entries
- Polling manual/agendado: NfseProcessingIndicator -> asaas-nfse(check_single_status) -> baixa PDF/XML nfse-files -> nfse_history; poll-services(cron) -> send-nfse-notification
- Cancelamento: NfseDetailsSheet -> details/NfseCancelDialog -> asaas-nfse(cancel) -> POST /invoices/{id}/cancel -> nfse_cancellation_log(REQUESTED->CANCELLED) + nfse_history
- Ajuste de valor da nota (cancelar+reemitir): EditInvoiceDialog -> asaas-nfse(cancel_and_reissue_nfse) -> doReissue -> asaas-nfse(emit,force_new_emission) -> nfse_history(nfse_substituta_id)
- Reemissão assíncrona: webhook-asaas-nfse(INVOICE_CANCELED + reissue_pending) -> asaas-nfse(reissue_nfse) -> doReissue -> nfse_history
- Vincular nota externa: BillingNfseTab/NfseDetailsSheet -> NfseLinkExternalDialog -> asaas-nfse(link_external) -> nfse_history(status='autorizada', codigo_retorno='LINKED_EXTERNAL')
- Arquivar/restaurar: NfseDetailsSheet -> details/NfseArchiveDialog -> asaas-nfse(archive_record/restore_record) -> nfse_history.is_active + nfse_event_logs
- Compartilhar: NfseShareMenu/NfseDetailsSheet -> send-nfse-notification(email/whatsapp) -> signed URLs bucket nfse-files -> invoice_notification_logs
- Certificado A1: CompanyTab/CertificateManager -> parse-certificate(node-forge) + certificate-vault(encrypt) -> tabela certificates + bucket certificates
- Dashboard de certificados: rota /settings/certificates -> CertificateDashboardPage -> lê company_settings.certificado_* (fonte legada, não escrita) -> sempre 'Não Configurado'

## Regras de negócio

- Idempotência por fatura: emit com invoice_id e sem nfse_history_id/force_new_emission é bloqueado se já existe nota viva (autorizada|processando|pendente) — asaas-nfse/logic.ts:6,17-21 aplicado em index.ts:778-784
- Garantia dura de unicidade: índice único parcial uq_nfse_history_active_per_invoice; colisão 23505 devolve a nota vencedora — asaas-nfse/index.ts:1104-1107
- Validação de dados do cliente p/ NFS-e: e-mail + endereço + CEP de 8 dígitos obrigatórios (erro CLIENT_INCOMPLETE_DATA) — asaas-nfse/index.ts:232-243
- Cancelamento exige justificativa de 15 a 500 caracteres e bloqueia se já CANCELLED (409 ALREADY_CANCELLED) — asaas-nfse/index.ts:1789-1808
- Cancelamento de nota autorizada usa POST /invoices/{id}/cancel (não DELETE); 404 tratado como já cancelada; status *DENIED => erro 422 — asaas-nfse/index.ts:1852-1873
- Arquivamento é soft-delete (is_active=false) exigindo motivo >=5 chars; delete_record nunca apaga (retenção fiscal 7 anos) — asaas-nfse/index.ts:2104-2124
- Reemissão escala as retenções federais proporcionalmente ao novo valor e liga a nota nova à antiga via nfse_substituta_id — asaas-nfse/index.ts:547-552,585-590
- effective_date da (re)emissão = max(hoje, 1º dia da competência) — asaas-nfse/index.ts:554-558
- Auto-resolução em cascata do código de serviço municipal: contrato -> fatura->contrato -> nfse_history -> company_settings.nfse_codigo_tributacao_padrao — asaas-nfse/index.ts:915-987
- Match de código de serviço extrai o código do início do campo description do Asaas (regex /^(\d{2}\.\d{2}\.\d{2})/), pois a API não retorna campo code — asaas-nfse/index.ts:1025-1033
- normalizeServiceCode remove . espaço e - mas NÃO zeros à esquerda (010701 permanece) — asaas-nfse/index.ts:68-72
- Cálculo de retenções: ISS retido sobre base=valorServico-deduções; valorLiquido=serviço-desconto-totalRetenções — src/lib/nfse-retencoes.ts:47-63
- Webhook: idempotência por webhook_events (event+id) gravado ANTES de processar — webhook-asaas-nfse/index.ts:718-740
- Webhook auth (fail-closed): token via query/header/integration_settings.webhook_token; nega se sem WEBHOOK_SECRET_ASAAS — webhook-asaas-nfse/index.ts:76-113
- Webhook envia e-mail da NFS-e só na 1ª autorização (oldStatus !== 'autorizada') e só com pdf_url E xml_url gravados — webhook-asaas-nfse/index.ts:391-410
- Webhook PAYMENT pago cria financial_entry idempotente por invoice_id; PAYMENT_REFUNDED reverte com lançamento 'estorno' negativo sem apagar a receita original — webhook-asaas-nfse/index.ts:530-547,619-685
- send-nfse-notification bloqueia envio sem pdf_url E xml_url; signed URLs de 7 dias; consolida boleto/PIX no mesmo e-mail — send-nfse-notification/index.ts:111-145,195
- Certificado: aceita só .pfx/.p12 até 5MB; senha criptografada server-side (AES-256-GCM/PBKDF2 100k) antes de gravar — CertificateManager.tsx:218-229 + certificate-vault/index.ts:30-78
- parse-certificate seleciona o certificado end-entity (não-CA) via basicConstraints; isExpiringSoon <=15 dias — parse-certificate/index.ts:78-88,105

## Arquivos-chave

- `supabase/functions/asaas-nfse/index.ts` — Monólito (3010 linhas) com todas as actions de NFS-e (emit, emit_standalone, cancel, cancel_and_reissue_nfse, reissue_nfse, link_external, archive/restore/delete_record, check_single_status) E de cobrança (create_payment, cancel_payment, regenerate_payment, sync_customer + actions de teste).
- `supabase/functions/asaas-nfse/logic.ts` — Regra pura testável de idempotência: NFSE_BLOCKING_STATUSES (autorizada|processando|pendente) e shouldBlockNewEmission.
- `supabase/functions/webhook-asaas-nfse/index.ts` — Webhook Asaas: sincroniza status NFS-e, baixa PDF/XML p/ bucket nfse-files, auto-emite NFS-e em PAYMENT_RECEIVED, reemite (reissue_pending), baixa/estorno financeiro; idempotência por webhook_events.
- `supabase/functions/send-nfse-notification/index.ts` — Envia NFS-e (PDF/XML via signed URL 7d) por e-mail (Resend) e WhatsApp; consolida boleto/PIX no mesmo e-mail; bloqueia se faltar pdf_url ou xml_url.
- `supabase/functions/certificate-vault/index.ts` — Cripto server-side da senha do certificado (AES-256-GCM/PBKDF2 100k) — actions encrypt e decrypt. _(uso: parcial)_
- `supabase/functions/parse-certificate/index.ts` — Faz parse de .pfx/.p12 (node-forge PKCS12), extrai titular/emissor/validade/serial; sem verificação de auth interna.
- `src/lib/nfse-retencoes.ts` — Cálculo puro de retenções (ISS retido, PIS/COFINS/CSLL/IRRF/INSS) e valor líquido para NFS-e Nacional 2026.
- `src/components/billing/BillingNfseTab.tsx` — Aba principal de NFS-e: lista, filtros, ações; hospeda os diálogos (Avulsa, Details, LinkExternal, EventLogs, Share).
- `src/components/billing/nfse/NfseDetailsSheet.tsx` — Painel de detalhes da nota: emitir/cancelar/arquivar/restaurar/vincular externa/editar; orquestra os subdiálogos.
- `src/components/billing/nfse/NfseAvulsaDialog.tsx` — Emissão de NFS-e avulsa (sem contrato) + geração de boleto opcional.
- `src/components/billing/EmitNfseDialog.tsx` — Diálogo de emissão de NFS-e a partir de uma fatura (com prévia de retenções).
- `src/components/billing/CancelNfseDialog.tsx` — Diálogo de cancelamento de NFS-e no nível da fatura (BillingInvoicesTab).
- `src/components/billing/nfse/NfseProcessingIndicator.tsx` — Indicador/célula de status 'processando' com botão de polling manual (check_single_status).
- `src/components/billing/nfse/NfseLinkExternalDialog.tsx` — Vincular manualmente nota emitida fora (Portal Nacional) a um registro local.
- `src/components/billing/nfse/NfseEventLogsDialog.tsx` — Exibe a trilha de eventos (nfse_event_logs) da nota.
- `src/components/billing/nfse/NfseShareMenu.tsx` — Menu de compartilhamento da NFS-e (e-mail/WhatsApp/download) via send-nfse-notification.
- `src/components/billing/nfse/NfseTributacaoSection.tsx` — Seção de tributação/retenções reutilizável (usa calcularRetencoes).
- `src/components/billing/nfse/NfseServiceCodeCombobox.tsx` — Combobox de código de serviço municipal lendo tabela nfse_service_codes (ativo=true), ordenado por uso.
- `src/components/billing/nfse/nfseFormat.ts` — Helpers de formatação/labels de status NFS-e (statusLabel, asaasStatusLabel, isE0014Error, formatNfseErrorMessage).
- `src/components/billing/nfse/nfseValidation.ts` — buildNfseValidation e normalizeCompetencia (validação pré-emissão).
- `src/components/billing/nfse/details/NfseCancelDialog.tsx` — Subdiálogo de confirmação de cancelamento (motivo).
- `src/components/billing/nfse/details/NfseArchiveDialog.tsx` — Subdiálogo de arquivamento (motivo >=5 chars).
- `src/components/billing/nfse/details/NfseEditForm.tsx` — Formulário de edição de dados fiscais da nota (código serviço, tributação, competência).
- `src/components/nfse/ServiceCodeSelect.tsx` — Seletor de código de serviço (com cadastro inline) para contratos/serviços/empresa.
- `src/components/nfse/ServiceCodeForm.tsx` — Formulário de cadastro de código de serviço (nfse_service_codes).
- `src/components/settings/CertificateManager.tsx` — CRUD de certificados A1: valida via parse-certificate, cripto via certificate-vault(encrypt), grava na tabela certificates + bucket certificates.
- `src/pages/settings/CertificateDashboardPage.tsx` — Dashboard de validade de certificados — porém lê company_settings.certificado_* (campos legados NÃO escritos pelo Manager). _(uso: parcial)_
- `src/components/settings/integrations/AsaasConfigForm.tsx` — Configuração/teste da integração Asaas (actions test, create_test_customer/payment, confirm_test_payment, emit_test).

## Pontos de atenção / riscos

- Duplicação de fonte de dados de certificado CONFIRMADA: CertificateManager grava na tabela 'certificates'; CertificateDashboardPage lê company_settings.certificado_* (nunca escritos) — o dashboard sempre mostra 'Não Configurado'. Unificar a fonte de verdade.
- Promessa não implementada: CertificateDashboardPage afirma 'verificação diária' e alertas de vencimento em 30/15/7 dias (linhas 343-355), mas não há edge/cron de expiração de certificado A1 (check-doc-expiries é para documentação de clientes).
- Cadeia de certificado é registro/monitoramento apenas: a emissão fiscal usa o certificado dentro do Asaas, então a senha criptografada (senha_hash) e a action 'decrypt' do certificate-vault são código morto de fato.
- config.toml só declara send-nfse-notification (verify_jwt=false). webhook-asaas-nfse NÃO está declarado — se o default da plataforma for verify_jwt=true, o webhook externo do Asaas seria barrado antes de verifyWebhookAuth. Confirmar o deploy/verify_jwt no Lovable (não checável por regra de somente-leitura).
- parse-certificate não faz verificação de auth/role interna (confia no verify_jwt default); asaas-nfse roda 100% com service_role sem validar JWT/role do chamador.
- Monólito: asaas-nfse/index.ts (3010 linhas) mistura NFS-e e cobrança (boleto/PIX) no mesmo arquivo — fere a regra de arquivos pequenos/foco único; candidato a split (nfse vs payments).
- Duas famílias de seletor de código de serviço convivem: src/components/nfse/ServiceCodeSelect+ServiceCodeForm (contratos/serviços/empresa) e src/components/billing/nfse/NfseServiceCodeCombobox (diálogos NFS-e). Ambas leem nfse_service_codes; possível consolidação.
- certificate-vault usa SUPABASE_SERVICE_ROLE_KEY como material de chave do PBKDF2 — rotação da service key quebraria a descriptografia de senhas já gravadas (embora 'decrypt' hoje seja morto).
- CertificateManager.deleteMutation faz DELETE físico do certificado + arquivo no storage (não anonimiza); aceitável pois não é registro financeiro/auditoria, mas contrasta com a política de anonimização do projeto.
- Divergência de guardas mantida de propósito: contrato ativo pode emitir NFS-e só no pagamento (nfse_service_code sem nfse_enabled) — unificar geraria decisão de negócio (cf. MAPA linha 388).

## Código morto — tratado na Fase 2 ou pendente de decisão

- `action 'decrypt'` (supabase/functions/certificate-vault/index.ts:157) — Nenhum caller descriptografa a senha do certificado; a emissão usa o certificado dentro do próprio Asaas. A senha criptografada em certificates.senha_hash nunca é lida.
- `action 'get_status'` (supabase/functions/asaas-nfse/index.ts:1614) — Consulta simples de status sem nenhum invocador; substituída por check_single_status (esse sim usado por NfseProcessingIndicator).
- `action 'list_services'` (supabase/functions/asaas-nfse/index.ts:641) — Listagem de serviços municipais Asaas sem caller; a UI usa a tabela local nfse_service_codes (NfseServiceCodeCombobox).
- `action 'create_customer'` (supabase/functions/asaas-nfse/index.ts:653) — Sem caller; o frontend usa 'sync_customer' (ClientForm) e 'create_test_customer' (AsaasConfigForm); a emissão usa ensureCustomerSync internamente.
- `action 'retry_failed'` (supabase/functions/asaas-nfse/index.ts:2718) — Sem caller; o reprocesso de nota é feito re-invocando 'emit'/'emit_standalone' (InvoiceProcessingHistory:205, NfseDetailsSheet:305).
- `action 'delete_record' (alias legado)` (supabase/functions/asaas-nfse/index.ts:2107) — Alias mantido por compat (cai em archive_record, nunca apaga). Nenhum caller vivo — o frontend usa 'archive_record'.

## Notas de divergência (auditoria vs MAPA antigo)

- Contagem de linhas: MAPA §3.6 (linha 366) diz asaas-nfse '~2689 linhas'; o arquivo real tem 3010 linhas.
- Risco obsoleto: MAPA linha 385 lista 'STATUS_MAP divergente (CANCELLATION_DENIED -> autorizada vs erro)', mas o código real já mapeia CANCELLATION_DENIED -> 'erro' (webhook-asaas-nfse/index.ts:61). Divergência já corrigida, ainda listada como risco aberto.
- Risco parcialmente obsoleto: MAPA linha 381 diz que send-nfse-notification só assina paths 'nfse-files/' e 'links do webhook podem quebrar'. O resolveStoragePathBackend atual trata também o prefixo 'nfse/' (send-nfse-notification/index.ts:28-30), resolvendo ambos os formatos (webhook grava 'nfse/<id>.pdf'; check_single_status grava 'nfse-files/...'). Mitigado.
- Código morto subestimado: MAPA linha 379 cita apenas a action 'decrypt' como morta; existem 4 outras actions sem caller não citadas — get_status, list_services, create_customer, retry_failed (+ alias legado delete_record).
- Componentes: MAPA linha 362 enumera os componentes de billing/nfse mas omite NfseServiceCodeCombobox (existe e é usado por NfseAvulsaDialog e NfseEditForm).
- Concordância confirmada (não é divergência): duplicação de fonte de certificado (Manager grava 'certificates' vs Dashboard lê 'company_settings.certificado_*') e ausência de cron de validade de certificado (MAPA 378, 380) batem com o código; check-doc-expiries cobre documentação de clientes, não o certificado A1.

