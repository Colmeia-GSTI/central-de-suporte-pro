# Changelog

## [Não publicado] - Correção de curso: contexto de agentes na estrutura recomendada (2026-07-23)

Reestrutura a configuração de agentes seguindo a documentação oficial da Anthropic
(memory / best practices). O problema: **261 linhas eram carregadas em toda sessão**
(`CLAUDE.md` + `@AGENTS.md`), acima da meta de 200 — e acima disso a aderência cai e
as regras importantes se perdem no ruído.

### Adicionado
- **`.claude/rules/`** — regras com `paths` no frontmatter, carregadas **só** ao tocar nos arquivos:
  `frontend.md` (`src/**`), `edge-functions.md` (`supabase/functions/**`),
  `banco-de-dados.md` (`supabase/migrations/**`, `src/integrations/supabase/**`).
- **`.claude/skills/`** — procedimentos multi-passo, carregados só quando invocados:
  `/deploy-edge` (push não deploya edge — inclui o timeout enganoso do `send_message`),
  `/alterar-banco` (MCP do Lovable + registro no log), `/guards` (tsc + vitest + deno).
- **Hook `check-mcp-bundle.sh`** — bloqueia commit do bundle MCP corrompido pelo build do Windows.
  Testado nos dois cenários (íntegro → permite; 8 linhas → bloqueia com instrução de correção).
- **`docs/integracoes-externas.md`** — documentação oficial de cada API de terceiro
  (Asaas, Banco Inter, Evolution, Telegram, Resend, RMM, CheckMK, UniFi, ReceitaWS, BCB SGS,
  Google Calendar), com modelo de auth, ambientes e armadilhas. Complementa a matriz do
  `_transversais.md` §4 (que mapeia edges/webhooks/secrets) sem duplicá-la.
- **`docs/agents/README.md`** — índice dos 20 docs de módulo, movido para fora do `AGENTS.md`.

### Modificado
- **`AGENTS.md`: 251 → 127 linhas.** Saiu o que a doc oficial manda excluir: árvore de diretórios
  (derivável do código), convenções por área (→ `.claude/rules/`), tabela de módulos
  (→ `docs/agents/README.md`) e a seção graphify (**duplicava** o `CLAUDE.md` do diretório pai —
  instrução repetida em dois níveis faz o agente escolher uma ao acaso). Ficou o que é
  não-inferível: comandos, guards, as 3 vias do Lovable Cloud, princípios e armadilhas.
- **`CLAUDE.md`: 10 → 46 linhas** — deixou de ser só um ponteiro. Agora documenta **o que carrega
  quando**, as skills disponíveis e onde cada tipo de instrução deve ser escrita.
- **Carga por sessão: 261 → 173 linhas** (−34%), dentro da meta de 200.
- **`.gitignore`** reescrito com critério explícito e adições: `dev-dist`, `coverage/`,
  `*.tsbuildinfo`, `.env.local`, `CLAUDE.local.md`, cruft de Windows/Nextcloud
  (`desktop.ini`, `Thumbs.db`, `*conflicted copy*`).

### Verificado
- **`.env` NÃO deve ser gitignorado** — foi commitado pelo bot do Lovable (`gpt-engineer-app`) e
  contém só chaves `VITE_*` publicáveis; removê-lo quebra o build. `.lovable/` idem (manifest do MCP).
  Ambos documentados no topo do `.gitignore` para não serem "limpos" por engano no futuro.
- Removido `.playwright-mcp/` do disco (123 arquivos, 5.9 MB de snapshots efêmeros de 08–09/jul).
- Guards: `tsc` 0 erros · 78 testes · todos os links markdown resolvem.

## [Não publicado] - Limpeza geral do repositório (2026-07-23)

### Removido
- **Docs legados da raiz** (~2.4 mil linhas): `SYSTEM_DOCUMENTATION.md`, `IMPLEMENTATION_GUIDE.md`,
  `ADMIN_TOOLS.md`, `SECURITY.md`, `TESTING.md`, `FEATURE_FLAGS.md`. Conteúdo vivo já estava em
  `docs/agents/`; o que restava estava **errado** — `SECURITY.md` citava `src/lib/security.ts` e
  `src/lib/api-error-handler.ts`, `TESTING.md` citava `src/lib/ticket-payload.ts` e `ADMIN_TOOLS.md`
  a edge `create-client-user`, **nenhum deles existente**. `FEATURE_FLAGS.md` documentava a ordem de
  avaliação antiga, contrariando o fix de `rollout=0` de 2026-07-22.
- **`docs/audit/`** (2196 linhas) — auditoria/limpeza/pendências de 2026-07-21, todas executadas e
  encerradas. As decisões conscientes ("fechado por design") foram preservadas em
  `docs/agents/_transversais.md` §8 para não voltarem como achado novo.
- **`docs/MAPA_DE_SETORES.md`** — redirecionamento morto de 14 linhas.
- `playwright-mcp-healthcheck.ps1` e screenshots de debug soltos na raiz (`boleto-*.png`, `mobile-*.png`).
- **`graphify-out/` saiu do versionamento** (~35 MB / 59 arquivos de artefato gerado e já desatualizado).
  Continua em disco; regenerar com `graphify update .`.

### Modificado
- `README.md` reescrito — era o boilerplate do Lovable com `REPLACE_WITH_PROJECT_ID` e comandos `npm`.
- `docs/ops/` criado: `DEPLOYMENT_PLAYBOOK.md` e `BACKUP_PROCEDURE.md` movidos da raiz (mantidos por
  conterem operação que não existe em `docs/agents/`: secrets, SQL dos crons, runbook, onboarding, SLA).
- `PRODUCT_IDEAS.md` → `docs/PRODUCT_IDEAS.md`.
- `AGENTS.md`/`CLAUDE.md`: índice de documentação atualizado; contagem de edges corrigida (59 → **57**).
- `docs/agents/_transversais.md`: §7.1 (pg_cron) e §7.11 (código morto) marcados como resolvidos —
  contradiziam o trabalho já concluído; §8 (decisões fechadas) e §9 (divergências) adicionados.
- `docs/agents/configuracoes.md`: ordem de avaliação de feature flag alinhada ao código atual.

### Descoberto (não corrigido — decisão pendente)
- **`bun run build` no Windows corrompe `supabase/functions/mcp/index.ts`.** O `mcpPlugin()` do
  `@lovable.dev/mcp-js` não resolve o caminho absoluto do Windows e emite
  `import mcp from "npm:C:\\Users\\...\\src\\lib\\mcp\\index.ts"` — bundle de 8 linhas que quebraria a
  edge `mcp` em produção (as 4 ferramentas somem). Reproduzível a cada build. Documentado em
  `AGENTS.md` §6.8 com a mitigação (`git restore` após build local).

### Verificado
- Varredura de órfãos em `src/`: **zero arquivos sem importador** (os 3 detectados são entrypoints —
  `main.tsx`, `test/setup.ts`, `lib/mcp/index.ts`). Nenhuma edge órfã: `auto-retry-failed-boletos` e
  `check-doc-expiries` são acionadas por cron.
- Guards: `tsc --noEmit` 0 erros · 78 testes passando · `bun run build` ok · todos os links markdown resolvem.

## [Não publicado] - Cobrança: dedup/gate de frequência cegos ('voided') + regras canônicas

