
# Plano: Corrigir Erros de Validação na Reemissão de NFS-e

## Diagnóstico

Identificamos **duas causas raiz** para os erros de validação mesmo com dados preenchidos:

### Problema 1: Campo `zip_code` não buscado

A query de validação do cliente no `NfseDetailsSheet.tsx` (linha 162) **não inclui `zip_code`**:

```typescript
// ATUAL - falta zip_code
.select("name, document, address, email")
```

A validação exige CEP com 8 dígitos, mas como o campo não é buscado, sempre falha.

### Problema 2: Estados não sincronizam com prop `nfse`

Os estados de edição são inicializados com `useState`, que só roda na montagem inicial:

```typescript
const [valor, setValor] = useState<number>(nfse?.valor_servico ?? 0);
const [competencia, setCompetencia] = useState<string>(normalizeCompetencia(nfse?.competencia));
const [descricao, setDescricao] = useState<string>(nfse?.descricao_servico ?? "");
```

Quando o usuário abre o sheet para uma NFS-e diferente (ou a mesma após atualização), os valores **NÃO** são atualizados - permanecem os da sessão anterior.

### Evidências

Dados no banco estão corretos:
| Campo | Valor |
|-------|-------|
| `valor_servico` | 1461.44 |
| `competencia` | 2026-02-01 |
| `descricao_servico` | Serviços de TI |
| `client.zip_code` | 99025030 |

Mas a validação recebe zeros/vazios dos estados desatualizados.

---

## Solução

### Correção 1: Adicionar `zip_code` na query

```typescript
// DE:
.select("name, document, address, email")

// PARA:
.select("name, document, address, email, zip_code")
```

### Correção 2: Sincronizar estados com useEffect

Adicionar um `useEffect` que atualiza os estados quando a prop `nfse` mudar:

```typescript
import { useEffect } from "react"; // já importado via useMemo

// Após os useState existentes:
useEffect(() => {
  if (nfse) {
    setValor(nfse.valor_servico ?? 0);
    setCompetencia(normalizeCompetencia(nfse.competencia));
    setDescricao(nfse.descricao_servico ?? "");
  }
}, [nfse?.id, nfse?.valor_servico, nfse?.competencia, nfse?.descricao_servico]);
```

Isso garante que quando:
- O usuário abre outra NFS-e
- A mesma NFS-e é recarregada (após atualização)

Os estados de edição refletem os dados atuais.

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Adicionar `zip_code` na query (linha 162) e adicionar `useEffect` para sincronizar estados |

---

## Fluxo Corrigido

```text
1. Usuário abre NFS-e pendente do cliente CAPASEMU
   ↓
2. Query busca cliente COM zip_code: "99025030" ✓
   ↓
3. useEffect sincroniza estados:
   - valor: 1461.44 ✓
   - competencia: "2026-02" ✓
   - descricao: "Serviços de TI" ✓
   ↓
4. Validação recebe dados corretos
   ↓
5. Sem erros de validação ✓
```

---

## Resultado Esperado

1. CEP do cliente será validado corretamente (campo presente na query)
2. Valor, competência e descrição sempre refletirão os dados atuais da NFS-e
3. Não haverá mais erros de validação falsos quando os dados estão preenchidos
