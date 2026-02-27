
# Correcao Completa: NFS-e Alinhada com Asaas e XML Nacional

## Analise dos XMLs Fornecidos

Dois cenarios reais foram identificados nos XMLs de notas emitidas:

**Nota #99 (Bortolini):** ISS NAO retido (`tpRetISSQN=1`), aliquota Simples Nacional 6%, valor liquido = valor bruto (R$ 1.600,00)

**Nota #78 (CAPASEMU):** ISS RETIDO pelo tomador (`tpRetISSQN=2`), aliquota 2%, ISS retido = R$ 29,23, valor liquido = R$ 1.432,21

Estes cenarios demonstram que o sistema precisa suportar:
1. Aliquota ISS configuravel por contrato
2. Flag de ISS retido pelo tomador (por contrato/cliente)
3. Campos obrigatorios da API Asaas: `taxes` (obrigatorio), `observations` (obrigatorio), `deductions` (obrigatorio)
4. Campo `ir` (nao `irrf`) no objeto taxes

## Problemas Identificados

### 1. Campo `irrf` deveria ser `ir` no payload Asaas
A documentacao Asaas usa `ir` para Imposto de Renda. Nosso codigo envia `irrf` em `emit` (linha 902) e `emit_standalone` (linha 1174).

### 2. `emit_standalone` ainda tem `if` condicional no taxes
A action `emit` ja foi corrigida, mas `emit_standalone` (linhas 1166-1177) omite o `taxes` inteiro quando nenhum imposto e informado.

### 3. Campos `observations` e `deductions` ausentes
A API marca ambos como **required**. Nenhuma das 3 actions os envia.

### 4. `emit_test` sem `taxes`
A action de teste (linhas 1270-1275) nao inclui `taxes`, `observations` nem `deductions`.

### 5. Contrato nao armazena aliquota ISS
A tabela `contracts` nao tem coluna `nfse_aliquota`. O formulario de contratos nao possui campo para preencher. O `generate-monthly-invoices` nao envia `iss_rate` na chamada `asaas-nfse`.

### 6. Contrato nao armazena flag de ISS retido
A tabela `contracts` nao tem coluna `nfse_iss_retido`. Alguns clientes (como CAPASEMU) exigem retencao de ISS na fonte.

## Correcoes

### 1. Migracao de Banco - Novas colunas em `contracts`

```sql
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS nfse_aliquota numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nfse_iss_retido boolean DEFAULT false;

COMMENT ON COLUMN contracts.nfse_aliquota IS 'Aliquota ISS (%) para emissao automatica de NFS-e';
COMMENT ON COLUMN contracts.nfse_iss_retido IS 'Se o ISS e retido pelo tomador do servico';
```

### 2. Formulario de Contratos (`ContractForm.tsx`)

Na secao NFS-e (quando `nfse_enabled = true`), adicionar:

- **Campo "Aliquota ISS (%)"**: Input numerico, min 0, max 5, step 0.01. Pre-preenchido automaticamente quando o usuario selecionar um codigo de servico (usando `aliquota_sugerida` do `ServiceCodeSelect`).
- **Switch "ISS Retido pelo Tomador"**: Toggle para indicar que o cliente retira o ISS na fonte. Com descricao explicativa.
- Atualizar schema Zod com `nfse_aliquota` e `nfse_iss_retido`.
- Incluir ambos no payload de insert/update do contrato.

### 3. Edge Function `asaas-nfse/index.ts`

**Action `emit` (linhas 895-904):**
```text
invoicePayload.observations = "";
invoicePayload.deductions = 0;
invoicePayload.taxes = {
  retainIss: retain_iss || false,
  iss: iss_rate || 0,
  pis: pis_value || 0,
  cofins: cofins_value || 0,
  csll: csll_value || 0,
  ir: irrf_value || 0,
  inss: inss_value || 0,
};
```

**Action `emit_standalone` (linhas 1166-1177):**
```text
invoicePayload.observations = "";
invoicePayload.deductions = 0;
invoicePayload.taxes = {
  retainIss: issRetidoValue || false,
  iss: aliquotaIss || 0,
  pis: pis_value || 0,
  cofins: cofins_value || 0,
  csll: csll_value || 0,
  ir: irrf_value || 0,
  inss: inss_value || 0,
};
```

**Action `emit_test` (linhas 1270-1275):**
```text
testPayload.observations = "Teste de homologacao";
testPayload.deductions = 0;
testPayload.taxes = {
  retainIss: false,
  iss: 0,
  pis: 0,
  cofins: 0,
  csll: 0,
  ir: 0,
  inss: 0,
};
```

### 4. Edge Function `generate-monthly-invoices/index.ts`

**SELECT do contrato (linhas 132-153):** Adicionar `nfse_aliquota` e `nfse_iss_retido` ao select.

**Chamada asaas-nfse emit (linhas 553-562):** Adicionar `iss_rate` e `retain_iss`:
```text
body: {
  action: "emit",
  client_id: contract.client_id,
  invoice_id: newInvoice.id,
  contract_id: contract.id,
  value: totalAmount,
  service_description: serviceDescription,
  municipal_service_code: contract.nfse_service_code || undefined,
  iss_rate: contract.nfse_aliquota || 0,
  retain_iss: contract.nfse_iss_retido || false,
},
```

**Retry de NFS-e (linhas 855-865):** Buscar `nfse_aliquota` e `nfse_iss_retido` do contrato e incluir no body.

## Resumo de Arquivos

| Arquivo | Alteracao |
|---|---|
| Migracao SQL | Adicionar colunas `nfse_aliquota` e `nfse_iss_retido` na tabela `contracts` |
| `src/components/contracts/ContractForm.tsx` | Campos aliquota ISS e ISS retido na secao NFS-e |
| `supabase/functions/asaas-nfse/index.ts` | Corrigir `irrf` para `ir`, remover `if` em `emit_standalone`, adicionar `observations`/`deductions` nas 3 actions |
| `supabase/functions/generate-monthly-invoices/index.ts` | Adicionar `nfse_aliquota` e `nfse_iss_retido` ao SELECT e passar `iss_rate`/`retain_iss` no body |

## Cenarios Cobertos

| Cenario | Exemplo Real | Resultado |
|---|---|---|
| ISS NAO retido, aliquota 6% SN | Nota #99 Bortolini | `retainIss: false, iss: 6` |
| ISS RETIDO pelo tomador, aliquota 2% | Nota #78 CAPASEMU | `retainIss: true, iss: 2` |
| NFS-e avulsa sem tributos | Dialog avulsa | `taxes` com zeros, API aceita |
| NFS-e de teste | Homologacao | Payload completo com todos campos obrigatorios |
| Contrato novo com NFS-e | Formulario | Aliquota e retencao configuraveis |
| CRON mensal automatico | generate-monthly-invoices | `iss_rate` e `retain_iss` do contrato |
