
# Correção: Serviços do contrato não aparecem na edição

## Problema Encontrado

Ao editar um contrato existente (ex: Viapiana), a seção "Serviços do Contrato" aparece vazia, mesmo que o contrato tenha serviços cadastrados no banco de dados.

## Causa Raiz

O componente `ContractServicesSection` inicializa seu estado interno com `useState(initialServices)`. O `useState` só usa o valor inicial **na primeira renderização**. Como os serviços são carregados de forma assíncrona (via `useQuery`), quando a resposta chega, o componente já foi montado com um array vazio, e o `useState` **não atualiza** o estado com os novos dados.

Existe um `useEffect` no componente (linhas 85-89), mas ele só atualiza `originalServices` (usado para comparação), e **não** atualiza o `services` que é exibido na tela.

```text
Fluxo atual:
1. ContractServicesSection monta com initialServices = [] (query ainda loading)
2. useState([]) -> services = []
3. Query retorna dados -> initialServices agora tem valores
4. useEffect atualiza originalServices, mas NÃO atualiza services
5. Tela continua vazia
```

## Correção

Adicionar um `useEffect` no `ContractServicesSection` que sincronize o estado `services` quando `initialServices` muda de vazio para preenchido.

### Arquivo: `src/components/contracts/ContractServicesSection.tsx`

**Adicionar** (após o useEffect existente nas linhas 85-89):

```typescript
// Sincronizar services quando initialServices carregar assincronamente
useEffect(() => {
  if (initialServices.length > 0 && services.length === 0) {
    setServices(initialServices);
  }
}, [initialServices]);
```

Isso garante que quando a query retornar os serviços do contrato, o estado visual será atualizado corretamente.

## Impacto

| Cenario | Antes | Depois |
|---|---|---|
| Editar contrato com serviços | Seção vazia | Serviços aparecem preenchidos |
| Criar contrato novo | Funciona (vazio) | Funciona (sem mudança) |
| Adicionar serviço manualmente | Funciona | Funciona (sem mudança) |

## Arquivo Modificado

| Arquivo | Alteração |
|---|---|
| `src/components/contracts/ContractServicesSection.tsx` | Adicionar useEffect para sincronizar services com initialServices assíncronos |
