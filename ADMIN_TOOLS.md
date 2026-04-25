# Catálogo de Ferramentas Administrativas

Este documento cataloga as ferramentas administrativas disponíveis no sistema. Todas as ferramentas listadas aqui são **acessíveis apenas para usuários com role `admin`**.

## Gestão de Clientes

### Detector de duplicatas
- **Onde:** banner amarelo no topo da página `/clients` (`DuplicatesBanner`).
- **Como:** o banner aparece automaticamente quando há clientes com o mesmo CNPJ normalizado (apenas dígitos). Clicar em "Ver e resolver" abre uma sheet listando cada grupo com contagens (contratos, chamados, faturas).
- **Backend:** RPC `detect_duplicate_clients()` (SECURITY DEFINER, retorna grupos `≥ 2`).

### Wizard de mesclagem (`MergeClientsDialog`)
- **Quando usar:** após o detector identificar um grupo duplicado.
- **Fluxo (3 passos):**
  1. **Seleção do destino** — escolher qual cadastro permanece (canônico).
  2. **Resolução de campos** — estratégia híbrida B+A: destino prevalece; campos NULL no destino recebem do source; botão "Customizar" permite sobrescrever manualmente qualquer campo.
  3. **Confirmação** — exige digitar o nome exato do cliente source para habilitar o botão.
- **Backend:** RPC `merge_clients(source_id, target_id, field_overrides jsonb)`. Migra todas as referências (tickets, contracts, invoices, contacts, assets, calendar_events, etc.), aplica overrides, registra em `audit_logs` (action=`MERGE`) e em `client_history`, e deleta o source. Tudo em uma única transação.

### Exclusão segura (`DeleteClientButton`)
- **Onde:** botão "Excluir cliente" no header de `/clients/<id>` (visível apenas para admin).
- **Pré-check automático:** ao abrir o dialog, executa `delete_client_safely(client_id, preview=true)` que detecta bloqueios:
  - Contratos ativos (`status='active'`)
  - Chamados abertos (`status NOT IN ('resolved','closed')`)
  - Faturas pendentes ou vencidas (`status IN ('pending','overdue')`)
- Se houver bloqueios, lista o que precisa ser resolvido antes e mantém o botão de exclusão desabilitado.
- Se livre: exige digitar o nome do cliente para confirmar.
- **Backend:** RPC `delete_client_safely(client_id, preview)`. Registra em `audit_logs` (action=`DELETE`) e exclui via CASCADE.

### Pré-check de CNPJ no formulário
- **Onde:** `ClientForm.tsx` (criação e edição).
- **Como:** ao perder o foco do campo CNPJ (`onBlur`), normaliza para apenas dígitos e busca em `clients` via `normalized_document`. Se encontrar outro cliente com o mesmo CNPJ, mostra alerta visual abaixo do input (não bloqueia o submit). No `onSubmit`, executa nova checagem como guarda final e abre `window.confirm` exigindo confirmação humana antes de criar duplicata legítima.
- **Defesa final no banco:** caso o usuário tente driblar todos os pré-checks (ou em race condition), a UNIQUE constraint `uq_clients_normalized_document` rejeita o INSERT/UPDATE com erro Postgres `23505`. O formulário trata esse código específico e exibe toast amigável "CNPJ já cadastrado" em vez de mensagem técnica.

## Infraestrutura de banco

- **`clients.normalized_document`** — coluna gerada (`GENERATED ALWAYS AS regexp_replace(coalesce(document,''), '\D', '', 'g') STORED`). Indexada com **UNIQUE parcial ativo** (`uq_clients_normalized_document WHERE normalized_document <> ''`) desde 2026-04-25 (item 1.2c concluído). Tentativas de cadastrar CNPJ duplicado retornam erro Postgres `23505`, tratado de forma amigável no `ClientForm`.
- Todas as RPCs administrativas validam `has_role(auth.uid(), 'admin')` antes de executar.

---

> Próximas seções deste catálogo serão adicionadas conforme novos itens do `REFACTORING_ROADMAP.md` forem implementados.
