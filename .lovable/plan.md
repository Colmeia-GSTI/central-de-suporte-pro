

# Auditoria de Segurança & Plano de Blindagem (Guardian)

## Achados da Investigação

### Vulnerabilidades Críticas (ERRO — Security Scan)

| # | Problema | Risco |
|---|---|---|
| 1 | **`nfse_cancellation_log` UPDATE com `USING (true)`** | Qualquer usuário autenticado (inclusive clientes) pode sobrescrever registros de cancelamento de NFS-e |
| 2 | **`storage_config` expõe `access_key`/`secret_key` ao role `financial`** | Credenciais de armazenamento cloud legíveis por não-admins |
| 3 | **`application_logs` INSERT com `WITH CHECK (true)`** | Qualquer requisição (inclusive anon) pode inserir logs falsos |
| 4 | **Leaked Password Protection desabilitada** | Senhas comprometidas em vazamentos não são bloqueadas |

### Vulnerabilidades Médias (WARN)

| # | Problema | Risco |
|---|---|---|
| 5 | **`certificates.senha_hash` legível por todos os staff** | Técnicos acessam hash de senha de certificados digitais |
| 6 | **`company_settings.certificado_senha_hash` legível por todos os staff** | Idem para certificado da empresa |
| 7 | **`software_licenses.license_key` em texto plano para todos os staff** | View `software_licenses_safe` existe mas tabela base não é restrita |

### Lacunas de Frontend (Sem PermissionGate)

| Página/Componente | Ações sem proteção |
|---|---|
| `CalendarPage.tsx` | Create, Edit, Delete de eventos — nenhum gate |
| `src/components/tickets/*` | TicketDetails, TicketCommentsTab, TicketTimeTracker — mutações sem gate |
| `MonitoringPage.tsx` | Acknowledge alerts — sem verificação de permissão |
| Bulk actions em `TicketsPage.tsx` | Mutations de status/prioridade/atribuição em lote sem `can()` check |

### Lacuna Arquitetural

- **`useSecureAction` referenciado no SECURITY.md e `permissions.ts` mas NUNCA implementado.** Mutations no frontend confiam apenas em RLS, sem validação de permissão client-side antes de tentar a operação.

---

## Plano de Correção (6 Tarefas)

### Tarefa 1: Corrigir RLS — Políticas Permissivas Demais
**Migration SQL:**
- `nfse_cancellation_log`: Restringir UPDATE a `admin`/`financial` via `is_financial_admin(auth.uid())`
- `application_logs`: Restringir INSERT a `authenticated` com `is_staff(auth.uid())`
- `storage_config`: Remover política SELECT do `financial`, manter apenas admin

### Tarefa 2: Restringir Acesso a Dados Sensíveis
**Migration SQL:**
- `certificates`: Criar VIEW `certificates_safe` sem `senha_hash`/`arquivo_url`, restringir tabela base a `admin`/`financial`
- `company_settings`: Restringir SELECT de `certificado_senha_hash` a `admin`/`financial` via policy refinada
- `software_licenses`: Restringir tabela base a `admin`, redirecionar staff para `software_licenses_safe`

### Tarefa 3: Criar Hook `useSecureAction`
**Arquivo:** `src/hooks/useSecureAction.ts`
```text
Hook que wrapa mutations com verificação de permissão:
- Recebe module + action
- Valida via usePermissions().can() ANTES de executar
- Se negado: toast de erro + log + aborta
- Se permitido: executa a mutation normalmente
```
Refatorar mutations críticas (delete em contratos, clientes, inventário, tickets) para usar este hook.

### Tarefa 4: Adicionar PermissionGate nas Páginas Descobertas
- **CalendarPage.tsx**: Gates em botões de criar/editar/deletar eventos
- **TicketDetails e sub-componentes**: Gates em edição de status, comentários, time entries
- **MonitoringPage.tsx**: Gate em acknowledge de alertas
- **TicketsPage.tsx bulk actions**: Verificação `can('tickets', 'manage')` antes de executar bulk mutations

### Tarefa 5: Habilitar Leaked Password Protection
Usar configuração de auth para ativar proteção contra senhas vazadas.

### Tarefa 6: Sanitização — Auditoria de `dangerouslySetInnerHTML`
- `chart.tsx`: Injeção de CSS via `dangerouslySetInnerHTML` — verificar que o conteúdo é 100% gerado internamente (sem input do usuário). Se necessário, migrar para `insertRule()`.

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| **Migration SQL** | RLS fixes (nfse_cancellation_log, storage_config, application_logs, certificates, software_licenses) |
| `src/hooks/useSecureAction.ts` | Novo hook |
| `src/pages/calendar/CalendarPage.tsx` | Adicionar PermissionGate |
| `src/components/tickets/TicketDetails.tsx` | Adicionar PermissionGate |
| `src/components/tickets/TicketCommentsTab.tsx` | Adicionar PermissionGate |
| `src/components/tickets/TicketTimeTracker.tsx` | Adicionar PermissionGate |
| `src/pages/monitoring/MonitoringPage.tsx` | Adicionar PermissionGate |
| `src/pages/tickets/TicketsPage.tsx` | Guard em bulk actions |
| `SECURITY.md` | Atualizar documentação |

