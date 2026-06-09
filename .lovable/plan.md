
## Investigação concluída — duas causas raiz distintas

### Problema 1 — Boletos duplicados no Asaas

**Causa raiz:** Quando o CNPJ ou endereço de um cliente é alterado, o `ClientForm.tsx` (linhas 351‑364) marca `asaas_payment_deleted_at = now()` em todas as faturas pendentes/atrasadas, **mas não cancela o boleto antigo no Asaas**. Em seguida, o bloco de "drift detection" do `asaas-nfse/create_payment` (linhas 2109‑2203) detecta a marcação, limpa os campos locais e cria um boleto novo no Asaas — também **sem deletar o boleto antigo no Asaas**. Resultado: o cliente continua com 2+ cobranças ativas em Asaas para a mesma fatura, recebe boleto/PIX duplicados por e‑mail/SMS.

A única rota que cancela corretamente é o `regenerate_payment` manual (linhas 2594‑2602), porque ele chama `DELETE /payments/{id}` antes de limpar. O caminho automático (drift) está incompleto.

### Problema 2 — E‑mail do cliente não salva no cadastro

**Causa raiz:** A tabela `public.clients` não tem nenhuma policy de UPDATE para a role `technician`. As policies atuais permitem UPDATE apenas para:
- `is_financial_admin` (admin / financial / manager)
- o próprio cliente dono do registro (client / client_master)

Quando um técnico (ex.: `suporte02@colmeiagsti.com.br`) edita um cliente, o `supabase.from("clients").update(...)` retorna `error = null` mas afeta 0 linhas (comportamento padrão do PostgREST com RLS). O `ClientForm` interpreta isso como sucesso e mostra o toast "Cliente atualizado" — porém nada foi persistido.

Adicionalmente, o código não verifica `count` nem confere o registro depois do UPDATE, o que mascarou o bug.

---

## Plano de correção

### Backend / Banco

1. **Nova policy UPDATE para técnicos em `public.clients`** (migration):
   - `USING (is_technician_only(auth.uid()))`
   - `WITH CHECK` que impede técnico de alterar `document`, `normalized_document` e `state_registration` (mantém a memória `clients/management-and-permissions` — CNPJ/IE read‑only para técnicos após criação). Tudo o resto (nome, e‑mail, telefone, endereço, observações) fica liberado.

2. **`asaas-nfse/index.ts` — drift detection deve cancelar antes de regenerar** (linhas 2170‑2203):
   - Antes do `update` que limpa os campos locais, chamar `DELETE /payments/{old_payment_id}` no Asaas (tolerando 404 / já deletado, igual ao `regenerate_payment`).
   - Registrar o cancelamento em `audit_logs` (`asaas_payment_auto_cancelled` com `reason` e `correlation_id`).

3. **`ClientForm.tsx` — usar `regenerate_payment` em vez de marcar `asaas_payment_deleted_at`** (linhas 351‑364):
   - Buscar as faturas pendentes/atrasadas do cliente.
   - Para cada uma, invocar `asaas-nfse` action `regenerate_payment` com `reason: "Dados cadastrais alterados (CNPJ/endereço)"`. Isso garante cancelamento no Asaas + limpeza local + audit.
   - Em paralelo (limite de concorrência 3) para não travar a UI; toast informando "X boletos serão regenerados".

4. **Validar UPDATE no `ClientForm`** (linhas 327‑331):
   - Trocar para `.update(payload).eq("id", client.id).select("id")` e verificar se retornou ao menos 1 linha. Se 0, lançar erro "Sem permissão para alterar este cliente" → toast destrutivo. Isso impede que qualquer regressão futura de RLS volte a mascarar o bug.

### Reconciliação dos boletos já duplicados

5. Script único de auditoria (executado pelo agente após aprovação):
   - Listar todas as faturas `pending`/`overdue` cujo cliente sofreu update de CNPJ recente.
   - Para cada uma, listar os payments do `customer_id` no Asaas e cancelar os que não correspondem ao `asaas_payment_id` atual da fatura.
   - Output: relatório em `/mnt/documents/duplicate-boletos-reconciliation.csv`.

### Verificação

- Testar: alterar e‑mail de cliente logado como técnico → deve salvar e refletir no banco.
- Testar: alterar CNPJ de um cliente de teste → confirmar via `audit_logs` que o payment antigo foi cancelado no Asaas e que apenas um novo permanece ativo.
- `tsc --noEmit`, vitest run dos testes relacionados (`client-form`, `asaas-nfse`).

### Arquivos afetados

- nova migration em `supabase/migrations/`
- `supabase/functions/asaas-nfse/index.ts` (drift cancela no Asaas)
- `src/components/clients/ClientForm.tsx` (regenerate_payment + validar UPDATE)
- `CHANGELOG.md`
- (apenas leitura/insert via script): nenhum arquivo permanente
