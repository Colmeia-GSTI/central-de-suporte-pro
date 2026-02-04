
# Plano: Adequação do Sistema NFS-e para Padrão Nacional 2026

## Resumo Executivo

Ajustar o sistema de emissão de NFS-e para:
1. **Adicionar campos de retenção de impostos conforme padrão DPS Nacional 2026**
2. **Implementar série numérica obrigatória** (requisito a partir de 01/01/2026)
3. **Manter a emissão via Asaas** (que já faz a comunicação com o Portal Nacional)
4. **Remover opção de provedor manual** (simplificar para apenas Asaas)
5. **Adicionar campos IBS/CBS** (fase de calibragem da Reforma Tributária)
6. **Cadastrar código de serviço 1.07** (Suporte técnico em informática)

---

## Especificação Técnica - Padrão NFS-e Nacional 2026 (DPS v1.0)

### Campos Obrigatórios de Tributação

| Campo DPS | Descrição | Grupo XML |
|-----------|-----------|-----------|
| `tpRetISS` | Tipo retenção ISS (1=Retido, 2=Não Retido) | `<tribut><issqn>` |
| `vISSRet` | Valor do ISS retido | `<tribut><issqn>` |
| `vRetPIS` | Valor retenção PIS | `<tribut><fed>` |
| `vRetCOFINS` | Valor retenção COFINS | `<tribut><fed>` |
| `vRetCSLL` | Valor retenção CSLL | `<tribut><fed>` |
| `vRetIRRF` | Valor retenção IRRF | `<tribut><fed>` |
| `vRetCP` | Valor retenção INSS/CP | `<tribut><fed>` |
| `vLiq` | Valor líquido (obrigatório) | `<infDPS>` |

### Novidade 2026: IBS e CBS (Reforma Tributária)

| Campo | Descrição | Status |
|-------|-----------|--------|
| `vIBS` | Valor IBS (Imposto sobre Bens e Serviços) | Fase de calibragem (opcional) |
| `vCBS` | Valor CBS (Contribuição sobre Bens e Serviços) | Fase de calibragem (opcional) |

### Requisito Crítico: Série Numérica

A partir de **01/01/2026**, a série do RPS/DPS deve ser **estritamente numérica**. Séries alfanuméricas (ex: "A", "SN") serão rejeitadas pelo ADN.

---

## Estado Atual da Tabela `nfse_history`

**Campos existentes:**
- `valor_servico`, `valor_iss`, `aliquota` ✓
- `codigo_tributacao`, `cnae` ✓
- `serie` (default '900') ✓
- `asaas_invoice_id`, `asaas_status` ✓

**Campos faltantes (padrão 2026):**
- `iss_retido` (boolean)
- `valor_iss_retido` (numeric)
- `valor_pis`, `valor_cofins`, `valor_csll`, `valor_irrf`, `valor_inss`
- `valor_liquido` (obrigatório no DPS)
- `valor_deducoes`, `valor_desconto`

---

## Etapas de Implementação

### Etapa 1: Migração do Banco de Dados

Adicionar campos de retenção conforme padrão DPS Nacional 2026:

```sql
-- Campos de retenção ISS (padrão Nacional 2026)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS iss_retido BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS valor_iss_retido NUMERIC(15,2) DEFAULT 0;

-- Tributos federais retidos (padrão Nacional 2026)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_pis NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_cofins NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_csll NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_irrf NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0;

-- Valores calculados (obrigatórios)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS valor_deducoes NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(15,2) DEFAULT 0;

-- Reforma Tributária 2026 (IBS/CBS - fase calibragem)
ALTER TABLE public.nfse_history
ADD COLUMN IF NOT EXISTS valor_ibs NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_cbs NUMERIC(15,2) DEFAULT 0;

-- Cadastrar código de serviço 1.07
INSERT INTO nfse_service_codes (
  codigo_tributacao, descricao, item_lista, subitem_lista, 
  cnae_principal, aliquota_sugerida, categoria
)
VALUES (
  '010701',
  'Suporte técnico em informática, inclusive instalação, configuração e manutenção de programas de computação e bancos de dados.',
  '1', '07', '6209100', 2.00, 'informatica'
) ON CONFLICT (codigo_tributacao) DO NOTHING;
```

### Etapa 2: Atualizar NfseAvulsaDialog

Simplificar e adicionar campos de tributação:

**Alterações:**
- Remover seleção de provedor (sempre Asaas)
- Adicionar seção "Tributação" colapsável
- Adicionar checkbox "ISS Retido pelo Tomador"
- Adicionar campos de tributos federais (PIS, COFINS, CSLL, IRRF, INSS)
- Calcular e exibir valor líquido automaticamente

