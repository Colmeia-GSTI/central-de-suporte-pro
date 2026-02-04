# Correção de Bugs no Formulário de Contrato + Geração de Cobrança Inicial

## ✅ Status: IMPLEMENTADO

**Data de implementação:** 2026-02-04

---

## Problemas Identificados e Resolvidos

### 1. ✅ Serviços de Novos Contratos Não Eram Salvos (Bug Crítico)
**Problema:** O código usava `contractId` (undefined para novos contratos) em vez de `contractIdValue` (ID do contrato recém-criado).

**Solução:** Modificado para usar `contractIdValue` corretamente e só deletar serviços existentes em modo de edição.

### 2. ✅ Cache de Serviços Não Era Invalidado
**Problema:** Ao criar um serviço em `/billing?tab=services`, ele não aparecia no dropdown do formulário de contrato.

**Solução:** Adicionado `queryClient.invalidateQueries({ queryKey: ["services-active"] })` no `ServiceForm`.

### 3. ✅ Nova Opção de Gerar Cobrança Inicial
**Funcionalidade:** Ao criar um contrato, agora é possível:
- Marcar checkbox "Gerar primeira cobrança ao criar contrato"
- Optar por gerar boleto/PIX automaticamente via Banco Inter ou Asaas
- Enviar notificação por email

---

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/contracts/ContractForm.tsx` | Bug fix + nova feature de cobrança inicial |
| `src/components/services/ServiceForm.tsx` | Invalidação de cache `services-active` |

---

## Interface Implementada

Na seção de Faturamento do formulário de contrato (apenas para novos contratos):

```
┌─────────────────────────────────────────────────────────────┐
│  ☑ Gerar primeira cobrança ao criar contrato               │
│                                                             │
│     Competência: 2026-02                                   │
│     Vencimento: 2026-02-10                                 │
│     Valor: R$ 650,00                                       │
│                                                             │
│     ☑ Gerar boleto/PIX automaticamente (Banco Inter)      │
│     ☑ Enviar notificação por email                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Fluxo Implementado

```
Criar Contrato → Salvar Serviços → Gerar Fatura (se marcado)
                                         ↓
                               Gerar Cobrança via Provider
                                         ↓
                               Enviar Email (se habilitado)
```
