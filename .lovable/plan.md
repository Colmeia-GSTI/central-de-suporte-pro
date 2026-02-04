
# Correção: Serviços não aparecem no dropdown do contrato

## Diagnóstico

Após investigação detalhada, identifiquei que:

1. **Os serviços ESTÃO sendo carregados corretamente do banco de dados** - A requisição para `/services?is_active=eq.true` retornou status 200 com 2 serviços:
   - "Gestão de TI - Remoto" (R$ 650,00)
   - "Serviços de T.I." (R$ 0,00)

2. **O problema é um erro de React que está quebrando a página** - O erro "Failed to execute 'removeChild' on 'Node'" está impedindo a renderização correta do formulário.

3. **Causa raiz identificada**: Os campos `generate_initial_invoice`, `generate_payment` e `send_notification` foram adicionados ao schema Zod mas **não foram incluídos nos defaultValues** do formulário. Isso faz com que os componentes `Checkbox` alternem entre estado "uncontrolled" e "controlled", causando:
   - Warning: "Checkbox is changing from uncontrolled to controlled"
   - Crash do React ao tentar remover nós DOM inexistentes

---

## Solução

### Arquivo a modificar: `src/components/contracts/ContractForm.tsx`

Adicionar os campos faltantes nos defaultValues do useForm:

```typescript
defaultValues: {
  // ... campos existentes ...
  
  // ADICIONAR - Initial invoice generation defaults
  generate_initial_invoice: false,
  generate_payment: true,
  send_notification: true,
  
  // ... resto dos campos ...
}
```

---

## Detalhes Técnicos

### Antes (bugado)
```typescript
defaultValues: {
  name: contractData?.name || "",
  client_id: contractData?.client_id || "",
  // ... outros campos ...
  payment_preference: (contractData as any)?.payment_preference || "boleto",
  // FALTAM: generate_initial_invoice, generate_payment, send_notification
  adjustment_date: (contractData as any)?.adjustment_date || "",
  // ...
}
```

### Depois (corrigido)
```typescript
defaultValues: {
  name: contractData?.name || "",
  client_id: contractData?.client_id || "",
  // ... outros campos ...
  payment_preference: (contractData as any)?.payment_preference || "boleto",
  // Initial invoice generation (only for new contracts)
  generate_initial_invoice: false,
  generate_payment: true,
  send_notification: true,
  // Adjustment defaults
  adjustment_date: (contractData as any)?.adjustment_date || "",
  // ...
}
```

---

## Por que isso resolve o problema

| Componente | Antes | Depois |
|------------|-------|--------|
| `<Checkbox checked={field.value}>` | `field.value` era `undefined` (uncontrolled) | `field.value` é `false` ou `true` (controlled) |
| Estado React | Inconsistente → crash | Estável → funciona |
| Dropdown de serviços | Não renderiza devido ao crash | Renderiza normalmente |

---

## Impacto

- **Nenhuma alteração no banco de dados**
- **Nenhuma alteração em edge functions**
- **Apenas 1 arquivo modificado**: `ContractForm.tsx` (3 linhas adicionadas)

Esta correção irá:
1. Eliminar o warning "Checkbox is changing from uncontrolled to controlled"
2. Eliminar o erro "Failed to execute 'removeChild' on 'Node'"
3. Permitir que o formulário de contrato renderize completamente
4. O dropdown de serviços voltará a funcionar normalmente