**Interface proposta:**

```text
+--------------------------------------------------+
|  Emitir NFS-e Avulsa                             |
+--------------------------------------------------+
|  [Cliente] [Código Serviço] [Competência]        |
|  [Valor do Serviço] [Descrição]                  |
|                                                  |
|  ╔════════════════════════════════════════════╗  |
|  ║ 💰 Tributação (Padrão Nacional 2026)       ║  |
|  ╠════════════════════════════════════════════╣  |
|  ║ Alíquota ISS: [2,00 %] (do código serviço)  ║  |
|  ║                                            ║  |
|  ║ [✓] ISS Retido pelo Tomador                ║  |
|  ║     Valor ISS: R$ 29,11 (calculado)         ║  |
|  ║                                            ║  |
|  ║ ▼ Tributos Federais Retidos (opcional)     ║  |
|  ║   PIS: [R$ 0,00]    COFINS: [R$ 0,00]     ║  |
|  ║   CSLL: [R$ 0,00]   IRRF: [R$ 0,00]       ║  |
|  ║   INSS/CP: [R$ 0,00]                       ║  |
|  ║                                            ║  |
|  ║ ─────────────────────────────────          ║  |
|  ║ Total Retenções:   R$ 29,11                ║  |
|  ║ VALOR LÍQUIDO:     R$ 1.426,23             ║  |
|  ╚════════════════════════════════════════════╝  |
+--------------------------------------------------+
```

### Etapa 3: Atualizar EmitNfseDialog

Adicionar campos de retenção no fluxo de emissão via fatura:

**Alterações:**
- Adicionar seção de tributação no step "form"
- Checkbox "ISS Retido pelo Tomador"
- Campos opcionais para tributos federais
- Exibir resumo no step "preview"

### Etapa 4: Atualizar Edge Function `asaas-nfse`

Modificar as ações `emit` e `emit_standalone` para:

1. Aceitar novos parâmetros de retenção
2. Enviar tributos para API Asaas
3. Salvar valores no histórico

**Parâmetros adicionais:**

```typescript
const {
  // ... existentes
  retain_iss,           // boolean - ISS retido pelo tomador
  iss_rate,             // alíquota ISS %
  pis_value,            // valor PIS retido
  cofins_value,         // valor COFINS retido
  csll_value,           // valor CSLL retido
  irrf_value,           // valor IRRF retido
  inss_value,           // valor INSS/CP retido
  deductions,           // deduções
  discount,             // descontos
} = params;
```

**Payload para API Asaas:**

```typescript
invoicePayload.taxes = {
  retainIss: retain_iss || false,
  iss: iss_rate || 0,
  pis: pis_value || 0,
  cofins: cofins_value || 0,
  csll: csll_value || 0,
  irrf: irrf_value || 0,
  inss: inss_value || 0,
};

if (deductions) invoicePayload.deductions = deductions;
if (discount) invoicePayload.discount = discount;
```

### Etapa 5: Atualizar NfseDetailsSheet

Exibir resumo de retenções no painel de detalhes:

```text
+--------------------------------------------------+
|  NFS-e #2025606 - CAPASEMU                       |
+--------------------------------------------------+
|  ┌──────────────────────────────────────────┐    |
|  │ Valor do Serviço:       R$ 1.455,34      │    |
|  │ (-) Deduções:           R$ 0,00          │    |
|  │ (=) Base de Cálculo:    R$ 1.455,34      │    |
|  ├──────────────────────────────────────────┤    |
|  │ ISS Retido (2%):        R$ 29,11    ✓    │    |
|  │ PIS:                    R$ 0,00          │    |
|  │ COFINS:                 R$ 0,00          │    |
|  │ CSLL:                   R$ 0,00          │    |
|  │ IRRF:                   R$ 0,00          │    |
|  │ INSS/CP:                R$ 0,00          │    |
|  ├──────────────────────────────────────────┤    |
|  │ TOTAL RETENÇÕES:        R$ 29,11         │    |
|  │ VALOR LÍQUIDO:          R$ 1.426,23      │    |
|  └──────────────────────────────────────────┘    |
+--------------------------------------------------+
```

---

## Arquivos a Serem Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | CRIAR | Campos de retenção padrão 2026 |
| `supabase/functions/asaas-nfse/index.ts` | MODIFICAR | Aceitar e enviar tributos |
| `src/components/billing/nfse/NfseAvulsaDialog.tsx` | MODIFICAR | Seção tributação + remover seleção provedor |
| `src/components/financial/EmitNfseDialog.tsx` | MODIFICAR | Campos ISS retido e tributos federais |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | MODIFICAR | Exibir resumo de retenções |
| `src/components/billing/nfse/nfseValidation.ts` | MODIFICAR | Validar campos de retenção |

