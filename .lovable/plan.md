
# Adicionar Emissao de NFS-e na Geracao de Faturas

## Problema Atual
A edge function `generate-monthly-invoices` cria a fatura e gera a cobranca (boleto/PIX), mas **nao emite a NFS-e**, mesmo quando o contrato tem `nfse_enabled = true`.

## O que muda

### Edge Function `generate-monthly-invoices/index.ts`
Adicionar um bloco de emissao de NFS-e apos a geracao do pagamento (apos a linha ~450), seguindo a mesma logica do fluxo "Emitir Completo" do frontend.

**Logica:**
1. Verificar se `contract.nfse_enabled === true`
2. Se sim, buscar dados complementares do contrato (`description`, `nfse_descricao_customizada`, `nfse_service_code`)
3. Chamar `supabase.functions.invoke("asaas-nfse")` com `action: "emit"` passando os dados necessarios
4. Logar sucesso ou erro da emissao

**Campos necessarios para a chamada:**
- `action: "emit"`
- `client_id`: do contrato
- `invoice_id`: da fatura recem-criada
- `contract_id`: do contrato
- `value`: valor total da fatura
- `service_description`: descricao customizada ou descricao do contrato

---

## Detalhes Tecnicos

### Alteracao no arquivo `supabase/functions/generate-monthly-invoices/index.ts`

Apos o bloco de geracao de pagamento (linha ~450), adicionar:

```text
// Auto-emit NFS-e if contract has nfse_enabled
if (contract.nfse_enabled) {
  try {
    // Fetch contract details for NFS-e
    const { data: contractDetails } = await supabase
      .from("contracts")
      .select("description, nfse_descricao_customizada, nfse_service_code")
      .eq("id", contract.id)
      .single();

    const serviceDescription = contractDetails?.nfse_descricao_customizada
      || contractDetails?.description
      || `Prestacao de servicos - ${contract.name}`;

    await supabase.functions.invoke("asaas-nfse", {
      body: {
        action: "emit",
        client_id: contract.client_id,
        invoice_id: newInvoice.id,
        contract_id: contract.id,
        value: totalAmount,
        service_description: serviceDescription,
      },
    });

    console.log(`[GEN-INVOICES] NFS-e emitida para fatura #${newInvoice.invoice_number}`);
  } catch (nfseError) {
    console.error(`[GEN-INVOICES] Erro ao emitir NFS-e para ${contract.name}:`, nfseError);
  }
}
```

### Campos adicionais na query de contratos
Adicionar `description`, `nfse_descricao_customizada` e `nfse_service_code` na select principal (linha ~131) para evitar uma query extra por contrato. Isso e mais eficiente do que buscar depois.

### Interface `Contract`
Atualizar a interface (linha ~8) para incluir os novos campos:
- `description: string | null`
- `nfse_descricao_customizada: string | null`
- `nfse_service_code: string | null`

---

## Fluxo Completo Apos Alteracao

```text
Contrato Ativo (nfse_enabled = true)
    |
    v
1. Cria Fatura (invoice)
2. Gera Itens (invoice_items)
3. Gera Cobranca (Boleto/PIX via Asaas ou Inter)
4. [NOVO] Emite NFS-e (via asaas-nfse action: "emit")
5. Envia Email/Notificacao
```

## Arquivos Modificados
- `supabase/functions/generate-monthly-invoices/index.ts` (unico arquivo)

## Riscos e Mitigacoes
- A emissao de NFS-e e envolvida em try/catch, entao um erro na NFS-e nao impede a geracao da fatura ou da cobranca
- O sistema de unicidade de NFS-e existente (verificacao de `asaas_invoice_id`) previne emissoes duplicadas caso o job rode novamente
