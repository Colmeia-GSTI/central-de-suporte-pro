

## Plano: Correções em DocTableLicenses + Migração

### Correção 1 — Padronizar license_type para inglês/minúsculo

Alterar `DocTableLicenses.tsx`:

- `LICENSE_TYPES` de `["Windows", "Office/M365", "Antivírus", "Outro"]` para objetos `{ value, label }`:
  ```
  { value: "windows", label: "Windows" }
  { value: "office", label: "Office / Microsoft 365" }
  { value: "antivirus", label: "Antivírus" }
  { value: "other", label: "Outro" }
  ```
- Todas as comparações no componente (`isPerpetual`, `getAntivirusProgress`, `modelOptions`, blocos condicionais do formulário) passam a usar os valores em inglês.
- Na tabela de listagem, exibir o label amigável via mapeamento.
- `isPerpetual`: `"windows"`, `"office"` + `"Perpétua"`, `"other"` + `"Perpétua"`.
- `getAntivirusProgress`: `"antivirus"`.
- useEffect auto-calc: `"antivirus"`.

### Correção 2 — Campo linked_emails (array)

**Migração SQL:**
```sql
ALTER TABLE doc_licenses ADD COLUMN linked_emails text[] DEFAULT '{}';
```

**No componente** (bloco `office`):
- Substituir o input único de e-mail por um componente inline de tags:
  - Estado local `emailInput` para o campo de digitação.
  - Lista de e-mails renderizada como `Badge` com botão X para remover.
  - Botão "+" e Enter para adicionar.
  - Limite de 6 e-mails, validação básica com regex.
  - Texto informativo abaixo.
- Interface `LicenseRow` ganha `linked_emails: string[] | null`.
- `EMPTY` ganha `linked_emails: null`.
- `openEdit`: ao carregar, fazer fallback `linked_emails ?? (linked_email ? [linked_email] : [])`.
- `handleSave`: gravar `linked_emails` no payload.
- Na listagem expandida, exibir os e-mails do array (com fallback para `linked_email`).

### Correção 3 — Expiry date read-only no antivírus

No bloco `antivirus` do formulário:
- Campo de data de vencimento com `readOnly`, `disabled`, classe `text-muted-foreground`.
- Label: "Data de vencimento (calculado automaticamente)".
- Se `!form.start_date || !form.months_contracted`, exibir "—" em vez do input.

### Correção 4 — Limpar dados de teste

Executar via insert tool (DELETE):
```sql
DELETE FROM doc_licenses WHERE product_name LIKE '% - TESTE';
DELETE FROM doc_alerts WHERE title LIKE '%TESTE%' OR description LIKE '%TESTE%';
```

### Arquivos alterados

| Arquivo | Acao |
|---|---|
| `src/components/clients/documentation/DocTableLicenses.tsx` | Correções 1, 2, 3 |
| Migração SQL | ADD COLUMN `linked_emails text[]` |
| Insert tool (DELETE) | Limpar dados de teste |