---

## Seção Técnica

### Estrutura de Dados (Padrão Nacional 2026)

```typescript
interface NfseEmitParams {
  // Identificação
  client_id: string;
  invoice_id?: string;
  contract_id?: string;
  
  // Serviço
  value: number;
  service_description: string;
  service_code?: string;           // código tributação (ex: 010701)
  cnae?: string;                   // CNAE (ex: 6209100)
  competencia: string;             // yyyy-MM
  
  // Tributação ISS
  iss_rate: number;                // alíquota ISS % (ex: 2.00)
  retain_iss: boolean;             // ISS retido pelo tomador (tpRetISS)
  
  // Tributos Federais (opcionais)
  pis_value?: number;              // vRetPIS
  cofins_value?: number;           // vRetCOFINS
  csll_value?: number;             // vRetCSLL
  irrf_value?: number;             // vRetIRRF
  inss_value?: number;             // vRetCP (Contribuição Previdenciária)
  
  // Deduções (opcionais)
  deductions?: number;
  discount?: number;
}
```

### Função de Cálculo de Valor Líquido

```typescript
function calculateNetValue(params: {
  valorServico: number;
  issRetido: boolean;
  aliquotaIss: number;
  valorPis: number;
  valorCofins: number;
  valorCsll: number;
  valorIrrf: number;
  valorInss: number;
  deducoes: number;
  desconto: number;
}): { valorLiquido: number; totalRetencoes: number; valorIssRetido: number } {
  const valorIssRetido = params.issRetido 
    ? params.valorServico * (params.aliquotaIss / 100) 
    : 0;
  
  const totalRetencoes = valorIssRetido 
    + params.valorPis 
    + params.valorCofins 
    + params.valorCsll 
    + params.valorIrrf 
    + params.valorInss;
  
  const valorLiquido = params.valorServico 
    - params.deducoes 
    - params.desconto 
    - totalRetencoes;
  
  return {
    valorLiquido: Math.max(0, valorLiquido),
    totalRetencoes,
    valorIssRetido,
  };
}
```

### Mapeamento Asaas → Portal Nacional DPS

O Asaas transmite os dados automaticamente ao Portal Nacional, mapeando para o layout DPS 2026:

| Campo Frontend | Asaas API | DPS Nacional |
|----------------|-----------|--------------|
| `retain_iss: true` | `taxes.retainIss: true` | `tpRetISS = 1` |
| `iss_rate: 2.00` | `taxes.iss: 2.00` | `aliqISS = 2.00` |
| `pis_value` | `taxes.pis` | `vRetPIS` |
| `cofins_value` | `taxes.cofins` | `vRetCOFINS` |
| `csll_value` | `taxes.csll` | `vRetCSLL` |
| `irrf_value` | `taxes.irrf` | `vRetIRRF` |
| `inss_value` | `taxes.inss` | `vRetCP` |

---

## Fluxo de Emissão (Resumo)

```text
┌─────────────────┐      ┌───────────────┐      ┌─────────────────┐
│  Interface UI   │ ──▶  │  Edge Function │ ──▶  │   API Asaas     │
│  (Dialog)       │      │  asaas-nfse   │      │                 │
└─────────────────┘      └───────────────┘      └─────────────────┘
        │                       │                       │
        │ Campos:               │ Payload:              │ Transmite:
        │ - ISS Retido ☑        │ taxes: {              │ → Portal Nacional
        │ - Alíquota: 2%        │   retainIss: true,    │ → DPS XML v1.0
        │ - PIS: 0              │   iss: 2.00,          │ → ADN (Ambiente
        │ - COFINS: 0           │   pis: 0, ...         │    de Dados Nacional)
        │ - etc.                │ }                     │
        ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  nfse_history (banco de dados)                                  │
│  - iss_retido: true                                             │
│  - valor_iss_retido: 29.11                                      │
│  - valor_pis: 0, valor_cofins: 0, ...                           │
│  - valor_liquido: 1426.23 (obrigatório)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

1. **Campos de retenção** disponíveis na emissão de NFS-e
2. **ISS Retido** configurável (para clientes que fazem retenção na fonte)
3. **Tributos federais** opcionais (PIS, COFINS, CSLL, IRRF, INSS)
4. **Valor líquido** calculado automaticamente (obrigatório no DPS)
5. **Série numérica** mantida (padrão '900' - compliance 2026)
6. **Código 1.07** disponível para seleção
7. **Interface simplificada** sem seleção de provedor (apenas Asaas)
8. **Conformidade** com o padrão NFS-e Nacional DPS 2026
9. **Preparação IBS/CBS** (campos disponíveis para fase de calibragem)
