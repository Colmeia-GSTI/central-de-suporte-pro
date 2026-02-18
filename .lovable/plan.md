

# Corrigir: Permitir Tecnico Cadastrar Clientes com CNPJ

## Problema

O campo CNPJ esta oculto para tecnicos porque o formulario usa `{!isTechnicianOnly && (...)}` para esconder campos sensiveis. Isso faz sentido para **visualizacao** na listagem, mas impede o tecnico de preencher o CNPJ ao **cadastrar** um novo cliente.

## Solucao

Mostrar o campo CNPJ (e Inscricao Estadual) para tecnicos **quando estiverem criando um novo cliente**. Quando estiverem **editando**, manter o campo oculto para proteger dados sensiveis.

A logica muda de:
- `{!isTechnicianOnly && (campo CNPJ)}` (sempre oculto para tecnico)

Para:
- `{(!isTechnicianOnly || !client) && (campo CNPJ)}` (visivel para tecnico apenas na criacao)

## Detalhes Tecnicos

### Arquivo: `src/components/clients/ClientForm.tsx`

**Linha 400** -- Campo CNPJ:
```tsx
// Antes:
{!isTechnicianOnly && (

// Depois:
{(!isTechnicianOnly || !client) && (
```

**Linha 439** -- Campo Inscricao Estadual:
```tsx
// Antes:
{!isTechnicianOnly && (

// Depois:
{(!isTechnicianOnly || !client) && (
```

Isso garante:
- Tecnico **criando** cliente: ve CNPJ e Inscricao Estadual (pode preencher)
- Tecnico **editando** cliente: NAO ve CNPJ (protege dado sensivel)
- Admin/Financial/Manager: ve sempre (sem alteracao)

### Banco de Dados

Nenhuma alteracao necessaria. A RLS ja permite INSERT para staff (`is_staff(auth.uid())`), que inclui tecnicos.

