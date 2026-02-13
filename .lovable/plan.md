
# Simplificar Seleção de Data de Vencimento: Remover Opção por Dias

## Objetivo
Simplificar a interface de seleção de vencimento da fatura, removendo completamente as opções pré-definidas "7/15/30/45/60 dias" e mantendo apenas um calendário para seleção manual de data.

## Alterações em `src/components/billing/nfse/NfseAvulsaDialog.tsx`

### 1. Remover Estado `vencimentoDias`
- Deletar a linha 69: `const [vencimentoDias, setVencimentoDias] = useState<number>(30);`
- Adicionar novo estado `dataVencimentoManual` para armazenar a data selecionada via calendário

### 2. Simplificar a Lógica de Cálculo de Vencimento
- Na função `reset()` (linha 155-164): remover a linha que reseta `vencimentoDias`
- Na função `emitMutation` (linha 195): substituir a lógica de cálculo de vencimento:
  - De: `const due = addDays(new Date(), vencimentoDias);`
  - Para: usar diretamente `dataVencimentoManual` se selecionada, ou usar `new Date()` como fallback

### 3. Refatorar a Seção "Gerar Fatura"
- Substituir o bloco de linhas 410-429 por:
  - Manter a label "Gerar fatura junto" com o `Switch`
  - Quando `gerarFatura` é true, exibir um `Popover` + `Calendar` para seleção de data
  - Exibir a data selecionada em formato legível abaixo do calendário
  - Usar `CalendarIcon` como no seletor de "Competência" (linhas 303-327)

### 4. Estrutura da Nova Seção "Gerar Fatura"

```
┌─ Gerar fatura junto [Toggle] ─────────────────┐
│                                                │
│ Quando ativado:                               │
│ Data de vencimento:                           │
│ [ Calendário para seleção da data ]           │
│ Data selecionada: DD/MM/YYYY                  │
│                                                │
└────────────────────────────────────────────────┘
```

### 5. Validação
- Garantir que quando `gerarFatura` é true, `dataVencimentoManual` é obrigatoriamente selecionada
- Na função `canEmit`, adicionar validação: `(gerarFatura && dataVencimentoManual) || !gerarFatura`

## Componentes Utilizados
- `Popover` + `Calendar` (já importados e existentes no arquivo)
- `Switch` (já existente)
- `format` de `date-fns` para exibir a data selecionada

## Benefícios
- Interface mais simples e clara
- Flexibilidade total para selecionar qualquer data de vencimento
- Remove limites pré-definidos que não se adequam a todos os cenários
