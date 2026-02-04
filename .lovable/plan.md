

# Ordenar Codigos de Servico por Uso no Seletor de NFS-e

## Objetivo

Melhorar a usabilidade do seletor de codigo de servico (LC 116/2003) ao priorizar os codigos mais utilizados, evitando que o usuario tenha que buscar repetidamente os mesmos codigos.

---

## Contexto Atual

O componente `NfseServiceCodeCombobox` usado na emissao de NFS-e avulsa:
- Busca codigos da tabela `nfse_service_codes`
- Ordena apenas por `codigo_tributacao` (alfabetico)
- Nao considera frequencia de uso

A tabela `nfse_history` possui a coluna `codigo_tributacao` que registra qual codigo foi usado em cada emissao, permitindo calcular estatisticas de uso.

---

## Solucao Proposta

### Logica de Ordenacao (3 grupos prioritarios)

```text
1. RECENTES     -> Usados nos ultimos 30 dias (ordenados por data)
2. FREQUENTES   -> Mais usados (ordenados por contagem)
3. DEMAIS       -> Ordem alfabetica padrao
```

### Indicadores Visuais

- Badge "Recente" (verde) para codigos usados nos ultimos 30 dias
- Badge "Frequente" (azul) para codigos com mais de 3 usos totais

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/billing/nfse/NfseServiceCodeCombobox.tsx` | Adicionar query de estatisticas de uso e logica de ordenacao |
| `src/components/nfse/ServiceCodeSelect.tsx` | Aplicar mesma logica de ordenacao (componente alternativo) |

---

## Detalhes Tecnicos

### 1. Query de Estatisticas de Uso

Buscar estatisticas de uso dos codigos de servico a partir da tabela `nfse_history`:

```typescript
// Nova query para buscar estatisticas de uso
const { data: usageStats = [] } = useQuery({
  queryKey: ["nfse-service-code-usage"],
  queryFn: async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data, error } = await supabase
      .from("nfse_history")
      .select("codigo_tributacao, created_at")
      .not("codigo_tributacao", "is", null)
      .in("status", ["autorizada", "pendente", "processando"]);
    
    if (error) throw error;
    
    // Agrupar por codigo: contar uso total e verificar uso recente
    const stats = new Map<string, { count: number; lastUsed: Date | null }>();
    
    for (const row of data || []) {
      const code = row.codigo_tributacao;
      const createdAt = new Date(row.created_at);
      const existing = stats.get(code) || { count: 0, lastUsed: null };
      
      stats.set(code, {
        count: existing.count + 1,
        lastUsed: !existing.lastUsed || createdAt > existing.lastUsed 
          ? createdAt 
          : existing.lastUsed,
      });
    }
    
    return stats;
  },
  staleTime: 5 * 60 * 1000, // Cache por 5 minutos
});
```

### 2. Logica de Ordenacao Inteligente

```typescript
const sortedCodes = useMemo(() => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return [...codes].sort((a, b) => {
    const statsA = usageStats.get(a.codigo_tributacao);
    const statsB = usageStats.get(b.codigo_tributacao);
    
    // Criterio 1: Recentes primeiro (usados nos ultimos 30 dias)
    const aRecent = statsA?.lastUsed && statsA.lastUsed > thirtyDaysAgo;
    const bRecent = statsB?.lastUsed && statsB.lastUsed > thirtyDaysAgo;
    
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    
    // Se ambos sao recentes, ordenar pelo mais recente
    if (aRecent && bRecent) {
      return (statsB?.lastUsed?.getTime() || 0) - (statsA?.lastUsed?.getTime() || 0);
    }
    
    // Criterio 2: Frequentes (mais de 3 usos)
    const aFrequent = (statsA?.count || 0) > 3;
    const bFrequent = (statsB?.count || 0) > 3;
    
    if (aFrequent && !bFrequent) return -1;
    if (!aFrequent && bFrequent) return 1;
    
    // Se ambos sao frequentes, ordenar por contagem
    if (aFrequent && bFrequent) {
      return (statsB?.count || 0) - (statsA?.count || 0);
    }
    
    // Criterio 3: Ordem alfabetica
    return a.codigo_tributacao.localeCompare(b.codigo_tributacao);
  });
}, [codes, usageStats]);
```

### 3. Badges Visuais de Prioridade

Adicionar indicadores visuais para facilitar identificacao:

```tsx
{/* Badge de uso recente */}
{isRecentlyUsed && (
  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 shrink-0">
    Recente
  </Badge>
)}

{/* Badge de uso frequente */}
{isFrequent && !isRecentlyUsed && (
  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 shrink-0">
    Frequente
  </Badge>
)}
```

### 4. Tipo Atualizado

```typescript
export type NfseServiceCode = {
  id: string;
  codigo_tributacao: string;
  descricao: string;
  cnae_principal: string | null;
  aliquota_sugerida: number | null;
  categoria: string | null;
};

// Tipo para estatisticas de uso
type UsageStats = Map<string, { 
  count: number; 
  lastUsed: Date | null;
}>;
```

---

## Fluxo de Ordenacao

```text
CARREGAR CODIGOS
      |
      v
BUSCAR ESTATISTICAS
(nfse_history)
      |
      v
CALCULAR PRIORIDADE
      |
 +----+----+----+
 |    |    |    |
 v    v    v    v
RECENTE  FREQ  OUTROS
(<30d)  (>3x)  (abc)
 |    |    |
 v    v    v
ORDENAR E EXIBIR
(com badges visuais)
```

---

## Exemplo Visual Final

```text
+------------------------------------------------+
| Buscar codigo ou descricao...                  |
+------------------------------------------------+
| [Todos] [Informatica] [Consultoria] ...        |
+------------------------------------------------+
| 010701 [6%] [Informatica] [Recente]            |
| Suporte tecnico em informatica...              |
|                                                |
| 010302 [5%] [Informatica] [Frequente]          |
| Elaboracao de programas de computadores...     |
|                                                |
| 010301 [5%] [Informatica]                      |
| Processamento, armazenamento ou hospedagem...  |
+------------------------------------------------+
```

---

## Performance

- Query de estatisticas com `staleTime: 5min` para evitar requisicoes excessivas
- Ordenacao calculada via `useMemo` para evitar recalculos desnecessarios
- Query leve que busca apenas `codigo_tributacao` e `created_at`

---

## Beneficios

1. **Produtividade**: Codigos mais usados aparecem primeiro
2. **Contexto visual**: Badges indicam historico de uso
3. **Adaptativo**: Lista se adapta automaticamente ao padrao de uso
4. **Retrocompativel**: Mantem filtro por categoria e busca por texto

