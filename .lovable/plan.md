

## Diagnóstico e Correções — Contratos

### Problemas encontrados

**1. Financeiro não consegue criar contratos (RLS)**
A migration anterior adicionou policy no `contracts` para `financial`, mas as tabelas auxiliares continuam bloqueadas:
- `contract_services`: policy `FOR ALL` permite apenas `admin` e `manager` — **financeiro não pode inserir/deletar serviços**
- `contract_history`: policy `FOR INSERT` usa `is_staff()` — OK, funciona

**2. Sem campo para escolher data do primeiro pagamento**
Atualmente, a data de vencimento da primeira fatura é calculada automaticamente usando `billing_day` + mês corrente. Não há opção de escolher uma data diferente (outro mês, por exemplo).

**3. Sem opção de cadastrar serviço inline**
O `ContractServicesSection` exibe apenas um `Select` com serviços existentes. Se o serviço não existe, o usuário precisa sair do formulário para criá-lo.

---

### Plano de correção

#### 1. Migração SQL — RLS para `contract_services`
Adicionar policy para financial:
```sql
CREATE POLICY "Financial can manage contract services"
ON public.contract_services FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'financial'))
WITH CHECK (public.has_role(auth.uid(), 'financial'));
```

#### 2. Campo "Data do Primeiro Pagamento" (`ContractForm.tsx`)
- Adicionar campo `first_payment_date` ao schema (string opcional, só visível quando `generate_initial_invoice` está ativo)
- Substituir o cálculo fixo de `dueDate` na mutation pelo valor desse campo
- Renderizar um `DatePickerField` clicável dentro do bloco de "Gerar primeira cobrança"
- Atualizar a exibição da competência/vencimento para refletir a data escolhida

#### 3. Cadastro inline de serviço (`ContractServicesSection.tsx`)
- Adicionar botão "Novo Serviço" ao lado do select de serviços
- Abrir um `Sheet` (lateral) com o `ServiceForm` já existente
- Ao salvar com sucesso, invalidar a query `services-active` e selecionar automaticamente o novo serviço

