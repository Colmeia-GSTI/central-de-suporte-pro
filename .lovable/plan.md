
# Plano: Formatação Automática de CEP e Padronização de Armazenamento

## Objetivo

1. **Adicionar formatação automática** no campo CEP durante digitação: `00000-000`
2. **Padronizar armazenamento** no banco: sempre salvar apenas 8 dígitos numéricos

---

## Implementação

### 1. Criar Função de Formatação de CEP

Adicionar nova função `formatCEP` em `src/lib/utils.ts`, seguindo o mesmo padrão da `formatPhone`:

```typescript
/**
 * Format CEP to Brazilian display format: 00000-000
 * Always shows formatted version, stores only 8 digits
 */
export function formatCEP(value: string | null | undefined): string {
  if (!value) return "";
  const numbers = value.replace(/\D/g, "");
  
  if (numbers.length === 0) return "";
  if (numbers.length <= 5) return numbers;
  
  // Format: 00000-000
  return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
}
```

---

### 2. Atualizar Campo CEP no ClientForm

Modificar o campo `zip_code` em `src/components/clients/ClientForm.tsx`:

#### 2.1 Importar a nova função

```typescript
import { cn, formatPhone, formatCEP, getErrorMessage } from "@/lib/utils";
```

#### 2.2 Formatar valor inicial ao carregar cliente

Linha 92 - Adicionar formatação:

```typescript
// DE:
zip_code: client?.zip_code || "",

// PARA:
zip_code: formatCEP(client?.zip_code) || "",
```

#### 2.3 Formatar CEP retornado pela consulta CNPJ

Linha 173 - Já remove caracteres, mas adicionar formatação visual:

```typescript
// DE:
form.setValue("zip_code", data.cep?.replace(/\D/g, "") || "");

// PARA:
form.setValue("zip_code", formatCEP(data.cep) || "");
```

#### 2.4 Adicionar handler de formatação no campo

Linhas 594-606 - Atualizar renderização:

```tsx
<FormField
  control={form.control}
  name="zip_code"
  render={({ field }) => (
    <FormItem>
      <FormLabel>CEP</FormLabel>
      <FormControl>
        <Input 
          placeholder="00000-000" 
          maxLength={9}  // 5 dígitos + hífen + 3 dígitos
          {...field}
          onChange={(e) => {
            const formatted = formatCEP(e.target.value);
            field.onChange(formatted);
          }}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

### 3. Padronizar Armazenamento (Apenas Números)

Modificar o payload de salvamento na mutation (linhas 276-293):

```typescript
// DE:
zip_code: data.zip_code || null,

// PARA:
zip_code: data.zip_code?.replace(/\D/g, "") || null,
```

Isso garante que **independente da formatação visual**, o banco sempre salva `99025030` em vez de `99025-030`.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/utils.ts` | Adicionar função `formatCEP` |
| `src/components/clients/ClientForm.tsx` | Importar `formatCEP`, formatar campo, sanitizar no save |

---

## Fluxo Final

```text
┌──────────────────────────────────────────────────────────┐
│  ENTRADA: Usuário digita "99025030"                      │
│                 ↓                                        │
│  FORMATAÇÃO: Exibe "99025-030" no campo                  │
│                 ↓                                        │
│  SALVAMENTO: Armazena "99025030" no banco                │
│                 ↓                                        │
│  CARREGAMENTO: Busca "99025030", exibe "99025-030"       │
└──────────────────────────────────────────────────────────┘
```

---

## Benefícios

1. **UX melhorada**: Usuário vê o CEP formatado corretamente
2. **Dados consistentes**: Banco sempre armazena apenas números
3. **Compatibilidade**: APIs (Asaas, Banco Inter) já esperam apenas números
4. **Validação simplificada**: Validação sempre compara 8 dígitos numéricos