### Corrigido
- **Dedup e gate de frequência cegos em produção (bug crítico).** Os filtros `status not in ("cancelled","voided")` do `generate-monthly-invoices` falhavam com 22P02 (`voided` não existe no enum `invoice_status`) e o erro era **engolido**: o gerador re-tentava o INSERT de toda fatura já emitida (~19/dia, segurados apenas pelo índice único) e o gate de frequência nunca via a última fatura — **contratos trimestrais cobrados todo mês** (faturas #662 Gayger e #785 Juremir de jul/2026 indevidas, com boleto+e-mail+NFS-e). Correção: `.neq("status","cancelled")` (alinha enum + índice) e fail-closed nos 3 pontos (erro de query aborta o contrato em vez de prosseguir às cegas).
- **Remediação:** #662/#785 canceladas por completo (NFS-e 315/344, boletos no Asaas e faturas), com auditoria; nenhuma havia sido paga. Próximo ciclo correto dos trimestrais: 2026-09.

### Adicionado
- **`docs/REGRAS_DE_COBRANCA.md`** — regras canônicas do ciclo recorrência → fatura → boleto → NFS-e (unicidade por fatura, preferências de pagamento, nota opcional, frequências e datas), validadas contra produção em 2026-07-10.

---

## [Não publicado] - NFS-e: correção da emissão duplicada + idempotência por fatura

### Corrigido
- **NFS-e emitida em duplicidade (bug crítico, origem no commit `4b4d552` de 2026-05-07).** A emissão na geração da fatura (`generate-monthly-invoices`) nunca marcava `invoices.auto_nfse_emitted`; ao liquidar o boleto, o `webhook-asaas-nfse` re-emitia a nota. Resultado auditado: **49 NFS-e autorizadas em duplicidade (R$ 37.161,58 declarados 2× à prefeitura)** entre mar–jul/2026, mais 18 faturas em aberto que duplicariam ao serem pagas.
- **Correção (root cause):** a action `emit` do `asaas-nfse` agora é **idempotente por fatura** — com `invoice_id` e sem `nfse_history_id`/`force_new_emission`, se a fatura já tem nota viva (`autorizada|processando|pendente`) retorna `already_exists:true` com a nota existente. A flag `auto_nfse_emitted` passou a ser gravada pelo próprio `asaas-nfse` no sucesso (fonte única). Colisão de corrida (23505 no índice único) devolve a nota vencedora. Predicado puro em `asaas-nfse/logic.ts` (`shouldBlockNewEmission`) com teste da matriz de bypass.
- **Política consolidada:** NFS-e emitida na **geração da fatura**; o auto-emit do webhook de pagamento vira apenas **fallback** quando nenhuma nota existe (reemissão, retry E0014 e avulsa preservados via bypasses).

### Banco / Remediação (via Lovable MCP, 2026-07-10)
- Desarme: `auto_nfse_emitted=true` em 62 faturas com nota viva e flag falsa.
- Cancelamento em lote das 49 notas excedentes via action `cancel` (46 duplicatas: mantida a 1ª nota; 3 de mar/2026: mantida a reemissão com alíquota correta e cancelada a original com 0%). Desfecho: **32 canceladas (R$ 28.247,58)** e **17 negadas pela prefeitura — E0822 fora do prazo (R$ 8.914,00)** → soft-archive + relatório completo entregue ao contador. Auditoria em `nfse_cancellation_log`.
- Índice único parcial `uq_nfse_history_active_per_invoice` em `nfse_history(invoice_id)` (garantia dura contra nova duplicidade).

---

## [Não publicado] - Faturamento: e-mail consolidado, ajuste de valor/desconto e reflexo na NFS-e

### Adicionado
- **E-mail consolidado boleto + NFS-e.** Quando a fatura tem NFS-e, o e-mail é retido na geração (`invoices.email_status='aguardando_nfse'`) e sai **um único** e-mail (boleto/PIX + nota) quando a NFS-e autoriza. Fallback em `poll-services`: se a nota falhar ou demorar (>6h), o boleto é liberado via `resend-payment-notification` para a cobrança não travar. Novo helper `buildPaymentSectionHtml` em `_shared/email-helpers.ts` (fonte única do bloco boleto/PIX). Indicador âmbar próprio na UI para o estado retido.
- **Ajuste de valor / desconto de fatura com auditoria.** `EditInvoiceDialog` ganhou campo **Motivo** (obrigatório) + referência do valor original; a mudança de valor/vencimento é registrada em `audit_logs` (`invoice_value_adjusted`, old→new + motivo). O dialog bloqueia vencimento no passado quando há boleto (o Asaas recusa).
- **Reflexo do novo valor na NFS-e (cancelar + reemitir).** Nova action `cancel_and_reissue_nfse` (+ `reissue_nfse` e helper `doReissue`) em `asaas-nfse`: cancela a nota autorizada e reemite com o novo valor, clonando os campos fiscais e ligando `nfse_history.nfse_substituta_id`. Trata cancelamento síncrono (reemite já) e **assíncrono** (via webhook `INVOICE_CANCELED` + flag `nfse_history.reissue_pending`). "Janela de cancelamento" = autoridade do Asaas/prefeitura (`CANCELLATION_DENIED` → nota mantida). UI: checkbox opcional no `EditInvoiceDialog`.
- **NFS-e autorizada dispara e-mail automaticamente** (webhook e `poll-services`), com marca/logo (`wrapInEmailLayout`) — antes só era manual.

### Corrigido
- **9 NFS-e de jun/jul que falhavam** ("non-2xx" genérico): causa raiz = clientes sem endereço/CEP (`CLIENT_INCOMPLETE_DATA`). 7 cadastros completados (dados da Receita) e notas re-emitidas.
- `webhook-asaas-nfse`: no cancelamento assíncrono confirmado, agora promove `nfse_cancellation_log` REQUESTED→CANCELLED (antes ficava preso em REQUESTED).

### Banco
- `nfse_history.reissue_pending` (boolean, default false); `email_processing_status += 'aguardando_nfse'`; backfill de endereço/CEP de 7 clientes.

---

## [Não publicado] - Limpeza: Hermes Bot setup e usuários E2E

### Removido
- **Card temporário "Configurar Hermes Bot"** em `/settings`: removido card, handler `handleSetupHermes`, state e imports órfãos (`Card`, `Bot`, `supabase`, `toast`) de `SettingsPage.tsx`.
- **Edge function `setup-hermes-bot`**: removida do código e do projeto Cloud (já não era necessária — o usuário bot `hermes@colmeiagsti.com.br` permanece ativo para a integração relay UniFi).
- **Usuários E2E de teste** purgados completamente do banco: `e2e-test@colmeiagsti.com.br` e `e2e-test-2@colmeiagsti.com.br`. Cascata: 2 chamados de teste, comentários, histórico, sessões e perfis. Ação registrada em `audit_logs` como `e2e_users_purged`.

---



## [Não publicado] - Retry automático de boletos com falha

### Corrigido
- **Boleto QUAZA TECNOLOGIA #511 (junho/2026) nunca foi criado no Asaas.** Causa raiz: na geração mensal de 09/06 a chamada `asaas-nfse/create_payment` retornou non-2xx; a fatura ficou com `boleto_status='erro'` e nenhum mecanismo automático reabria o caso — só aparecia no Painel de Saúde. Ação manual: vencimento reagendado para 20/06, boleto regerado (`pay_tw9hp8udg4y1pipi`) e evento `boleto_manual_recovered` gravado em `audit_logs`. Varredura confirmou que **nenhum outro cliente** foi afetado.

### Adicionado
- **Edge function `auto-retry-failed-boletos`**: busca faturas com `boleto_status='erro'`, sem `asaas_payment_id`, criadas há mais de 30 min e com `processing_attempts < 3`. Para cada uma, reagenda `due_date` se já passou (hoje + 3 dias úteis) e re-invoca o provedor correto (`asaas-nfse` ou `banco-inter`).
- **Agendamento pg_cron** `auto-retry-failed-boletos`: roda 4×/dia (08h, 12h, 16h, 20h America/Sao_Paulo).
- **Alerta proativo**: na 3ª falha consecutiva o sistema cria uma notificação `error` na categoria `billing` apontando para o Painel de Saúde, evitando que casos travados passem batido.
- Eventos novos em `audit_logs`: `boleto_manual_recovered`, `boleto_auto_recovered`.

---

## [Anterior] - Anti-duplicação de boletos + edição de cliente por técnicos


### Corrigido
- **Boletos duplicados no Asaas após alteração de CNPJ/endereço.** Causa raiz: `ClientForm` apenas marcava `asaas_payment_deleted_at`, e o caminho de drift em `create_payment` criava um boleto novo no Asaas sem cancelar o antigo, deixando 2+ cobranças ativas. Agora: (a) o drift detection em `asaas-nfse/create_payment` executa `DELETE /payments/{id}` no Asaas antes de limpar os campos locais, e (b) `ClientForm` chama `regenerate_payment` (que já cancela corretamente) para cada fatura pendente/atrasada do cliente, com concorrência limitada a 3.
- **Edição de e-mail/telefone/endereço de cliente por técnicos falhava silenciosamente.** Causa raiz: a tabela `public.clients` não tinha policy de UPDATE para a role `technician`, então `supabase.update()` retornava `error=null` mas afetava 0 linhas e o toast mostrava "Cliente atualizado" enganosamente. Correções: (1) nova policy `Technicians can update clients (except fiscal fields)` permitindo alterar todos os campos exceto `document` e `state_registration`; (2) `ClientForm` agora usa `.select("id")` no UPDATE e levanta erro explícito se nenhuma linha for retornada, prevenindo qualquer regressão futura de RLS.

### Auditoria
- Novo evento `asaas_payment_auto_cancelled` em `audit_logs` registra cada boleto cancelado pelo drift detection (motivo + correlation_id + payment_id antigo).

---



## [Não publicado] - Boleto Asaas: regeneração automática quando cadastro muda

### Corrigido
- **Boleto da Blend (#389) continuava com CNPJ antigo após atualização do cadastro.** O PDF do boleto é congelado pelo Asaas no momento da emissão, então mudar `clients.document` não atualizava o boleto já existente. Além disso, o pagamento havia sido `PAYMENT_DELETED` no Asaas mas a fatura continuava apontando para ele, devolvendo a URL morta. Causa raiz: a "idempotência" de `create_payment` reusava o `asaas_payment_id` sem validar se ele ainda existia nem se o CNPJ no Asaas batia com o local.

### Adicionado
- **`asaas-nfse / create_payment` — validação tripla antes de reusar boleto**: (1) verifica `asaas_payment_deleted_at`; (2) faz `GET /payments/:id` para detectar payment deletado/inexistente; (3) faz `GET /customers/:id` e compara `cpfCnpj` com o cadastro local — qualquer divergência dispara regeneração automática (cancela payment antigo, limpa colunas, apaga PDF do Storage, audita em `boleto_auto_regenerated`).
- **Nova action `asaas-nfse / regenerate_payment`**: cancela o payment atual, limpa `asaas_payment_id/boleto_url/boleto_barcode/pix_code`, remove PDF do Storage, exige `reason` (≥5 chars) e registra `boleto_regenerated` em `audit_logs`. A UI chama `create_payment` em seguida para emitir o novo.
- **UI — botão "Regerar Boleto"** no popover de ações da fatura (apenas Asaas + boleto existente + status pendente/atrasado). Confirmação com campo "Motivo" obrigatório (`RegenerateBoletoDialog`). Skill `ui-ux-pro-max` (regras `destructive-emphasis`, `confirmation-dialogs`, `error-clarity`).
- **Webhook `webhook-asaas-nfse`**: evento `PAYMENT_DELETED` agora marca `invoices.asaas_payment_deleted_at = now()` e `boleto_status='cancelado'`, fazendo a próxima `create_payment` regenerar automaticamente.
- **Sincronização proativa em `ClientForm`**: ao salvar mudança de CNPJ/endereço/CEP, dispara `asaas-nfse / sync_customer` e marca todas as faturas pending/overdue do cliente com `asaas_payment_deleted_at = now()` para forçar a regeneração na próxima emissão/segunda via.

### Migration
- `invoices.asaas_payment_deleted_at timestamptz` — sinalizador usado pela edge function para detectar boletos que precisam ser regenerados.

### Teste end-to-end executado
1. `sync_customer` → Asaas atualizado com CNPJ 46.381.469/0001-19.
2. `regenerate_payment` na fatura #389 → payment antigo (`pay_kn7v6jd2jv5oudws`) cancelado.
3. `create_payment` → novo `pay_9vhml6e7xr9exwvn`.
4. Download e inspeção do PDF: **Pagador BLEND SOLUTIONS COMPANY LTDA, CNPJ: 46.381.469/0001-19** ✓ (CNPJ correto).



## [Não publicado] - NFS-e: arquivamento em vez de exclusão (conformidade fiscal)

### Corrigido
- **Erro `DELETE_FAILED` por FK de `nfse_cancellation_log`** (`asaas-nfse / delete_record`): a função tentava `DELETE` físico em `nfse_history`, violando a FK do log de cancelamento e impedindo a "exclusão" da NFS-e #256 (Blend Solutions). Causa raiz: NFS-e não pode ser apagada por retenção fiscal de 7 anos.

### Mudado (conformidade fiscal)
- **NFS-e, boletos e logs financeiros não são mais apagados fisicamente.** Substituímos exclusão por arquivamento (`is_active=false`, `archived_at`, `archived_reason`).
- **Edge `asaas-nfse`**: action `delete_record` foi convertida em **soft-delete** (`archive_record`), e adicionada `restore_record`. O alias `delete_record` permanece por compatibilidade, mas nunca apaga linha — apenas arquiva. Exige `reason` (≥5 chars) e grava evento `archived` em `nfse_event_logs`.
- **Migration**: novos campos em `nfse_history` (`is_active boolean default true`, `archived_at`, `archived_reason`, `archived_by`) + índice parcial em `is_active=true` para acelerar a listagem ativa.

### UI — reorganização do painel da NFS-e (skill UI/UX Pro Max)
- Removidos os botões "Cancelar e Excluir" e "Excluir Registro" — violavam conformidade fiscal e poluíam a tela.
- Painel reorganizado em 3 grupos claros: **Ação principal** (uma única CTA por estado: Validar e reenviar / Cancelar NFS-e / Cancelar processamento), **Ajustes operacionais** (Editar, Alterar status) e **Conformidade e arquivo** (Arquivar registro / Restaurar registro).
- Novo `NfseArchiveDialog` substitui `NfseDeleteDialog` e `NfseCancelDeleteDialog` (removidos). Texto explica que arquivar não cancela nem apaga.
- Lista de NFS-e oculta arquivadas por padrão; novo toggle "Mostrar arquivadas" nos filtros.

## [Não publicado anterior] - Correção emissão Asaas (caso Calherão)

### Corrigido
- **Cancelamento de NFS-e retornava erro 500 após o Asaas aceitar o DELETE** (`asaas-nfse`): o Asaas pode responder cancelamentos com corpo vazio, e a função tentava executar `response.json()` mesmo assim. Agora lê como texto, aceita resposta vazia como sucesso e só tenta converter JSON quando houver conteúdo.
- **Boleto Asaas saía com CNPJ antigo após edição do cliente** (`asaas-nfse / create_payment`): a action só CRIAVA o cliente no Asaas quando `asaas_customer_id` era nulo — nunca fazia PUT. Resultado: qualquer alteração local de CNPJ/email não chegava ao Asaas e o boleto era emitido com os dados velhos. Agora chama o novo helper `ensureCustomerForPayment` que faz PUT em `/customers/{id}` antes de criar a cobrança (mesmo padrão já usado pela NFS-e).
- **Botão "Cancelar Boleto" sempre chamava `banco-inter`** (`BillingInvoicesTab.tsx`): faturas com `billing_provider = 'asaas'` falhavam no cancelamento porque a requisição ia ao provedor errado. Agora roteia por `invoice.billing_provider` — Asaas vai para `asaas-nfse/cancel_payment`, Inter continua em `banco-inter/cancel`. Vale para o botão individual e para o cancelamento em lote.
- **Cobrança duplicada por fatura no Asaas**: cada chamada de `create_payment` (uma para BOLETO, outra para PIX no mesmo "Emitir Completo") criava uma cobrança nova, deixando uma órfã no Asaas. Agora a action é idempotente: se a fatura já tem `asaas_payment_id`, reutiliza o mesmo payment (boleto + PIX coexistem na mesma cobrança Asaas) e, quando pedirem PIX, busca o QR Code do payment existente.

### Adicionado
- **`asaas-nfse / cancel_payment`**: nova action que faz `DELETE /payments/{id}` no Asaas, limpa `boleto_url`, `boleto_barcode`, `pix_code`, `asaas_payment_id`, marca `boleto_status='cancelado'` e grava em `audit_logs`. Bloqueia cancelamento de faturas já pagas.
- **`asaas-nfse / sync_customer`**: nova action leve para forçar PUT do cliente no Asaas (CNPJ/email/endereço). Usada para corrigir clientes que ficaram com dados antigos no Asaas, sem precisar emitir cobrança.

### One-shot manual (caso Calherão)
- Re-sincronizados os clientes `cus_000173909063` (Matriz) e `cus_000173909071` (Concreteira) no Asaas com os CNPJs corretos via `sync_customer`. As próximas emissões já sairão corretas.
- Para cancelar o boleto da fatura #371 que saiu com CNPJ antigo: agora basta clicar em "Cancelar Boleto" na interface (o roteamento corrigido vai chamar o Asaas).

## [Não publicado] - Validação do reajuste anual


## [Não publicado] - Validação do reajuste anual

### Corrigido
- **Reajuste anual sem aviso**: 26 contratos ativos (incluindo Gayger) estavam sem `adjustment_date`, então o cron `check-contract-adjustments` nunca os enxergava. Migração de backfill aplicada: `start_date + N anos` (próxima data futura) ou `hoje + 1 ano` quando não há `start_date`.

### Melhorado
- **`check-contract-adjustments`**: agora envia lembretes progressivos — **D-30** (info), **D-7** (warning), **D-0** (auto-aplica FIXO ou warning manual) e **D+1..D+30** (warning diário de vencimento). Idempotência via `contract_history` (`action='adjustment_reminder'` + `changes.bucket`) impede duplicatas no mesmo dia.
- **`ContractForm`**: ao criar contrato sem informar `adjustment_date`, o sistema preenche automaticamente com `start_date + 1 ano`, garantindo que o lembrete anual sempre dispare.

### Validado
- Persistência do reajuste: `apply-contract-adjustment` atualiza `contracts.monthly_value` e `contract_services.unit_value`. O cron `generate-monthly-invoices` lê `monthly_value × intervalMonths`, então o novo valor vale automaticamente para todas as próximas faturas (mensal, trimestral, semestral, anual) — inclusive Asaas, que usa pagamentos pontuais por fatura.

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.



O formato é baseado em [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere a versionamento semântico quando aplicável.

Categorias usadas em cada entrada:

- **Adicionado** — novas funcionalidades
- **Modificado** — mudanças em funcionalidades existentes
- **Corrigido** — correção de bugs
- **Removido** — funcionalidades removidas
- **Segurança** — correções de vulnerabilidades
- **Obsoleto** — funcionalidades marcadas como obsoletas

## [2026-05-31] — Refatoração da Edição de Contrato

### Modificado
- `EditContractPage` agora usa header sticky com identidade do contrato + barra de ações rápidas (Faturas, Histórico, Cobrança extra, Cancelar).
- `ContractForm` reorganizado em **6 abas**: Geral, Faturamento, Reajuste, Serviços, NFS-e, Avançado. Reduz o scroll vertical e separa intenções (salvar form vs aplicar reajuste).

### Adicionado
- `NextAsaasInvoicePreview` — bloco visual mostrando exatamente qual será a próxima cobrança gerada no Asaas com o valor atual do contrato (valor, vencimento, data de geração automática). Embutido no `ContractAdjustmentCard`.
- `ContractEditHeader` — header sticky com nome/cliente/status/valor sempre visível.
- `ContractQuickActions` — acesso direto a Faturas, Histórico, Cobrança extra e Cancelamento a partir da página de edição.

### Validado
- Fluxo de reajuste → Asaas conferido ponta-a-ponta: `apply-contract-adjustment` atualiza `contracts.monthly_value` → `generate-monthly-invoices` (cron 11h UTC) lê o novo valor → `asaas-nfse create_payment` cria cobrança nova no Asaas com o valor reajustado. Asaas não usa subscriptions neste projeto, então não há cobranças antigas para sincronizar.

---

## [Não lançado]

### Adicionado
- **Reajuste Anual — UI repaginada (skill ui-ux-pro-max):**
  - Novo `ContractAdjustmentCard` (substitui a antiga `ContractAdjustmentSection` em contratos existentes): mostra status colorido com countdown até o próximo reajuste, índice + tooltip explicativo, valor atual com cálculo por cobrança (mensal/trimestral/etc.), última atualização e histórico colapsável.
  - Novo dialog `ContractRenegotiationDialog` para registrar mudanças de escopo (upgrade/downgrade) — grava em `contract_history(action='renegotiation')` sem mexer em `contract_adjustments` nem na data do próximo reajuste.
  - Nova `ContractAdjustmentConfigSheet` para alterar apenas data/índice/percentual fixo sem aplicar reajuste.
  - Novo hook `useContractAdjustmentHistory` (combina `contract_adjustments` + `contract_history` em timeline unificada).
  - Novo hook `useLatestEconomicIndex` (lê último IGPM/IPCA/INPC acumulado 12m de `economic_indices`).
- **`ContractAdjustmentDialog` melhorado:**
  - Pré-visualização em tempo real do impacto (valor mensal, por cobrança, próxima data).
  - Atalho "Buscar atual" preenche automaticamente o % com o índice mais recente.
  - Campo "Data de vigência" (default hoje).
  - `AlertDialog` de confirmação antes de aplicar.

### Modificado
- `ContractForm`: campo `monthly_value` (CurrencyInput manual) só aparece em **contratos novos**. Em contratos existentes, valor é alterado exclusivamente via Aplicar Reajuste / Registrar Renegociação.
- Alerta visual amarelo mantido para edição direta de `monthly_value` via serviços, orientando o uso dos botões corretos.
- Contrato AIRDUTO: registrado `renegotiation` em `contract_history` (R$ 1.500 → R$ 2.300) e definida `adjustment_date` para 2027-05-30.

### Validado
- Contrato **Gayger** (R$ 50/mês trimestral): cron `generate-monthly-invoices` vai gerar 1 fatura R$ 150,00 no dia 02/06/2026 (janela `days_before_due=5` a partir do vencimento 07/06). Cadência trimestral garantida pelo gate `monthsSince >= intervalMonths` em `index.ts:341-375`.



### Corrigido (Cobrança por frequência não respeitava o intervalo — 2026-05-23)
**Bug em produção:** contrato com `billing_frequency` diferente de mensal (trimestral, bimestral, semestral, anual) cobrava apenas 1 mês em vez do período completo. Ex.: contrato trimestral de R$50/mês gerava fatura de R$50 em vez de R$150 (50×3).

**Causa raiz:** o `intervalMonths` derivado da frequência era usado apenas para decidir SE a fatura seria gerada naquele mês (pulando os meses intermediários — lógica correta), mas o **valor** da fatura usava `monthly_value` puro, sem multiplicar pelo intervalo.

**Corrigido nos 2 caminhos de geração:**
- `generate-monthly-invoices` (cron): `recurringAmount = monthly_value × intervalMonths`. Cobranças adicionais (`contract_additional_charges`) NÃO são multiplicadas (têm valor próprio por competência).
- `ContractForm` (fatura inicial via `generate_initial_invoice`): mesmo cálculo, usando `FREQUENCY_INTERVAL_MONTHS` baseado em `billing_frequency`.

A nota da fatura passou a indicar o período coberto (ex.: "Fatura 3 meses (quarterly)"). A lógica de pular meses intermediários no cron já estava correta e não foi alterada.

**Não alterado:** `InvoiceForm` (fatura manual) continua pré-preenchendo 1 mês — é editável pelo operador antes de salvar.

**Faturas passadas:** as já geradas com valor errado foram corrigidas manualmente pelo Jonatas. Os fixes valem daqui pra frente.

**A validar em runtime:** caso de borda onde `reference_month` da fatura inicial (via `first_payment_date` futuro) diverge do mês do cron — testar com um contrato trimestral real (fatura inicial ×3 + cron pulando no mês seguinte).

---

### Refatorado (Sessão de refatoração estrutural — 2026-05-23)
Objetivo da sessão: enxugar e reorganizar o projeto ("reduzir, compactar, reutilizar"). Auditoria inicial: 86.514 LOC / 372 arquivos (~79k sem types.ts auto-gerado), components/ = 70% do código. Veredito da auditoria: o projeto NÃO estava "cheio de lixo" — já passara por 3 fases de refatoração (Fases 1-3, -1.700 LOC). Pouco código morto e baixa duplicação real. Ganhos capturados de forma cirúrgica e segura, sem reescrita.

**Código morto removido (-1.178 LOC, zero risco, tsc verde após cada remoção):**
- `components/inventory/DeviceDetailsPanel.tsx` (órfão)
- `lib/nfse-validation.ts` (validateNfseData nunca chamado)
- `components/settings/UserForm.tsx` (órfão após fluxo de convite)
- `pages/Index.tsx` (boilerplate "Welcome to Your Blank App" do Lovable; rota / usa Dashboard)
- `components/inventory/MetricGauge.tsx` (órfão)
- `components/ui/chart.tsx` + `components/ui/toggle.tsx` (shadcn scaffold nunca usado)

**Consolidação de ConfigForms de integração (hook useIntegrationSettings):**
Criados `src/hooks/useIntegrationSettings.ts` (centraliza load/save contra `integration_settings`, com callbacks opcionais `onAfterLoad`/`beforeSave`) e `src/components/settings/integrations/IntegrationConfigCard.tsx` (shell visual). 6 ConfigForms migrados, eliminando ~40 LOC duplicadas de load/save cada: Telegram (231→120), TacticalRmm (293→214), CheckMk (322→255), EvolutionApi (273→215), GoogleCalendar (285→231), Asaas (726→648, com callbacks para preservar geração do webhook_token). NÃO migrados por decisão: NoContactCheck e Unifi (usam React Query, padrão diferente), Resend (será removido na migração de email), BancoInter (lógica própria de webhook/certificado — risco não compensa).

**Split de legibilidade dos 3 maiores arquivos (via Lovable, sem alterar lógica/UX/validação):**
- `ContractForm.tsx` 1232→754: extraídas seções para `contracts/sections/` (ContractBillingSection, ContractAdjustmentSection, ContractInternalNotesSection, ContractNfseSection, DatePickerField). Schema Zod e mutation intactos; seções recebem `form` via props.
- `NfseDetailsSheet.tsx` 1173→982: extraídos para `billing/nfse/details/` (NfseEditForm, NfseCancelDialog, NfseDeleteDialog, NfseCancelDeleteDialog). Nenhuma regra fiscal/payload/edge function tocada; máquina de estados e mutations no principal.
- `BillingInvoicesTab.tsx` 1106→1021: extraído hook `billing/hooks/useInvoiceFilters.ts` (filtros + paginação + sync URL) + `NewInvoiceDialog.tsx` + `CancelInvoiceAlertDialog.tsx`. Batch processing e os 7 dialogs já-componentes preservados.

**Nota de método:** split de arquivo grande aumenta LOC total (props/boilerplate por componente) mas melhora legibilidade — era o objetivo declarado. Reescrita completa foi avaliada e DESCARTADA: 79k LOC funcionais em produção com 32 clientes, sem gargalo de performance medido; reescrever reintroduziria meses de bugs de domínio já corrigidos.

**Reorganização de pastas (passo 3):** pasta resíduo `financial/` (3 componentes que pertenciam a billing: EmitNfseDialog, InvoiceForm, PixCodeDialog) consolidada em `billing/` via git mv. Demais pastas pequenas mantidas (domínio correto, crescem com o roadmap).

**Pendente:** retomar roadmap Seção 4.5 CMDB (passo 4).

---

### Adicionado (Fluxo de convite admin — fecha causa-raiz dos órfãos — 2026-05-19)
**Motivação:** após hotfix dos 10 órfãos (entrada anterior), decisão arquitetural de eliminar a causa-raiz: bloquear signup público e exigir convite admin para criação de qualquer conta. Decisão alinhada com multi-tenancy futura (SaaS exige convite, não signup aberto).

**Migration `20260519185808` (aplicada manualmente em produção):**
- Tabela `pending_invites` (id, email, role, client_id, full_name, invited_by, token UUID, expires_at, accepted_at). CHECK constraint garante que role cliente exige `client_id` e role staff não pode ter.
- RLS: apenas staff (`is_staff`) vê/cria/edita/deleta convites. Convidador é forçado a `invited_by = auth.uid()` no INSERT.
- Trigger `enforce_invite_on_signup` em `auth.users BEFORE INSERT`: bypass para `service_role` (admin SDK), rejeita qualquer outro INSERT que não tenha convite pendente válido no email. Mensagem amigável: "Cadastro público desabilitado. Solicite acesso ao administrador."
- RPC `accept_invite(p_token)` SECURITY DEFINER: valida token + expiração + match de email + cria role + cria `client_contacts` (se cliente) + cria `profile` + marca aceito. **Mata role 'client' default** criada pelo trigger `handle_new_user` quando o convite é para staff ou client_master, evitando role dupla que quebraria `is_staff()`.
- RPC `get_invite_info(p_token)` STABLE SECURITY DEFINER, executável por `anon`: retorna info pública do convite (nome do cliente, role, expires_at) para a tela `/setup-account` mostrar antes do usuário criar a senha.
- RPC `find_valid_invite(p_email)` helper interna.

**Edge functions:**
- `invite-user`: bloqueia se já existe user OU convite pendente, cria registro em `pending_invites`, gera URL `/setup-account?token=...`, envia email branded via `send-email-resend` (reusa `email-helpers.ts`). Rate limit 20/min por admin. Audit log no sucesso e na falha de email (HTTP 207 quando convite criado mas email falhou).
- `resend-invite`: estende validade em +7 dias e reenvia. Rate 30/min.
- `revoke-invite`: marca `expires_at = now()`. Rate 30/min.

**Frontend:**
- Nova página `/setup-account`: lê token da URL, chama `get_invite_info` para mostrar info, oferece form de criação de senha. Após signUp + signIn + accept_invite, redireciona conforme role (`/portal` para cliente, `/` para staff).
- `/register` virou página informativa "Cadastro por convite" — sem formulário de signup.
- `/login`: link "Cadastre-se" mudou para "Acesso por convite".
- `/settings/users` ganhou aba "Convites pendentes" com tabela (status pendente/expirado/aceito derivado em JS), botões "Convidar Cliente" + "Convidar Staff", ações Reenviar/Revogar/Renovar/Ver usuário.
- Sidebar `AppSidebar` mostra badge com contador de convites pendentes via `usePendingInvitesCount` (refetch 60s, resiliente se a tabela ainda não existe).
- `ClientUsersList` (criação de usuário dentro do detalhe do cliente) refatorada para usar `invite-user` em vez de criar conta com senha definida pelo admin.

**Removido:**
- Edge function `create-client-user/` (substituída integralmente por `invite-user`).
- Mutation `createUserMutation` e import `UserForm` no `UsersTab.tsx` (não mais necessários).

**Pendente de aplicação manual:**
- Secret `APP_URL=https://suporte.colmeiagsti.com` no Lovable Cloud (Secrets) — sem ele, `invite-user` cai no fallback do default mas é boa prática configurar explicitamente.

**Não testado ainda em produção:** Jonatas vai testar depois (convidar email teste, validar email recebido, validar `/setup-account` → criação de senha → redirect).

**Os 10 órfãos atuais não foram afetados:** continuam funcionando porque o trigger só roda em INSERTs futuros em `auth.users`.

**Validação técnica realizada:**
- TypeScript zero erros após merge.
- Migration aplicada com sucesso (`tabela=1, trigger=1, funcoes=4`).
- 2 bugs corrigidos pré-aplicação (commit `b88e563`): (1) role default duplicada quando convite é staff; (2) JOIN PostgREST em `pending_invites_invited_by_fkey` que não existe — substituído por JOIN manual via id.

---

### Corrigido (Hotfix — 10 clientes órfãos sem client_contacts + hardening RPC portal — 2026-05-19)
**Reportado em produção:** múltiplos clientes não conseguiam abrir chamados pelo portal, recebendo toast "Erro ao abrir chamado / Contato do cliente não encontrado ou inativo". Caso piloto: `fernanda@airduto.com.br`.

**Causa raiz:** signup público no portal cria `auth.users` + `user_roles(role='client')` automaticamente via trigger, mas o vínculo `client_contacts.user_id` precisa de ação manual administrativa. 10 usuários ficaram em estado órfão (conta válida, role correto, mas sem `client_contacts` apontando para eles) entre 23/02 e 12/05/2026. A RPC `open_client_portal_ticket` lançava mensagem genérica que não distinguia esse caso de "contato inativo" nem de "sem cliente vinculado", mascarando a causa real.

**Correção em 2 frentes:**

**Frente A — Vínculo dos órfãos (decisão por domínio do email):**
Após query de match por domínio + razão social, 7 órfãos foram auto-vinculados (4 AIRDUTO, 1 MACOPAN, 2 BLEND, 1 CLUBE COMERCIAL) e 3 ficaram pendentes (`@gmail.com` da rede Mad Boards/Madness, cujo cliente ainda não está cadastrado). Vínculo executado manualmente pelo Jonatas via SQL no Supabase Dashboard.

**Frente B — Hardening da RPC `open_client_portal_ticket` (migration `20260519175933_harden_open_client_portal_ticket`):**
Substitui a versão anterior por uma que:
- Distingue 5 causas de falha com mensagens específicas: sessão expirada, usuário sem contato, contato inativo, contato sem cliente vinculado, sem role de cliente.
- Aceita telefone com 10–13 dígitos (suporta prefixo +55 internacional, antes só 10–11).
- Valida `category_id` (existe E `is_active=true`) antes do INSERT.
- Valida que `asset_id` e `monitored_device_id` pertencem ao mesmo cliente do contato.
- Aplica `btrim()` em todos os campos de texto antes de gravar/validar (evita títulos só com espaços passarem na validação de tamanho).
- Encapsula o INSERT em bloco `BEGIN/EXCEPTION WHEN OTHERS` com `GET STACKED DIAGNOSTICS` — qualquer erro de trigger/constraint downstream retorna `Falha ao criar chamado [SQLSTATE]: MESSAGE` em vez de mensagem genérica.

**Frente C — Frontend `ClientTicketForm.tsx`:**
`onError` agora loga `message + details + hint + code` do `PostgrestError` no console e o toast nunca fica vazio: cascata de fallbacks (`message → details → hint → "Código X" → fallback genérico final`). Antes só lia `error.message` e em alguns casos o toast vinha em branco.

**Validação:** Fernanda Zanette (Airduto) confirmou abertura bem-sucedida após aplicar a migration. Mensagem de erro agora é específica e acionável para todos os cenários de falha futuros.

**Não resolvido (registrado em REFACTORING_ROADMAP.md):**
- Signup público no portal ainda cria role `client` sem vínculo em `client_contacts` — qualquer pessoa pode criar conta e ficar órfã. Precisa de uma das soluções: (a) bloquear signup público e exigir convite admin, (b) auto-vincular no signup por domínio com confirmação posterior, ou (c) criar painel admin `/settings/orphan-contacts` que lista usuários `client` sem vínculo. Decisão pendente.
- 3 órfãos Mad Boards/Madness aguardando cadastro do cliente.

---

### Modificado (Refatoração — Abertura de chamados unificada: admin + portal — 2026-05-12)
**Motivação:** após restaurar a abertura pelo portal (entrada anterior), auditoria revelou problemas estruturais na criação de chamados em ambos os caminhos (admin + portal): (1) `TicketForm.tsx` admin com wizard de 3 steps e 4 inserts paralelos sem transação (`tickets` + `ticket_history` + `ticket_tag_assignments` + edge function), risco de inconsistência; (2) dois campos lado a lado para "dispositivo" no portal (`asset_id` do CRM vs `monitored_device_id` do RMM) confundindo o cliente — apesar de servirem a propósitos diferentes (RMM = computador com agente; assets = ativo catalogado); (3) telefone perguntado do zero em cada abertura, mesmo o sistema já sabendo o número via `client_contacts.phone` do user logado; (4) lógica de phone/whatsapp/device duplicada entre os dois forms; (5) `useFormPersistence` (draft) ativo só no admin.

**Correção:**

**A. Nova RPC `create_staff_ticket` (migration `20260512131803`):**
- `SECURITY DEFINER` com `SET search_path = public`, restrita a staff via `is_staff(auth.uid())`.
- Recebe `p_ticket_type` (`external` | `internal` | `task`) e todos os campos do ticket + `p_tag_ids uuid[]`.
- Executa atomicamente: `INSERT tickets` → `INSERT ticket_history` → loop `INSERT ticket_tag_assignments`. Falha em qualquer ponto faz rollback do todo.
- Validações no servidor: tamanhos, telefone (10–11 dígitos), XOR `monitored_device_id ↔ device_hostname_text`, obrigatoriedade de `client_id` em external. Erros lançados com `ERRCODE='P0001'`.
- `first_response_at` setado automaticamente quando `assigned_to IS NOT NULL` (status vira `in_progress`).
- `GRANT EXECUTE ... TO authenticated`.

**B. Componente compartilhado `src/components/tickets/shared/DeviceSelector.tsx` (~180 LOC):**
- Um único `<Select>` agrupado com 3 grupos visuais: **Computadores monitorados (RMM)** com indicador online/offline, **Outros ativos do cliente** (assets do CRM), **Outro / não sei** (texto livre).
- Backend continua salvando em colunas distintas (`monitored_device_id` ou `asset_id` ou `device_hostname_text`) — apenas o frontend é unificado.
- Sem clientes/assets cadastrados? Cai direto em input livre, evitando dropdown vazio.

**C. Novo `src/components/client-portal/ContactBlock.tsx` (~130 LOC) — telefone com pré-preenchimento inteligente:**
- Recebe `defaultPhone` e `defaultIsWhatsapp` do `client_contacts` do user logado.
- Radio buttons "Falar com você (Nome · telefone)" vs "Outra pessoa". Caminho "você" tem campos travados (apenas confirma); "outra pessoa" libera edição.
- Sem telefone padrão no contato? Força modo "outra pessoa" + banner amarelo solicitando preenchimento.
- Atende necessidade operacional levantada pelo Jonatas: chamados frequentemente são abertos por funcionários diferentes do contato cadastrado.

**D. `TicketForm.tsx` admin reescrito (792 → 609 LOC):**
- **Wizard de 3 steps eliminado** — tudo em form único, scroll vertical, staff vê tudo de uma vez.
- Mutation chama `create_staff_ticket` (1 RPC) em vez de 3 inserts paralelos. `send-ticket-notification` segue fire-and-forget, só para `external`.
- Usa `DeviceSelector` compartilhado (substituindo lógica inline).
- Telefone pré-preenchido automaticamente ao selecionar contato (lê `phone` ou `whatsapp`, marca `is_whatsapp` se `notify_whatsapp=true` ou se veio do campo `whatsapp`).
- `useFormPersistence` mantido com key `ticket_new`.

**E. `ClientTicketForm.tsx` portal reescrito (339 → 246 LOC):**
- Usa `DeviceSelector` (substituindo os 2 campos lado a lado anteriores).
- Usa `ContactBlock` com `defaultPhone`/`defaultIsWhatsapp` do contato logado.
- Adicionado `useFormPersistence` com key `ticket_portal` (paridade com admin).
- Adicionado `KBSuggestions` (deflexão antes de abrir, mesma feature do admin).
- Bloco "Avançado" (collapse) contendo Prioridade + Categoria (defaults: `medium`, sem categoria).

**F. `ClientPortalPage.tsx` + `NewTicketDialog.tsx`:**
- Query `client-user` agora também retorna `name, phone, whatsapp, notify_whatsapp` do contato.
- `NewTicketDialog` recebe e propaga `contactName`/`defaultPhone`/`defaultIsWhatsapp` para o form.

**G. Limpeza:**
- `src/lib/ticket-payload.ts` removido — lógica vivia no client, agora vive na RPC server-side (`create_staff_ticket` para staff, `open_client_portal_ticket` para portal).
- `src/test/integration/create-ticket.test.tsx` removido — testava a função pura que foi eliminada; testes equivalentes para as RPCs serão adicionados quando implementarmos testes de integração contra Supabase real.
- `framer-motion` (wizard transitions) removido do `TicketForm`.

**Saldo:** ~-126 LOC + 2 componentes reutilizáveis novos + 1 RPC transacional. **Cliques para abrir um chamado típico no portal: de 8 para 3** (título, descrição, "Abrir"). Telefone confirma com 1 clique em vez de digitar.

**Validação:** `npx tsc --noEmit` zero erros. `npx vitest run` 116/116 testes verdes. **Migration `20260512131803_create_staff_ticket_rpc.sql` precisa ser aplicada manualmente no Supabase antes do deploy do código** (Jonatas confirmou que aplica).

**Não alterado:** `send-ticket-notification` edge function, `TicketRatingDialog`, `TicketDetails`, RPC `open_client_portal_ticket`.

---

### Corrigido + Modificado (Refatoração — Portal do Cliente: abertura de chamados — 2026-05-12)
**Reportado pelo usuário em produção:** clientes não conseguiam abrir chamados pelo portal (`/client-portal`). Toast genérico "Erro ao abrir chamado" mascarava a causa real.

**Causa raiz:** três policies de INSERT sobrepostas em `tickets`, sendo a do portal frouxa demais (validava apenas `role`, não exigia `requester_contact_id` vinculado ao `auth.uid()`). Em alguns cenários o INSERT passava mas a policy de SELECT bloqueava o ticket recém-criado por inconsistência no vínculo `client_contacts.user_id ↔ tickets.requester_contact_id`, resultando em "sumiço" silencioso. Soma-se a isso: `ClientPortalPage.tsx` com 1059 LOC, ~250 LOC duplicadas em relação a `TicketForm.tsx` (admin), validação ad-hoc sem Zod, e `onError` que descartava `error.message` do Supabase.

**Correção (3 partes, PR único):**

**A. Migration `20260512043108` — RLS consolidada + RPC SECURITY DEFINER:**
- `DROP` das policies antigas `"Users can create tickets"` e `"Client users can create tickets"`.
- `CREATE` da policy única `"Tickets INSERT consolidated"` exigindo (para cliente): `requester_contact_id IS NOT NULL` + `EXISTS` em `client_contacts` casando `id`, `user_id=auth.uid()`, `client_id` e `is_active=true` + `origin='portal'`. Staff segue criando livremente via `is_staff()`.
- Nova RPC `open_client_portal_ticket(...)` `SECURITY DEFINER` com `SET search_path = public`: resolve `contact + client` a partir de `auth.uid()`, valida role/tamanhos/telefone (10–11 dígitos) e XOR `monitored_device_id ↔ device_hostname_text`, faz `INSERT` em `tickets` e em `ticket_history` (estado inicial), retorna `ticket_id`. Erros lançados com `ERRCODE='P0001'` para mensagem amigável no frontend.
- `GRANT EXECUTE ... TO authenticated`.

**B. `src/lib/ticket-payload.ts`:**
- Tipo `TicketType` estendido com `"portal"` (mantém retrocompatibilidade com `external`/`internal`/`task`).
- Branch força `origin='portal'`, `is_internal=false`, sem `sla_deadline` (definido server-side).
- Caso de teste novo em `src/test/integration/create-ticket.test.tsx` cobrindo o branch (64/64 testes verdes).

**C. UI refatorada — `src/components/client-portal/ClientTicketForm.tsx` (novo):**
- `react-hook-form` + `zodResolver` (mesmo padrão do admin).
- Mutation chama `supabase.rpc('open_client_portal_ticket', {...})`; em caso de erro propaga `error.message` real (não mais texto genérico).
- Constraint XOR validada no Zod (`refine`), evita request inválido.

**D. Quebra de `ClientPortalPage.tsx` (1059 → 200 LOC):**
- `src/pages/client-portal/components/ClientPortalHeader.tsx` (~30 LOC)
- `src/pages/client-portal/components/ClientPortalNav.tsx` (~25 LOC)
- `src/pages/client-portal/components/ClientTicketsList.tsx` (~150 LOC, 3 tabs unificadas)
- `src/pages/client-portal/components/ClientTicketDetailPanel.tsx` (~110 LOC, painel + comentários)
- `src/pages/client-portal/components/NewTicketDialog.tsx` (~25 LOC, wrapper)
- `src/pages/client-portal/components/portal-types.ts` (tipos + labels/colors compartilhados)
- `src/lib/phone.ts` (novo): `formatPhone`, `stripPhone`, `isPhoneValid` centralizados (eliminou duplicação).

**Saldo:** ~-300 LOC líquidas, zero código duplicado entre portal e admin, `TicketForm.tsx` admin intacto.

**Validação em produção (2026-05-12):** abertura de chamado pelo portal confirmada pelo usuário ("chamado criado com sucesso").

**Prevenção:** RPC SECURITY DEFINER elimina caminho de INSERT direto pelo cliente — toda criação via portal passa por validação centralizada. Policies RLS de SELECT continuam exigindo vínculo correto, mas agora é estruturalmente impossível criar ticket inconsistente.

---

### Corrigido (Hotfix — Card "Recebido" somava amount em vez de paid_amount — 2026-05-08)
**Reportado pelo usuário em produção:** mesmo após o hotfix anterior (PR #31), o card "Recebido" mostrava valor incorreto (R$ 9.021,68 quando o real era menor).

**Causa raiz:** a query somava `r.amount` (valor da fatura) em vez de `r.paid_amount` (valor efetivamente recebido). Quando uma fatura tinha pagamento parcial — `amount=R$ 1.000` mas `paid_amount=R$ 500` — entrou só R$ 500 no caixa, mas o card mostrava R$ 1.000.

**Correção:**
- `select("amount, paid_amount, paid_date")` para invoices pagas (era só `amount, paid_date`)
- Função `sumPaidAmount(rows)` específica para o card "Recebido" — soma `paid_amount`
- Fallback `paid_amount ?? amount ?? 0` para casos edge (invoice marcada `paid` sem `paid_amount` registrado)
- Mantido `sumAmount(rows)` para "A Receber" e "Vencido" (valores nominais a receber, não efetivos)

**Comentário corrigido:** o hotfix anterior afirmava que a view `accounts_receivable` "calcula `ar_status` dinamicamente baseado em `due_date < hoje`" — **errado**. A view faz apenas alias do enum `invoices.status` (`pending` → `em_aberto`, `overdue` → `atrasado`, `paid` → `pago`). O campo dinâmico (não usado aqui) chama-se `is_overdue`. Comentários atualizados para refletir a realidade da view.

**Lição registrada:** ao tocar em totalizadores financeiros, **sempre validar com SQL no banco real** os valores antes de assumir que a fonte está correta. Diferença `amount` vs `paid_amount` é semântica crítica (faturado vs recebido).

### Corrigido (Hotfix — Fonte incorreta dos totalizadores em BillingInvoicesTab — 2026-05-08)
**Reportado pelo usuário em produção:** valores dos totalizadores "A Receber / Vencido / Recebido" estavam errados (não batiam com a realidade visível na lista).

**Causa raiz:** a query `globalSummary` usava o enum `invoices.status` literal (`pending`/`overdue`/`paid`), enquanto o `AccountsReceivableTab` antigo (deletado na Fase 3.C.3) usava a view **`accounts_receivable`** com campo derivado `ar_status` calculado dinamicamente baseado em `due_date < hoje`. Diferença crítica:
- View: status calculado em **tempo real** (atrasado se `due_date < hoje` independente do enum)
- Enum direto: depende do cron rodar pra mudar `pending` → `overdue`

Resultado: invoices que **deveriam estar como atrasadas** apareciam em "A Receber" porque o enum no banco estava desatualizado.

**3 bugs adicionais corrigidos no mesmo PR:**

1. **queryKey sem dependência de período** — `queryKey: ["invoices-global-summary"]` não incluía `fromISO`/`toISO`. Quando o usuário trocava o filtro de período (Mês Atual → 30 dias → 90 dias), a query não refazia. Agora: `["invoices-global-summary", fromISO, toISO]`.
2. **Soma sem cast Number()** — `(rows).reduce((s, r) => s + r.amount, 0)`. PostgreSQL retorna campos `numeric` como **string** em JSON. `0 + "100"` retorna `"0100"` (concatenação de string), não 100. Agora: `Number(r.amount || 0)`.
3. **Fonte equivocada** — usava `invoices` direto em vez da view `accounts_receivable` que tem a regra de negócio embutida (compara `due_date` com `hoje`).

**Equivalências documentadas no código:**
- `ar_status='em_aberto'` = `pending` E `due_date >= hoje` → "A Receber"
- `ar_status='atrasado'` = `pending` E `due_date < hoje`, OU `status='overdue'` → "Vencido"
- `ar_status='pago'` = `status='paid'` → "Recebido"

**Lição registrada:** quando uma view/RPC já existe no banco para encapsular uma regra de negócio, **usar essa view** em vez de tentar reproduzir a regra em queries direta. A view é a fonte de verdade.

### Corrigido (Hotfix — Remover totalizador duplicado em BillingInvoicesTab — 2026-05-08)
**Reportado pelo usuário em produção:** após a Fase 3.C.1, a tab Faturas mostrava **2 totalizadores idênticos** com os mesmos valores ("Em Aberto / Atrasado / Pago" no topo + "A Receber / Vencido / Recebido" abaixo dos filtros). Erro meu: ao adicionar `<InvoiceTotalsBar>` na 3.C.1 não percebi que já existia um Summary Chips inline pré-existente. Violei o próprio princípio "REUTILIZAR antes de criar".

- **Removido** `src/components/billing/InvoiceTotalsBar.tsx` (85 LOC) — componente foi usado apenas em 1 lugar (BillingInvoicesTab) e duplicava info já existente. Não atende critério "≥2 cópias".
- **Removido** import e uso do `<InvoiceTotalsBar>` em `BillingInvoicesTab.tsx` (3 linhas).
- **Mantido** "Summary Chips" inline pré-existente (linhas 489-503) com layout compacto integrado aos filtros — usa `totalPending`/`totalOverdue`/`totalPaid` calculados localmente. Esses chips já existiam antes da Fase 3 e estavam funcionando corretamente.
- **Lição registrada:** auditar o componente-alvo COMPLETO antes de adicionar funcionalidade nova. Em caso de novo somatório/totalizador, primeiro verificar se já existe um.

### Removido (Fase 3.C.3 — Remoção efetiva das tabs deprecated — 2026-05-08)
**Finale da consolidação de tabs.** Após 3.C.1 (estender Faturas com features) e 3.C.2 (compat redirects + ocultar do menu), agora removo de fato os 3 componentes deprecated. **-2.031 LOC líquidas.**

**Arquivos removidos:**
- `src/components/billing/BillingBoletosTab.tsx` (857 LOC) — funcionalidades absorvidas pelo filtro `payment_method=boleto` em Faturas
- `src/components/billing/AccountsReceivableTab.tsx` (312 LOC) — funcionalidades absorvidas pelo `<InvoiceTotalsBar>` + filtro `status=pending` em Faturas
- `src/components/billing/BillingErrorsPanel.tsx` (834 LOC) — funcionalidades absorvidas pelo filtro `with_errors` (estendido na 3.C.1) em Faturas

**Mudanças em `BillingPage.tsx`:**
- Removidos imports dos 3 componentes
- Removidos 3 `<TabsContent value="...">`
- `BILLING_TABS` reduzido de 11 → **8 entradas** (remoção de receivable, boletos, errors)
- `getTabBadge` simplificado: badge da tab "Faturas" agora consolida `overdueInvoices + errorCount` (substitui badge separado de "Erros"). Badge separado de "Boletos" (processingBoletos) removido — informação não crítica para operação diária
- Removidos imports de icons não usados (`Barcode`, `AlertTriangle`, `DollarSign`)
- Removido check `if ("deprecated" in tab && tab.deprecated)` no `.map()` — não há mais tabs deprecated
- **Redirect mantido** — `?tab=boletos|receivable|errors` continua redirecionando para `?tab=invoices&...` (compat com links salvos antigos)

**Resultado da Fase 3 completa (3.A → 3.B → 3.C.1 → 3.C.2 → 3.C.3):**
- BillingPage: 11 → **8 tabs** (-27% de tabs)
- LOC removidas: **-2.031** (apenas 3.C.3)
- LOC reusáveis criadas (Fases 3.A, 3.B, 3.C.1): +375 (`<InvoiceStatusFilter>`, `<InvoiceTableRow>`, `<InvoiceTotalsBar>`)
- Saldo da Fase 3 inteira: **~-1.700 LOC líquidas** com features unificadas
- 1 só tela de cobranças: filtros de status (com 'Com Erros' avançado) + payment_method (Boleto/PIX/Transferência) + período + busca + totalizadores Em Aberto/Atrasado/Pago

### Adicionado (Fase 3.C.2 — Redirects de URLs antigas + ocultação de tabs deprecated — 2026-05-08)
Segunda parte da consolidação de tabs. Tabs Boletos / A Receber / Erros **somem do menu** mas URLs antigas continuam funcionando via redirect automático (compat layer). Não remove código ainda — Fase 3.C.3 fará a remoção real.

- **`BillingPage.tsx`** — adicionado `useEffect` de redirect que detecta tabs deprecated na URL e troca para `?tab=invoices` com filtros aplicados:
  - `?tab=boletos` → `?tab=invoices&pm=boleto`
  - `?tab=receivable` → `?tab=invoices&status=pending`
  - `?tab=errors` → `?tab=invoices&status=with_errors`
  - Usa `setSearchParams(..., { replace: true })` — não polui histórico do navegador
- **`BILLING_TABS`** — 3 tabs marcadas com `deprecated: true` (receivable, boletos, errors). No `.map()` que renderiza o menu, `if ("deprecated" in tab && tab.deprecated) return null` — não aparecem mais como aba clicável. O componente da tab e a query continuam disponíveis (TabsContent ainda existe), só não há gatilho visual.
- **`TabsList`** — grid ajustado de `md:grid-cols-11` para `md:grid-cols-8` (3 tabs ocultas).
- **`BillingInvoicesTab.tsx`** — inicialização de filtros via URL params:
  - `searchParams.get("status")` → `statusFilter` inicial
  - `searchParams.get("pm")` → `paymentMethodFilter` inicial (validação contra valores aceitos)
  - **Comportamento:** clicar em link salvo `?tab=invoices&pm=boleto&status=overdue` abre Faturas com filtros já aplicados, sem clicks adicionais.
- **Resultado UX**: usuário que tinha link salvo para "Boletos" continua chegando lá (na nova versão unificada). Usuário novo vê BillingPage com 8 tabs em vez de 11.
- **Saldo**: +49 LOC (compat layer). Remoção real só na Fase 3.C.3.

### Adicionado (Fase 3.C.1 — Estender BillingInvoicesTab para absorver A Receber + Erros + Boletos — 2026-05-08)
Primeira parte da consolidação de tabs. Adiciona à BillingInvoicesTab as features que hoje estão em tabs separadas (`AccountsReceivableTab`, `BillingBoletosTab`, `BillingErrorsPanel`). Tabs antigas **continuam funcionando** — serão removidas só nas Fases 3.C.2 (redirects) e 3.C.3 (remoção).

- **`src/components/billing/InvoiceTotalsBar.tsx` (novo, ~85 LOC)** — barra de totalizadores reusável (Em Aberto / Atrasado / Pago) calculada via `useMemo` a partir das invoices já carregadas. Aceita prop `showPaid` para esconder card de pago em contextos onde não relevante. Substitui o trio de cards inline em `AccountsReceivableTab`.
- **`useInvoices.ts`** — filtro `with_errors` estendido para incluir caso "deveria ter boleto mas não tem":
  - **Antes:** apenas `boleto_status=erro OR nfse_status=erro OR email_status=erro`
  - **Depois:** acima + `(payment_method=boleto AND boleto_barcode IS NULL AND status IN (pending,overdue) AND billing_provider IS NOT NULL)`
  - Preserva lógica complexa que existia no `BillingErrorsPanel` (linha 122 da query antiga). Permite remover BillingErrorsPanel sem perder casos detectados.
- **`BillingInvoicesTab.tsx`** — adicionado:
  - `<InvoiceTotalsBar invoices={invoices} />` no topo (cobertura de "A Receber")
  - Novo state `paymentMethodFilter` ("all" | "boleto" | "pix" | "transferencia") + Select ao lado do filtro de status
  - Hook `useInvoices` agora recebe `paymentMethod` (filtra no backend)
- **Resultado:** BillingInvoicesTab agora cobre **3 dos 4 casos** que serão consolidados (Faturas + A Receber + Boletos + Erros). O 4º caso (Boletos com agrupamento processando/prontos) continua só em BillingBoletosTab por enquanto — usuário acessa por chip `payment_method=boleto`.
- **Saldo:** +24 LOC em arquivos modificados, +85 LOC em componente novo. Migração real (-LOC) só na Fase 3.C.3 quando as tabs antigas forem removidas.

### Adicionado (Fase 3.B — Migração da tabela desktop do BillingInvoicesTab — 2026-05-08)
Segunda parte da Fase 3. Aplica o `<InvoiceTableRow>` criado na Fase 3.A na tabela principal (desktop) do BillingInvoicesTab — primeira validação real do componente em uso.

- **`BillingInvoicesTab.tsx`** — substituição de 9 `<TableCell>` inline (cliente + issued_date + due_date + status + paid_date + amount + checkbox) por `<InvoiceTableRow>` com slots `inlineActions` (`<InvoiceInlineActions>`) e `actions` (`<InvoiceActionsPopover>`). Toda lógica de ações preservada via props (onBoletoClick, onNfseClick, onCancelBoleto com edge `banco-inter`, etc.).
- **Saldo:** -25 LOC líquidas no arquivo (45 removidas, 10 adicionadas). Markup mais legível, lógica de ações intacta.
- **Por que esse caminho em vez de migrar BillingBoletosTab:** auditoria mostrou que BillingBoletosTab tem 2 tabelas com estrutura muito específica (status hardcoded "Processando", coluna "Código de Barras" não-padrão). Forçar `<InvoiceTableRow>` lá criaria abstração inchada. BillingBoletosTab será **substituída** na Fase 3.C (consolidação Faturas + Boletos + A Receber → 1 tab), não migrada.
- **Próximo passo (Fase 3.C):** consolidação efetiva de tabs. BillingPage 11 → 7 abas. Tab "Cobranças" unificada substitui Faturas + Boletos + A Receber. Tab "Erros" vira chip de filtro. Saldo estimado: **-2.000 LOC líquidas**.

### Adicionado (Fase 3.A — Componentes Reusáveis para Tabs de Cobrança — 2026-05-08)
Primeira parte da Fase 3 (Consolidação de Tabs). Cria componentes reusáveis sem mudar comportamento. Próximos PRs (3.B, 3.C) usarão esses building blocks para colapsar tabs Faturas + Boletos + A Receber em uma só.

- **`src/components/billing/InvoiceStatusFilter.tsx` (novo, ~70 LOC)** — filtro Select reusável com 8 opções (Todos, Pendente, Pago, Vencido, Cancelado, Renegociado, Perdido, ⚠ Com Erros). Inclui botão "Limpar" automático quando value !== "all". Props: `value`, `onChange`, `showClearButton`, `className`. Tipo `StatusFilterValue` vem do hook `useInvoices` (consistência).
- **`src/components/billing/InvoiceTableRow.tsx` (novo, ~110 LOC)** — linha de tabela reusável encapsulando o padrão "cliente + número + datas + valor + status badge". Aceita slots para checkbox de seleção, inline actions e popover de ações. Reusa `InvoiceStatusBadge`, `formatDate`, `formatCurrencyBRL` (Fase 1). Filosofia "pragmática" — não tenta ser super-genérico, foca nos 80% dos casos.
- **`BillingInvoicesTab.tsx`** — 19 LOC de Select inline + botão Limpar substituídas por `<InvoiceStatusFilter />`. UX idêntico, código mais limpo.
- **Princípio aplicado:** este PR cria a base. Migrações reais (BillingBoletosTab usar InvoiceTableRow, consolidação de tabs) ficam para PRs separados (3.B, 3.C) onde o ganho de UX/LOC será visível.

### Adicionado (Fase 2 — Hooks Centralizados — 2026-05-08)
Segunda fase do plano de refatoração. Estabelece UMA fonte de verdade para queries de invoices. Resolve dor #2.4 do FINANCIAL_DEEP_AUDIT (race conditions, cache desincronizado).

- **`src/hooks/useInvoices.ts` (novo, ~170 LOC)** — hook flexível com filtros parametrizados:
  - `useInvoices(filters)` — lista invoices com filtros: `status`, `dateRange`, `paymentMethod`, `withErrors`, `contractId`, `clientId`, `limit`, `fields`, `enabled`
  - `useInvoice(id)` — busca 1 invoice por ID
  - `useInvalidateInvoices()` — invalidação centralizada (também invalida `billing-counters`)
  - **3 fields presets**: `summary` (campos comuns), `full` (todos + relations), `errors` (campos de subprocesso para BillingErrorsPanel)
  - **queryKey determinístico**: mesmos filtros → mesma chave → cache compartilhado entre componentes (resolve race condition do Phase 0)
  - Tipos exportados: `Invoice`, `InvoiceWithClient`, `InvoiceWithErrors`, `InvoiceStatusFilter`
- **3 componentes migrados** (princípio: extrair só quando substitui ≥2 cópias, então outros migram gradualmente):
  - `BillingInvoicesTab.tsx` — query principal substituída. Tipo local `InvoiceWithClient` removido (vem do hook). Imports `useQuery`, `supabase`, `Tables`, `Enums` ajustados.
  - `BillingBoletosTab.tsx` — query principal substituída por `useInvoices({ paymentMethod: "boleto", limit: 100, fields: "summary" })`. 5 invalidações `["boletos-dashboard"]` migradas para prefixo `["invoices"]` (cache compartilhado com BillingInvoicesTab).
  - `ContractInvoicesSheet.tsx` — query substituída por `useInvoices({ contractId, fields: "summary", enabled: open })`. Imports `useQuery`, `supabase` removidos (não há mais uso direto).
- **Não migrados (intencionalmente)**:
  - `BillingErrorsPanel` (3 queries com filtros compostos `or()` muito específicos)
  - `AgingReportWidget` (subset de campos único)
  - `ClientPortalFinancialTab` (campos de parcelamento + `.neq("status", "cancelled")` específico)
  - `useInvoiceActions` / `useBillingCounters` (já são hooks)
  - `FinancialDashboard` (4 queries de count/sum com grouping específico)
  - `ContractForm` / `ContractHistorySheet` / `InvoiceForm` / `NfseAvulsaDialog` (mutations ou casos específicos)
  - **Princípio aplicado**: forçar migração desses casos seria criar abstrações inchadas. Eles permanecem com queries diretas e migram quando alguém tocar (oportunidade real de extração).
- **Saldo**: ~50 LOC removidas dos 3 componentes migrados, +170 LOC reusáveis em hooks/. Cache agora compartilhado entre 3 telas críticas — uma mutation em qualquer uma reflete nas outras.

### Adicionado (Fase 1 — Helpers + Status Badges Unificados — 2026-05-08)
Primeira fase do plano de refatoração definido em `docs/FINANCIAL_DEEP_AUDIT.md`. Risco zero (puramente visual). Estabelece o padrão que Fases 2-3 vão reusar.

- **`src/lib/date.ts` (novo, 130 LOC)** — helper centralizado para formatação de datas:
  - `formatDate(value, variant)` com 7 variants: `short` (08/05/2026), `short-time` (08/05/2026 14:30), `long` (08/05/2026 às 14:30), `with-seconds`, `month-year` (mai/2026), `time-only` (14:30), `iso-date` (2026-05-08)
  - `formatRelative(value)` — distância relativa em pt-BR ("há 3 dias")
  - `isPastDate(value)` — comparação com hora zerada
  - **Timezone-safe**: strings `YYYY-MM-DD` são normalizadas com `T12:00:00` para evitar shift de dia em fusos negativos (problema clássico de `new Date("2026-05-08")` em BRT virar 07/05 21:00)
  - Aceita `Date | string | null | undefined` sem quebrar (retorna fallback configurável)
- **`src/lib/date.test.ts` (novo, 110 LOC)** — 19 testes cobrindo todas as variants, normalização de timezone, fallbacks. **Testes totais: 100 → 119 (+19).**
- **`src/components/billing/StatusBadges.tsx` (novo, 200 LOC)** — 5 componentes Badge unificados para o módulo financeiro:
  - `<InvoiceStatusBadge>` — invoice_status (pending, paid, overdue, cancelled, lost, renegotiated)
  - `<ContractStatusBadge>` — contract_status (active, expired, cancelled, pending, suspended)
  - `<BoletoStatusBadge>` — boleto_processing_status (pendente, gerado, enviado, erro)
  - `<NfseStatusBadge>` — nfse_processing_status (pendente, gerada, erro)
  - `<EmailStatusBadge>` — email_processing_status (pendente, enviado, erro)
- **`BillingInvoicesTab.tsx`** — removido mapeamento local `statusLabels`/`statusColors` (inline 17 LOC). Substituídos 2 usos de `<Badge>` inline por `<InvoiceStatusBadge>`.
- **`ContractsPage.tsx`** — removido mapeamento local `statusLabels`/`statusColors` (inline 16 LOC). Substituído 1 uso de `<Badge>` por `<ContractStatusBadge>`.
- **13 arquivos migrados de `format(new Date(...))` para `formatDate()`**:
  - `BillingBoletosTab` (3 ocorrências), `BillingErrorsPanel`, `ReconciliationMatchDialog`, `BankReconciliationTab`, `AccountsReceivableTab`, `SecondCopyDialog`, `FiscalReportTab`
  - `EconomicIndicesWidget` (variant `month-year`)
  - `IntegrationHealthDashboard` (variant `time-only`)
  - `InvoiceProcessingHistory` (variant `long`)
  - `InvoiceNotificationHistory` (variant `short-time`)
  - `NfseEventLogsDialog` (variant `with-seconds`)
  - `BillingInvoicesTab` — 5 ocorrências, incluindo pattern especial `(() => { const [y,m,d] = X.split('-')... })()` que era usado pra contornar timezone shift (agora desnecessário, helper já trata)
- **Imports limpos**: 11 arquivos tiveram `format` e/ou `ptBR` removidos do import de `date-fns` quando não havia mais uso.
- **Resultado**: mesmo dado renderizado de forma idêntica em qualquer tela. Saldo: ~33 LOC removidas (mapeamentos inline) + ~30 LOC de simplificação de date format = -63 LOC frontend, +330 LOC reusáveis em `lib/`.

### Adicionado (PR-PROTECTION — Proteção contra contratos vencidos — 2026-05-07)
- **Bloqueio + log no cron `generate-monthly-invoices`**: contratos com `status='active'` MAS `end_date < hoje` agora são pulados automaticamente com `status='skipped'` e log `warn` em `application_logs` apontando o contrato e a ação necessária ("mudar status para cancelled/expired ou estender end_date"). Antes o cron NÃO filtrava por end_date — qualquer contrato active gerava cobrança mesmo se já tinha "vencido". Hoje (07/05) os 31 contratos têm `end_date IS NULL` (zero risco), proteção é preventiva.
- **Badge "Vencido" em `ContractsPage.tsx`**: quando contrato é `status='active'` mas `end_date < hoje`, aparece badge vermelho ao lado do status com tooltip explicando que a cobrança foi pulada e como resolver. UX transparente — usuário não fica adivinhando por que tal contrato deixou de cobrar.
- **`end_date` adicionado à interface `Contract`** e ao SELECT do cron (estava sendo carregado do banco mas não era usado para validação).

### Adicionado (PR-UX-Combobox — Busca em dropdown de cliente — 2026-05-07)
- **Novo componente reusável `src/components/clients/ClientSearchCombobox.tsx`** (143 LOC) — combobox com input de busca para selecionar cliente. Substitui `<Select>` tradicional quando a lista é grande (>10 clientes). Filtro client-side, case-insensitive, busca **substring** (não só prefixo) em **nome + documento + apelido**. Pontuação do CNPJ é normalizada (busca "42527" encontra "42.527.401/0001-44").
- **`NfseAvulsaDialog.tsx`** migrado para usar o novo combobox. Antes o usuário precisava fazer scroll na lista de 50+ clientes para achar o desejado; agora digita "INS" e a lista filtra para clientes contendo essa substring (resolve o caso real do "COMERCIAL INSUMEDI" que estava enterrado no scroll).
- **Reuso futuro**: o componente é genérico e pode substituir Selects de cliente em qualquer outro dialog (CRUD de invoice manual, contracts, etc.) — basta importar e passar `clients` + `value` + `onChange`.

### Adicionado (PR-E — Máquina de Estado da Fatura (FSM) — 2026-05-07)
- **Novo módulo `src/lib/billing-fsm.ts`** centraliza a lógica de "qual o estado atual da fatura?" e "qual ação é permitida?" em UM único lugar. Antes, cada componente (BillingInvoicesTab, BillingErrorsPanel, InvoiceActionsPopover, InvoiceProcessingHistory) calculava decisões inline com regras divergentes — resultado: mesma fatura aparecia com botões/disabled diferentes em telas diferentes.
- **Tipo `InvoiceDerivedState`** com 8 estados consolidados: `aguardando_geracao`, `aguardando_envio`, `aguardando_pagamento`, `pago`, `em_atraso`, `cancelada`, `renegociada`, `com_erro`. Cada um agrupa o cruzamento de `invoice.status × boleto_status × email_status × nfse_status`.
- **`computeInvoiceDerivedState(invoice)`** retorna o estado derivado seguindo prioridade clara (paid → cancelled → renegotiated → erro → overdue → aguardando_geracao → aguardando_envio → aguardando_pagamento). Erros têm prioridade sobre overdue (uma fatura vencida com boleto erro mostra "com_erro", não "em_atraso").
- **7 helpers de permissão** (`canMarkAsPaid`, `canResendNotification`, `canRegenerateBoleto`, `canEmitNfse`, `canCancelInvoice`, `canCancelBoleto`, `canForcePolling`) retornam `{ allowed: boolean, reason?: string }`. UI usa `allowed` para enable/disable do botão e `reason` como tooltip explicativo (UX consistente).
- **`getDerivedStateDisplay(state)`** retorna `{ label, variant, toneClass }` para badges/tags consistentes em qualquer tela.
- **41 testes novos** em `src/lib/billing-fsm.test.ts` cobrindo todos os estados e helpers, incluindo prioridades de transição (paid sobre erro, erro sobre overdue, etc). Total do projeto sobe de 59 → **100 testes**.
- **Refatoração demonstrativa em `InvoiceActionsPopover.tsx`**: substituído cálculo inline `canCancelBoleto = hasBoleto && invoice.status !== "paid"` por `cancelBoletoPerm = canCancelBoleto(invoice)` (mais completo, cobre também `lost`/`cancelled`). Substituído guard `isPendingOrOverdue` por `markPaidPerm.allowed` (cobre 5 estados de bloqueio em vez de 2). Tooltips agora mostram a `reason` exata da FSM.
- **Migração gradual**: outros componentes (`BillingErrorsPanel`, `BillingInvoicesTab`, `InvoiceProcessingHistory`) podem migrar progressivamente. A FSM é aditiva — não quebra nada existente. PRs futuros podem incluir migração + remoção de cálculos inline conforme tocam nos arquivos.

### Adicionado/Corrigido (PR-FIX-2 — Clientes sem cobrança + bug oculto cobrança avulsa — 2026-05-07)
- **Bug observado:** Cliente COMERCIAL INSUMEDI LTDA cadastrado em 18/abr não aparecia na listagem de cobrança e não conseguia gerar cobrança. Investigação revelou que o cliente NÃO tinha contrato cadastrado nem invoices históricas. Sistema funcionando como projetado, mas SEM AVISO ao usuário sobre clientes "órfãos".
- **Bug oculto descoberto na investigação**: `NfseAvulsaDialog` quando `gerarFatura=true` criava invoice no banco (`contract_id=NULL`) + emitia NFSe via `emit_standalone`, MAS NUNCA chamava `create_payment` para gerar boleto/PIX. Resultado: cliente recebia NFSe mas SEM forma de pagar (invoice "fantasma"). Provavelmente nunca pego porque cobrança avulsa é fluxo pouco usado.
- **Correção 1 — `NfseAvulsaDialog.tsx`**: após emitir NFSe e criar invoice, chamar `asaas-nfse:create_payment` com `billing_type: "BOLETO"` para gerar boleto real. Falha do boleto NÃO faz throw (NFSe já foi emitida com sucesso) — apenas avisa via `toast.warning` orientando uso de "Regenerar Boleto" na fatura. Mensagem de sucesso atualizada para diferenciar 3 cenários: só NFSe / NFSe+fatura / NFSe+fatura+boleto.
- **Correção 2 — `ClientsPage.tsx`**: nova query paralela `clients-with-active-billing` que faz 2 SELECTs paralelos (`contracts WHERE status='active'` + `invoices WHERE created_at >= now()-90d`), monta `Set<client_id>` com lookup O(1), cache de 1 min. Identifica clientes ativos SEM contrato E SEM invoice nos últimos 90 dias.
- **Badge "Sem cobrança"**: aparece ao lado do nome do cliente na listagem (com tooltip explicativo) quando o cliente é ativo mas não tem contrato nem invoice recente. Cor amber para chamar atenção sem alarmar.
- **Toggle "Sem cobrança"** ao lado do search: filtra a listagem para mostrar apenas clientes problemáticos. Mostra contagem ao lado do botão. Empty state específico ("Nenhum cliente sem cobrança ativa") quando filtro ativo.
- **Footer**: contagem ajustada para refletir filtro quando ativo.
- **Reuso**: usa `throwIfEdgeFunctionError` (helper criado no PR-FIX paralelo) para extrair mensagem real de erros da edge function — UX consistente.

### Modificado (PR-D — Unificar fluxo de reenvio/regenerar/polling — 2026-05-07)
- **`useInvoiceActions` hook**: passa a expor `handleRegenerateBoleto` e `handleForcePolling` (extraídos das implementações duplicadas em `BillingErrorsPanel` e `InvoiceProcessingHistory`). Estados novos: `regeneratingBoleto`, `forcingPolling`. O hook centraliza agora 3 ações antes duplicadas: reenviar notificação, regenerar boleto, forçar polling.
- **`BillingErrorsPanel.tsx`**: removidas 3 implementações próprias (`handleResendNotification`, `handleRegenerateBoleto`, `handleForcePolling`). Estados locais `resendingId` e `pollingId` deletados. Estado `reprocessingId` mantido (continua sendo usado por handlers específicos de NFSe que ficam fora do escopo deste PR — `handleClearFailedNfse`, retry de NFSe). onClicks adaptados: `handleResendNotification(inv.id, ["email"])` em vez de `(inv, "email")`. Loading visual usa `sendingNotification?.startsWith(inv.id)` para disable e `=== \`${inv.id}-email\`` para spinner por canal.
- **`InvoiceProcessingHistory.tsx`**: removidas 3 implementações próprias com mesma estrutura. Estado local `actionLoading` mantido apenas para `handleReprocessNfse` (específico de NFSe, fora do escopo). Adicionado import do `useInvoiceActions`.
- **Dead branch Inter removido**: as 2 cópias de `handleRegenerateBoleto` ainda tinham `if (provider === "asaas") asaas-nfse else banco-inter`. Após PR-A.5 todos contratos são Asaas, então o else nunca executava. Hook centralizado chama `asaas-nfse` direto.
- **UX agora é consistente** entre as 3 telas: mesma mensagem, mesma validação prévia (`checkArtifactReadiness` quando `nfseInfo` + `invoiceData` disponíveis), mesmo tratamento de `data.blocked` do backend, mesmas mensagens específicas de `errorCode` (`WHATSAPP_INTEGRATION_DISABLED`, `CLIENT_NO_WHATSAPP`).
- **Saldo:** -78 linhas líquidas, 0 lógica duplicada de reenvio/regenerar/polling, 1 fonte da verdade.

### Adicionado (PR-C — Cobrança bimestral/trimestral/semestral/anual — 2026-05-07)
- **Estratégia B (cron local com pulo)**: a edge `generate-monthly-invoices` ganhou verificação de frequência. Para contratos com `billing_frequency != 'monthly'`, o cron busca a última invoice do contrato (excluindo `cancelled`/`voided`) e calcula meses entre a competência atual e a competência da última invoice. Se for menor que o intervalo da frequência, pula com `status='skipped'`. Se for maior ou igual, gera normalmente. Mapa de intervalos: `monthly=1`, `bimonthly=2`, `quarterly=3`, `semiannual=6`, `yearly=12`.
- **Schema (migration `20260507204537_add_billing_frequency_to_contracts.sql`)**: nova coluna `contracts.billing_frequency text NOT NULL DEFAULT 'monthly'` com `CHECK` aceitando 5 valores. Snapshot de backup em `_billing_pr_c_backup_billing_frequency` (reversão trivial). Default preserva comportamento atual para os 31 contratos existentes.
- **`ContractForm.tsx`**: dropdown novo "Periodicidade da Cobrança" com 5 opções (Mensal / Bimestral / Trimestral / Semestral / Anual). Schema Zod e defaultValues atualizados. Payload do save passa a incluir `billing_frequency`.
- **Decisão registrada**: optamos por NÃO usar Asaas Subscriptions (Estratégia A) neste momento. Razões: princípio "REUTILIZAR antes de criar novo" (cron já existia), risco menor (~50 LOC vs migração de 31 contratos para subscriptions), reversibilidade fácil. Estratégia A fica registrada como opção futura quando Colmeia virar SaaS multi-tenant.

### Modificado (PR-A.5 — Migração billing Inter → Asaas — 2026-05-07)
- **DECISÃO ESTRATÉGICA**: migração completa do gateway de cobrança Banco Inter → Asaas. Asaas passa a ser o **único** provedor para boleto, PIX e NFS-e. Justificativa documentada em `docs/BILLING_AUDIT.md` (PROS/CONTRAS, custo incremental ~R$60-80/mês, decisão tomada após bug crônico do Inter rate limit + escopo OAuth `cob.write` desabilitado bloqueando 5 de 8 boletos do mês).
- **Edge `generate-monthly-invoices`**: provider hard-coded para `'asaas'` (não lê mais `contract.billing_provider` para roteamento). Removido lookup `bancoInterSettings` (dead code). Comportamento preservado: loop boleto/pix quando `payment_preference='both'`, captura `lastPaymentType` e diferencia falha de boleto vs PIX no catch (mantém PR anterior).
- **Edge `asaas-nfse`** (action `create_payment`): corrigido bug pré-existente — `boleto_status` virava `'enviado'` + `boleto_sent_at=now()` ao apenas CRIAR o boleto no Asaas, mentindo sobre o estado real (cliente não recebeu nada). Agora marca corretamente como `'gerado'`. Status `'enviado'` + `boleto_sent_at` passa a ser responsabilidade exclusiva do fluxo de notificação (`notify-due-invoices` ou `resend-payment-notification`) após confirmação Resend.
- **`ContractForm.tsx`**: opção "Banco Inter" removida do select `billing_provider`. Asaas vira único valor disponível. Default e useForm ajustados. Label condicional de provider removido. Schema Zod restringido para `z.enum(["asaas"])`.
- **Migration `20260507185630_migrate_billing_provider_inter_to_asaas.sql`**: snapshot de backup embutido em `_billing_migration_backup_inter_to_asaas` (reversão trivial). UPDATE em `contracts` migra todos os contratos `active` com `billing_provider='banco_inter'` para `'asaas'`. Contratos `cancelled`/`expired` ficam intactos (histórico).
- **Coexistência planejada**: boletos Inter já emitidos (cobrança maio/2026) continuam ativos até serem pagos ou vencerem. `webhook-banco-inter` **mantém-se funcional** para receber `PAYMENT_CONFIRMED` dos legados. Edges `banco-inter` e `webhook-banco-inter` **NÃO foram removidas neste PR** — decommission completo no PR-DECOM (~60-90 dias quando o último boleto Inter liquidar).
- **Documentação**: `docs/BILLING_AUDIT.md` atualizado na seção 9 (plano de PRs revisado para refletir a decisão Asaas-only).

### Corrigido (Hotfix Billing — Contaminação PIX × Boleto — 2026-05-07)
- **`generate-monthly-invoices` — catch cego sobrescrevia boleto válido**: ao gerar pagamento para contratos com `payment_preference="both"`, o try/catch envolvia o loop inteiro (`["boleto", "pix"]`). Quando o boleto gerava com sucesso na 1ª iteração (Inter já gravava `boleto_url` + `boleto_barcode`) e o PIX falhava na 2ª iteração (escopo `cob.write` desabilitado no portal Inter), o `catch` marcava cegamente `boleto_status='erro'` + `boleto_error_msg=<mensagem do PIX>`, sobrescrevendo um boleto operacionalmente válido. Refatorado para capturar `lastPaymentType` antes do loop e diferenciar no catch: falha de boleto mantém o comportamento atual (`boleto_status='erro'` + `boleto_error_msg`); falha de PIX **não toca** em `boleto_status` e registra erro em `application_logs` (`module='billing'`, `level='error'`, contexto com `invoice_id`, `payment_type='pix'`, `error_message`, `execution_id`), preservando o boleto da iteração anterior intacto.
- **Botão "Regenerar" do painel de Erros (Faturamento) — payload errado para `banco-inter`**: ambos `BillingErrorsPanel.tsx` e `InvoiceProcessingHistory.tsx` invocavam `supabase.functions.invoke("banco-inter", { body: { action: "generate", invoice_id } })`, mas a edge não usa `action` — espera `{ invoice_id, payment_type }`. Resultado: HTTP 400 silencioso `"invoice_id e payment_type são obrigatórios"` para todas as tentativas de regenerar boleto. Corrigido para `{ invoice_id: invoice.id, payment_type: "boleto" }` nos dois arquivos.
- **Data fix produção** (migration `20260507005347_fix_inter_pix_contamination_hotfix.sql` com snapshot embutido em `_billing_hotfix_backup_pix_contamination` para reversão): ETAPA A — todas as faturas com `boleto_status='erro' AND boleto_url IS NOT NULL AND boleto_barcode IS NOT NULL` foram remarcadas como `gerado` (autocura programática, não enumera fatura por fatura); ETAPA B — fatura #128 (Capasemu) limpa (`boleto_status=NULL`, `boleto_error_msg=NULL`) para permitir nova tentativa via UI; ETAPA C — contrato Capasemu mudado para `payment_preference='boleto'` por decisão de Jonatas em 2026-05-06 (PIX bloqueado no Inter). Tabela de backup pode ser dropada após validação E2E em produção.

### Adicionado (mini-Seção 4.5.7 — PR antecipada — 2026-04-29)
- Form de novo chamado do **portal do cliente** recebe 3 campos novos: telefone de contato (já existia, agora obrigatório com `NOT NULL DEFAULT ''` e flag adjacente "Este número tem WhatsApp?"), e hostname do computador (opcional, via dropdown estruturado de `monitored_devices` do próprio cliente OU texto livre como fallback). Colunas `tickets.contact_phone_is_whatsapp` (boolean NOT NULL DEFAULT false), `tickets.monitored_device_id` (uuid FK ON DELETE SET NULL) e `tickets.device_hostname_text` (text) com constraint CHECK `tickets_device_xor_hostname` garantindo que device e hostname text não sejam preenchidos ao mesmo tempo. Índice parcial `idx_tickets_monitored_device_id` na FK. Policy RLS adicionada em `monitored_devices` para portal cliente ler devices do próprio cliente (via `client_owns_record`). Detalhe do ticket no painel staff (`RequesterContactCard`) exibe os 3 campos read-only: badge "WhatsApp" só aparece se a flag estiver ativa, e bloco "Computador relacionado" mostra hostname com indicador online/offline (device monitorado) ou texto livre com ícone de lápis. Novo hook `useClientMonitoredDevices`. Form de novo ticket do staff NÃO foi tocado. Resto da Seção 4.5.7 (dashboard "PC teve N chamados", métricas históricas) permanece pendente.

### Adicionado (Seção 4.5.1 — PR #4 — 2026-04-27)
- **Coluna `branch_id` (FK nullable para `client_branches`, ON DELETE SET NULL) em 6 tabelas de CMDB de rede**: `doc_vlans`, `doc_vpn`, `doc_firewall_rules`, `doc_access_policies`, `doc_internet_links`, `doc_infrastructure`. Índice parcial `WHERE branch_id IS NOT NULL` em cada tabela. Sem backfill (tabelas vazias até hoje). RLS preservada (policies "Staff full access on doc_*" continuam válidas). Dropdown "Filial" adicionado nos 2 forms manuais que existem hoje (`DocTableInternetLinks`, `DocSectionInfrastructure`), com pré-seleção automática da Sede em criação via `useClientBranchOptions` (reutilizado do PR #3). Forms de VLANs, VPN, Firewall e Access Policies ainda não existem na UI — coluna fica disponível para a Seção 4.5.2 quando esses forms forem criados.


### Corrigido
- **PR #3 (Seção 4.5.1) — Filiais nos forms de CMDB**: dropdown "Filial" às vezes aparecia vazio/disabled mesmo havendo filiais cadastradas. Causa raiz: `useClientBranches` rodava com `clientId=""` no primeiro mount e cacheava `[]`. Adicionado `enabled: !!clientId` no `useQuery` e proteção em `useClientBranchOptions` para tratar `clientId` ausente sem disparar query inválida.
- **PR #4 hotfix — `DocSectionInfrastructure.tsx`**: alinhamento de 3 nomes de coluna que divergiam do schema real de `doc_infrastructure` (`general_notes` → `notes`, `gateway_wan_ip` → `gateway_ip_wan`, `gateway_lan_ip` → `gateway_ip_lan`). Bug pré-existente que bloqueava 100% dos saves de Infraestrutura com `PGRST204`. Detectado durante validação E2E manual do PR #4.
- **PR #4 hotfix — Badge "Sede" em `ClientBranchesList`**: agora usa destaque amarelo preenchido (`bg-primary` Honey Gold + `Star` com `fill-current`) em vez de variant `secondary` discreto, tornando a Sede visualmente inconfundível na listagem.
- **PR #4 hotfix — Cleanup de dados de teste em produção** do cliente VIZU (`c9bab9b7-…`): removidos 2 ativos, 1 filial não-Sede e 1 dispositivo de documentação criados durante validação E2E dos PRs #2-#4. Sede preservada via filtro `is_main = false`.

### Modificado
- **UX dos forms de ativos/dispositivos (AssetForm, ClientAssetsList, DocTableWorkstations, DocTableNetworkDevices)**: ao **criar** novo registro, a Sede do cliente é pré-selecionada automaticamente no dropdown "Filial" quando existe (usuário pode trocar para outra filial ou "— Sem filial —" conscientemente). Em **edição**, o `branch_id` atual do registro é respeitado (mesmo quando `null`). Hook `useClientBranchOptions` agora expõe `mainBranchId`.

### Adicionado (Seção 4.5.1 — PR #1 — 2026-04-27)
- **Tabela `client_branches`** (filiais por cliente) com RLS, índices únicos parciais e trigger de auditoria. Cada cliente pode ter múltiplas filiais com nome único (case-insensitive) e exatamente uma marcada como principal (`is_main`). FK `client_id` com `ON DELETE CASCADE`. Campos: `name`, `is_main`, `address`, `city`, `state`, `cep`, `phone`, `email`, `notes`. Reaproveita helpers existentes `is_staff`, `has_role`, `client_owns_record`, `audit_changes`, `update_updated_at_column` — zero função nova. RLS: staff (admin/manager/technician/financial) gerencia tudo; `client_master` lê/cria/edita filiais do próprio cliente; `client` apenas lê; somente admin pode excluir. Backfill idempotente: 32 filiais "Sede" criadas automaticamente (1 por cliente existente), copiando `address/city/state/zip_code` do cadastro do cliente. Base da Seção 4.5.1 do roadmap CMDB. **Sem alteração em outras tabelas e sem UI nesta PR** (PRs #2-#5 seguem na sequência).

### Adicionado (Seção 4.5.1 — PR #2 — 2026-04-27)
- **Aba "Filiais" em `ClientDetailPage`** com CRUD completo de `client_branches` (componente `ClientBranchesList` + hook `useClientBranches`). Tabela exibe Sede com badge `Star`, endereço/cidade/UF, contato (telefone/email) e ações de editar/excluir protegidas por `PermissionGate`. Form com switch de Sede, CEP/cidade/UF, endereço, telefone, email e observações. Bloqueio defensivo: não permite excluir a Sede se houver outras filiais. Tratamento explícito de violações de UNIQUE (`uniq_client_branches_main_per_client` e `uniq_client_branches_name_per_client`) com toasts amigáveis. Reaproveita `formatCEP`, `formatPhone`, `getErrorMessage`, `ConfirmDialog` — zero helper novo.
- **Função `merge_clients` atualizada** para migrar `client_branches` no merge, resolvendo conflitos de UNIQUE automaticamente: se ambos os clientes têm Sede, a Sede do source é rebaixada para filial comum (com nota explicativa); se houver nome homônimo no target, o nome da branch do source recebe sufixo " (migrada)". Restante da função preservado byte-a-byte. `client_branches` agora aparece em `refs_migrated` no audit log.
- **Busca automática de CEP no form de Filial via ViaCEP** (preenche endereço, cidade e UF ao sair do campo CEP). Em criação preenche tudo; em edição só sobrescreve quando o CEP foi alterado em relação ao salvo, caso contrário apenas completa campos vazios. Exibe spinner ao lado do label "CEP" durante a consulta. Implementação inline (`fetch` direto, sem secret, sem helper novo, sem edge function nova).

### Adicionado (Seção 4.5.1 — PR #3 — 2026-04-27)
- **Coluna `branch_id`** (FK nullable para `client_branches`, `ON DELETE SET NULL`) em `monitored_devices`, `assets` e `doc_devices`, com índice parcial `WHERE branch_id IS NOT NULL` em cada tabela. RLS atual preservada (apenas `ADD COLUMN`, sem reescrita de policies). Hook `useClientBranchOptions` reutiliza `useClientBranches` do PR #2 e expõe `{options, isLoading, isEmpty}` para dropdowns. Seletor "Filial" adicionado a 4 forms manuais: `AssetForm.tsx` (inventário global, reativo a `client_id`), `ClientAssetsList.tsx` (mini-form do cliente), `DocTableWorkstations.tsx` e `DocTableNetworkDevices.tsx` (documentação por cliente). Item especial "— Sem filial —" envia `null`. Edge functions de sync (`tactical-rmm-sync`, `unifi-sync`, `checkmk-sync`) **não foram tocadas** — registros vindos de sync ficam com `branch_id = NULL` até a Seção 4.5.3 evoluir o mapeamento automático por hostname/site_id.


### Modificado (housekeeping de roadmap — 2026-04-27)
- **`REFACTORING_ROADMAP.md`: housekeeping de consolidação.** Restaurados detalhes das Seções 5, 6, 7 que haviam ficado vagos durante a expansão das Seções 4.5-4.11. Seção 5 ganhou sub-itens 5.1 (5 componentes órfãos), 5.2 (hooks/utils órfãos), 5.3 (edge functions legadas: `send-notification`, `bootstrap-admin`, `sync-doc-devices`), 5.4 (schema legado: `ticket_history.old_status`), 5.5 (dívidas técnicas anteriores incluindo 3 `logic.ts` em edges, `UsersTab.tsx` 851 linhas, `ticket_categories` em 11%), 5.6 (áreas não auditadas) e 5.7 (ferramenta preventiva). Seção 6 ganhou sub-itens 6.1 a 6.6 (helpers duplicados, `_shared/webhook-validator.ts`, `_shared/device-sync.ts`, consolidação de 3 menus de fatura, Bug 10 do MergeClientsDialog, expansão de `_shared/`). Seção 7 ganhou sub-itens 7.1 (Auth Email Hook — ação manual no painel Supabase), 7.2 (movido para 4.11.3 — referência cruzada), 7.3 (rate limiting em endpoints públicos), 7.4 (4 dependências não usadas ~25KB), 7.5 (dívidas: paginação `useUsers`, sanitização PostgREST, retenção `audit_logs`, build error `npm:zod` em `manual-payment`). Adicionados itens nunca registrados explicitamente: **5.A** bug do IP público RMM (4.5.3.1), **5.B** edição real de e-mail no perfil (4.9.5), **5.C** Google Calendar sync (nova Seção 4.12), **5.D** recibo de pagamento ao cliente (4.6.6), **5.E** broadcast macro (4.8.6), **5.F** áreas não auditadas — `/tv-dashboard`, `/knowledge`, onboarding, mobile admin (5.6), **5.G** dependência ALTAHU em anexos do portal (4.7.6), **5.H** e **5.I** confirmados na Seção 3.
- **Decisão registrada — `invoice_notification_logs` MANTIDA**: tabela é ATIVAMENTE escrita por 4 edges em produção (`generate-monthly-invoices`, `notify-due-invoices`, `send-nfse-notification`, `_shared/notification-logger.ts`) e LIDA pelo painel `InvoiceNotificationHistory.tsx`. 0 rows hoje significa pipeline ainda não disparou em prod, **não** que código seja morto. Item de DROP que rondava em sessões anteriores fica oficialmente cancelado. Documentado em 5.4.



### Removido (Seção 4 — Lote B G12 — 2026-04-27)
- **`send-welcome-email` completo (edge function + trigger DB + função `trigger_send_welcome_email`)** — feature estava quebrada silenciosamente há meses (vault secrets não populados, `RAISE WARNING` engolido pelo `EXCEPTION` block, `net.http_post` nunca enfileirado). Validado por teste manual: INSERT em `clients` não gerou nenhuma entrada em `message_logs`/`application_logs`/`net.http_request_queue`. Será reimplementada na Seção 4.8 (Notificações) ou 4.9 (Hub Configuração) com chamada explícita do `create-client-user` (sem trigger DB + Vault). Achado registrado como dívida CRÍTICA em 4.11.2.

### Corrigido (Seção 4 — Lote B — 2026-04-27)
- **G3 — Notificação de pagamento confirmado ao cliente**: webhooks `webhook-asaas-nfse` e `webhook-banco-inter` agora disparam e-mail ao cliente quando confirmam pagamento (boleto/PIX). Helper inline `notifyClientPaymentConfirmed` reutilizado em ambos. Antes: webhooks atualizavam status no banco mas cliente nunca era notificado.
- **G5 — Push notifications para clientes**: `send-ticket-notification` agora inclui `client` e `client_master` no `role_filter` da chamada para `send-push-notification`. Antes: clientes estavam explicitamente excluídos do push do PWA.
- **G6 — `event_type: 'resolved'` em fechamento de chamado**: `TicketDetailsTab.tsx` agora envia `event_type: 'resolved'` (em vez de sempre `'updated'`) quando status transiciona para `resolved`/`closed`, fazendo o template de e-mail surfar o CTA de avaliação de satisfação.

### Adicionado (Seção 4 — fechamento — 2026-04-27)
- **Seções 4.7 a 4.11 abertas no `REFACTORING_ROADMAP.md`**: Portal do Cliente (UX + paridade), Notificações ao cliente final (Hub), Configurações (Hub Settings), Storage R2 + LGPD, Observabilidade interna. Cada seção com escopo detalhado em itens numerados.
- **Dívida CRÍTICA 4.11.2 — Validação de Vault secrets**: descoberta durante teste do welcome email (G12). Health-check deve validar se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão populados em `vault.decrypted_secrets`. Padrão de falha silenciosa pode estar quebrando outras funções DB que usam `pg_net.http_post` — mapeamento será feito em 4.11.1.

### Adicionado (Seção 4 — fechamento — 2026-04-26)
- **Feature flags `departments_enabled` e `gamification_enabled`** (default `false`) para esconder UI dessas features até refatoração multi-tenant no remix SaaS futuro. Reaproveita o sistema `feature_flags` + `useFeatureFlag` da Seção 0.2.
- **Arquivo `PRODUCT_IDEAS.md`** registrando ideias para o remix SaaS futuro: multi-tenancy, refator de Departments e Gamificação tenant-scoped, e Camada 3 do Financeiro (IGPM/IPCA, hora extra, comissão, SPED, multi-empresa, multi-moeda).

### Modificado (Seção 4 — fechamento — 2026-04-26)
- **UI de Departments escondida via `useFeatureFlag('departments_enabled')`**: aba "Departamentos" em `/settings` (`SettingsPage.tsx`) e tab "Departamento" no diálogo de transferência de chamado (`TicketTransferDialog.tsx`) só aparecem quando flag ligada. Código, tabelas, RPCs e edges mantidos intactos.
- **UI de Gamificação escondida via `useFeatureFlag('gamification_enabled')`**: rota `/gamification` redireciona para `/` quando flag off (guard `GamificationGuard` em `AnimatedRoutes.tsx`); widget `TechnicianMiniRanking` no Dashboard retorna `null`; item "Gamificação" some do `AppSidebar`. Código, tabelas (`technician_points`, `technician_badges`, `badges`) e RPC `get_technician_ranking` mantidos intactos.
- **Seção 4 do `REFACTORING_ROADMAP.md` fechada** com 8 blocos auditados (doc_*, Inventário, Banking, Gamificação, Monitoring, Tickets Avançados, Departments, Calendar), 0 drops, 2 flags off. Multi-tenant decidido NÃO fazer neste projeto — remix futuro.
- **Seções 4.5 (CMDB — Documentação MSP de Clientes) e 4.6 (Financeiro MSP profissional) abertas** no roadmap com escopo detalhado em camadas. Dívidas adicionadas: investigação do uso de `ticket_categories` (Seção 5) — política de retenção de `audit_logs` já estava registrada na Seção 7.


### Corrigido (varredura E2E Seções 0+1 — 2026-04-26)
- **Filtro de auditoria agora inclui `auth.users`**: 5 registros pré-existentes (criação/exclusão/confirmação/email de usuários) ficaram visíveis no filtro de tabela em `/settings/audit-logs`.
- **Filtro "Até" inclui o dia inteiro**: era exclusivo de `00:00:00` da data selecionada; agora envia `T23:59:59.999Z` para capturar registros até o fim do dia.
- **Paginação de auditoria reseta para página 1 quando filtros mudam**: evita estado inválido (ex.: "Página 3 de 1") ao trocar tabela/ação/data/busca.
- **`useAuth.test.tsx` alinhado com implementação atual de `signUp`**: assertion agora aceita `emailRedirectTo: window.location.origin` (necessário para confirmação de e-mail). Suíte volta a 100% verde.

### Adicionado (varredura E2E Seções 0+1 — 2026-04-26)
- **Tooltip + botão copiar UUID** em `record_id` de `AuditLogRow` e `AuditLogDetail`. Resolução para nome humano (ex.: "Cliente AIRDUTO LTDA") deferida para Seção 2/3.

### Modificado (varredura E2E Seções 0+1 — 2026-04-26)
- **Paginação de auditoria mantém dados anteriores durante refetch** (`placeholderData: keepPreviousData`): elimina flicker do skeleton ao trocar página/filtro.

### Performance
- **Índices em FKs (item 1.5 — Phase 1)**: 34 índices adicionados em foreign keys de tabelas com volume real ou core do sistema (audit_logs, ticket_history, client_history, contract_history, invoice_generation_log, invoice_items, invoices, financial_entries, contract_services, contracts, client_contacts, tickets, ticket_comments, ticket_pauses, doc_sync_log, monitored_devices, sla_configs, nfse_history, knowledge_articles, technician_points). `EXPLAIN ANALYZE` confirmou shift para `Index Scan` em queries por `user_id` em `audit_logs` e `contract_id` em `invoice_generation_log`. Tabelas hoje vazias (doc_*, calendar_events, monitoring_*, etc.) deferidas para após a Seção 4 (decisão de manter/remover).

### Adicionado
- **Trilha de auditoria genérica (item 1.4)**: função `audit_changes()` (SECURITY DEFINER) reaproveitável + `sanitize_jsonb()` recursiva que redata chaves sensíveis (`password`, `secret`, `token`, `api_key` etc.). Triggers `audit_*_trigger` ativos em 6 tabelas sensíveis: `user_roles`, `invoices`, `contracts`, `clients`, `bank_accounts`, `integration_settings`.
- **RPC `list_audit_logs_with_user`** (admin-only, paginação real): retorna logs enriquecidos com nome/email do autor + `total_count` agregado para paginação.
- **Página `/settings/audit-logs`** (admin-only): listagem com filtros (tabela, ação, usuário, datas, busca), paginação 50/página e Sheet de detalhes com diff visual JSONB (added/removed/changed). 8 componentes modulares (`AuditLogsList`, `AuditLogRow`, `AuditLogFilters`, `AuditLogDetail`, `AuditLogDiff`) + hook `useAuditLogs` + lib pura `src/lib/audit-diff.ts`. Link discreto "Ver auditoria" no header da página `/settings/feature-flags`.
- **3 testes de integração** (`src/test/integration/audit-logs.test.ts`): diff de JSONB, propagação de filtros + paginação no RPC, derivação de `total` a partir do `total_count`.

### Modificado
- Função legada `log_integration_settings_changes` removida (zero referências externas confirmado) e substituída pela trigger genérica.

### Segurança
- Trilha de auditoria agora cobre todas as tabelas sensíveis identificadas no roadmap, com sanitização automática de campos contendo segredos antes da gravação em `audit_logs`. Política `INSERT/SELECT` admin-only em `audit_logs` mantida append-only (UPDATE/DELETE bloqueados).

### Adicionado
- **Sistema de Feature Flags** (`feature_flags` + `useFeatureFlag` + `/settings/feature-flags`): infraestrutura para ligar/desligar funcionalidades em runtime sem redeploy. Suporta rollout gradual (FNV-1a determinístico), filtro por role e whitelist por user_id. Apenas admin gerencia. Documentação em `FEATURE_FLAGS.md`.
- **Testes de integração dos 5 fluxos críticos** (`src/test/integration/`): rede de segurança com 15 testes (3 por fluxo: happy path, erro de input, erro de backend / edge case) cobrindo Login, criação de chamado, geração mensal de faturas, notificação de faturas a vencer e reenvio de confirmação. Stack: Vitest + jsdom + Testing Library + mock chainable do Supabase. Cobertura 77,77% statements / 60,78% branches nos arquivos-alvo. Suíte completa em ~7s, zero flakiness. Documentação em `TESTING.md`.
- **Helper puro `buildTicketPayload`** (`src/lib/ticket-payload.ts`): lógica de montagem do payload de criação de chamado extraída de `TicketForm.tsx` para ser unit-testável (sem renderizar o formulário multi-step).
- **Handlers puros das edge functions críticas** (`supabase/functions/{generate-monthly-invoices,notify-due-invoices,resend-confirmation}/logic.ts`): núcleo de decisão extraído em funções dependency-free (sem imports `npm:`) que recebem o supabase client por parâmetro. Os `Deno.serve` em `index.ts` permanecem como source-of-truth de produção.
- **`PageErrorBoundary`** (`src/components/common/PageErrorBoundary.tsx`): boundary local por página que captura crashes, registra em `application_logs` (módulo `ui`, ação `page_crash`, contexto rico) e mostra UI custom com "Tentar novamente" e "Voltar". Coexiste com o `LazyErrorBoundary` global como primeira linha de defesa.
- **Helper `unwrapEmbed`** (`src/lib/supabase-helpers.ts`): normaliza embeds do PostgREST que podem chegar como `T | T[] | null`, evitando crashes em páginas que assumem objeto único.
- **Teste de regressão da página de inadimplência** (`src/test/integration/delinquency-page.test.tsx`): 3 cenários (embed array, objeto, null) garantindo que `/billing/delinquency` nunca mais quebre por mudança no formato do embed.
- **Ferramentas administrativas de deduplicação de clientes** (item 1.2b do roadmap): coluna gerada `clients.normalized_document` (CNPJ apenas dígitos) + índice; RPCs `detect_duplicate_clients()`, `merge_clients(source, target, overrides)` e `delete_client_safely(client_id, preview)` (todas SECURITY DEFINER, admin-only). UI: `DuplicatesBanner` (alerta no topo de `/clients`), `MergeClientsDialog` (wizard 3 steps com estratégia híbrida B+A), `DeleteClientButton` (pré-check de bloqueios + confirmação por nome). Pré-check de CNPJ no `ClientForm` via `onBlur` + guarda final no submit. Lib pura `src/lib/client-merge.ts` com 9 testes unitários. Documentação em `ADMIN_TOOLS.md`.
- **Página `/settings/users` (Gestão de Usuários — item 1.3b)**: nova página dedicada admin-only com 6 componentes modulares (`UsersList`, `UserRow`, `UserActionsMenu`, `ChangeRoleDialog`, `CreateUserDialog`, `AnomaliesBanner`), todos abaixo de 50 linhas. Hook `useUsers` SaaS-ready com parâmetro `tenantId` opcional. Edge function `detect-auth-anomalies` agendada via `pg_cron` (diária 08:00 BRT) detectando órfãos, zumbis, signups em massa e contas inativas. Helper compartilhado `supabase/functions/_shared/auth-helpers.ts` com `requireRole`, `rateLimit`, `logAudit` e `jsonResponse`. Trigger `audit_user_roles_trigger` em `user_roles` registrando INSERT/UPDATE/DELETE em `audit_logs`. `handle_new_user` agora grava sucesso/falha em `application_logs` (módulo `auth`) em vez de `RAISE WARNING` silencioso.
- **Coluna Status na listagem de usuários** (`/settings/users`): cada linha exibe Confirmado / Pendente / Inativo derivado de `auth.users.email_confirmed_at` e `banned_until`.
- **RPC `list_users_for_admin`** (SECURITY DEFINER, admin-only): retorna profiles + papéis + cliente vinculado + status de auth em uma única chamada. Usada por `useUsers` no lugar de 3 queries separadas.
- **RPC `change_user_role`** (SECURITY DEFINER, admin-only): substitui papéis de um usuário de forma atômica (delete + insert dentro da função). Triggers de auditoria registram cada operação.

### Modificado
- `ClientForm.tsx`: adicionado `onBlur` no input de documento para detectar duplicata em tempo real e guarda final assíncrona no `onSubmit` exigindo confirmação humana antes de criar duplicata. Tratamento amigável do erro Postgres `23505` (violação da UNIQUE em `normalized_document`) com toast "CNPJ já cadastrado" em vez de mensagem técnica.
- **AIRDUTO LTDA mesclado** (item 1.2c): cadastro duplicado vazio (`35207c33...`) consolidado no canônico (`60ba285e...`) que concentra 1 contrato ativo, 1 chamado e 2 contatos.
- **VIZU EDITORA E DISTRIBUIDORA DE LIVROS LTDA mesclado** (item 1.2c): cadastro mais antigo (`8028b947...`) consolidado no canônico mais novo (`c9bab9b7...`), escolhido por possuir 2 contratos ativos. O único contato do source foi migrado para o target.
- **5 edge functions de gestão de usuários** (`create-user`, `create-client-user`, `delete-user`, `update-user-email`, `confirm-user-email`): permissões alinhadas via `requireRole` (admin para gestão de staff; staff completo para `create-client-user`), rate-limit 5 req/min por IP, registro padronizado em `audit_logs` e respostas de erro consistentes via `jsonResponse`.
- **`ChangeRoleDialog`**: usa a RPC atômica `change_user_role` em vez de `delete + insert` direto no client (evita estado inconsistente se o insert falhar entre as duas queries).
- **`AnomaliesBanner`**: passa a consumir a última entrada de `application_logs` (módulo `auth`, ação `detect_anomalies`) em vez de re-executar o scan completo a cada mount. Detecta também quando o cron não rodou nas últimas 25h. Botão "Verificar agora" continua invocando a edge function manualmente.
- **`AnomaliesBanner`**: erros na consulta agora propagam e renderizam banner vermelho de falha em vez de sumir silenciosamente.
- **Rota `/settings/users`**: restrita a `admin` (era `admin` + `manager`). Manager não tinha nenhuma ação executável e via tela quebrada.
- **`MergeClientsDialog`**: bloqueio explícito quando o grupo tem 3+ duplicatas, com instrução para mesclar em pares (suporte completo registrado como dívida na Seção 6).

### Corrigido
- **Página `/billing/delinquency` não carregava mais em produção** ("Erro ao carregar esta página"). Causa raiz: o embed `clients(...)` do supabase-js retornava ARRAY em runtime, mas o código acessava `inv.clients.id` / `client.client.name.toLowerCase()` como objeto, gerando `TypeError: Cannot read properties of undefined`. Corrigido com `unwrapEmbed` + tipagem `ClientRow` + guard descartando faturas órfãs com `console.warn`. Página movida de `src/pages/financial/` (legado) para `src/pages/billing/`. Pasta `financial/` removida.
### Removido
### Segurança
- **UNIQUE constraint em `clients.normalized_document` ativada** (item 1.2c): índice único parcial `uq_clients_normalized_document` (`WHERE normalized_document <> ''`). Substitui o índice não-único anterior `idx_clients_normalized_document`. Previne definitivamente o cadastro de dois clientes com o mesmo CNPJ. Erros de violação são tratados de forma amigável no `ClientForm`.
- **RLS append-only em `audit_logs`** (item 1.3b): políticas de `UPDATE` e `DELETE` bloqueadas para todos os roles, garantindo imutabilidade da trilha de auditoria. UNIQUE em `client_contacts.username` confirmada.
### Obsoleto

---

## [2026-04-24] — Estado atual pré-refatoração

Marco inicial do roadmap de refatoração. Esta entrada consolida o estado do sistema
antes do início das mudanças planejadas em `REFACTORING_ROADMAP.md`.

### Adicionado (estado consolidado)

- **Módulos ativos em produção:**
  - Autenticação e gestão de usuários (Supabase Auth + `user_roles` com RBAC)
  - Clientes, contatos e portal do cliente (com níveis `client` e `client_master`)
  - Contratos com cobranças adicionais, ajustes e SLA por contrato
  - Faturamento recorrente multi-provedor (Asaas, Banco Inter v3 com mTLS)
  - NFS-e via Asaas com fallbacks fiscais e auto-retry de notas estagnadas
  - Central de chamados (ITIL) com histórico, SLA, anexos, avaliação e atendimento unificado
  - Inventário de ativos integrado ao monitoramento via IP
  - Monitoramento (UniFi UDM, Tactical RMM, CheckMK)
  - Base de conhecimento com editor Markdown e categorias hierárquicas
  - Agenda/calendário com vínculos a entidades
  - Notificações multicanal (Push, E-mail via Resend, WhatsApp, Telegram)
  - Dashboards segmentados por papel + TV Dashboard

- **Infraestrutura:**
  - 103 tabelas no schema `public`, todas com RLS habilitada
  - 56 Edge Functions deployadas
  - 7 cron jobs ativos (geração de faturas, retries, sync de monitoramento, cleanup)
  - 14 secrets configurados (Resend, Banco Inter, Asaas, VAPID, webhooks etc.)
  - 6 storage buckets (nfse-files, certificates, email-assets, invoice-documents, ticket-attachments, knowledge-images)

- **Trabalho já concluído em sessões anteriores (rastreabilidade):**
  - Rastreabilidade de e-mails de cobrança (envio, abertura, falha)
  - Edge Function `resend-confirmation` para reenvio de confirmação (rate-limit 3/h)
  - Helpers consolidados em `_shared/email-helpers.ts`
  - Painel `InvoiceNotificationHistory` para auditoria de envios
  - Limpeza de 2 usuários órfãos em `auth.users`

### Segurança (estado consolidado)

- RLS ativa em 100% das tabelas do schema `public`
- Roles em tabela separada (`user_roles`) com função `has_role` SECURITY DEFINER
- Validação Zod em Edge Functions críticas
- Rate-limiting global de 10 req/s em endpoints públicos
- Idempotência de webhooks via tabela `webhook_events`
- Validação de assinatura HMAC em webhooks (Asaas, Inter, WhatsApp, Telegram, NFS-e)

### Obsoleto (identificado, não removido ainda)

- Edge Function `send-notification` (sem referências no código)
- Edge Functions `bootstrap-admin` e `sync-doc-devices` (uso legado)
- ~50 tabelas vazias do módulo `doc_*` (decisão pendente)
- 5 componentes React órfãos (~1.300 linhas)
- 13 componentes shadcn/ui instalados sem uso

### Pontos conhecidos pré-refatoração

- `auth-email-hook` deployado mas silencioso (webhook "Send Email Hook" não configurado no painel Supabase)
- `information_schema.triggers` retornando 0 resultados — investigar `pg_trigger` para confirmar integridade do `handle_new_user` e auditorias
- `/billing/delinquency` com double-wrap de `AppLayout` e cálculo de aging divergente do widget
- Faltam índices em FKs de `tickets` e `invoices`
- Helpers `formatDate` e `formatCurrency` duplicados em múltiplos arquivos
- Validação HMAC duplicada em 4 Edge Functions

### Backup associado a este marco

- **Backup nativo do Supabase:** a ser baixado manualmente pelo usuário via painel — ver `BACKUP_PROCEDURE.md`. **É o backup definitivo para rollback.**
- **Backup CSV complementar:** `/mnt/documents/backups/backup_2026-04-24.tar.gz` (140 KB, 103 tabelas, 2026-04-24 20:42 UTC) — apenas dados, não substitui o nativo.

### Documentos criados nesta data

- `CHANGELOG.md` (este arquivo)
- `REFACTORING_ROADMAP.md`
- `BACKUP_PROCEDURE.md`
