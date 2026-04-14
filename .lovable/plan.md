

## Plano: Exibir Data de Início, Término e Dia de Vencimento na Listagem de Contratos

### Contexto

A coluna "Vigência" atual já mostra `start_date` e `end_date`, mas o campo `billing_day` (dia de vencimento mensal) não é exibido. O usuário quer ver claramente as datas dos contratos ativos e o dia de vencimento das cobranças.

### Alterações em `src/pages/contracts/ContractsPage.tsx`

1. **Separar a coluna "Vigência" em duas informações mais claras:**
   - Manter "Vigência" com `start_date → end_date` (ou badge "Ilimitado")
   - Adicionar uma nova coluna **"Vencimento"** após "Vigência" exibindo o `billing_day` do contrato (ex: "Dia 10", "Dia 15")

2. **Coluna "Vencimento":**
   - Exibir `Dia {billing_day}` quando o campo existir
   - Exibir "—" quando `billing_day` for `null`
   - Aplicar ícone de calendário para consistência visual

3. **Ajustar skeletons e `colSpan`** para acomodar a nova coluna (de 10 para 11)

### Resultado Visual

```text
| Contrato | Cliente | Modelo | Valor Mensal | Vigência          | Vencimento | Próx. Reajuste | ...
|----------|---------|--------|-------------|-------------------|------------|----------------|
| Cloud X  | ACME    | Ilim.  | R$ 495,00   | 13/04/26 Ilimitado| Dia 10     | —              |
```

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/pages/contracts/ContractsPage.tsx` | Adicionar coluna "Vencimento" no header, body, e skeleton |

