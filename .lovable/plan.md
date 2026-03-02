
# Edição Completa de NFS-e com Erro

## Problema Identificado

Os dois diálogos de edição de NFS-e (em `NfseDetailsSheet` e `NfseActionsMenu`) permitem editar apenas **3 campos**: valor, competência e descrição. Os campos fiscais que frequentemente causam erros -- **código de tributação**, **CNAE**, **alíquota ISS**, **ISS retido** e **retenções federais** -- são exibidos como somente leitura. Quando uma nota é rejeitada por erro fiscal, o usuário não consegue corrigir a causa raiz visualmente.

Além disso, a mutation de "Reenviar" no `NfseDetailsSheet` envia os valores de tributação do **registro antigo** (`nfse.aliquota`, `nfse.iss_retido`, etc.) em vez dos valores editados, tornando a edição ineficaz mesmo que fosse possível.

## Causa Raiz

1. **Formulários de edição incompletos**: Apenas `valor_servico`, `descricao_servico` e `competencia` são editáveis
2. **Mutation de update incompleta**: Salva apenas 3 campos no banco
3. **Mutation de resend desconectada**: Envia dados antigos do `nfse` em vez dos valores editados pelo usuário

## Solução

### 1. Expandir o diálogo de edição no `NfseDetailsSheet` (principal)

Transformar o diálogo simples em um formulário completo com:
- Valor do Serviço (ja existe)
- Competencia (ja existe)
- Descricao (ja existe)
- **Codigo de Servico** (usando `NfseServiceCodeCombobox` existente)
- **CNAE** (preenchido automaticamente ao selecionar codigo)
- **Aliquota ISS** (editavel)
- **ISS Retido** (switch)
- **Retencoes Federais** (usando `NfseTributacaoSection` existente)

Exibir o erro atual da nota no topo do formulario para o usuario saber o que corrigir.

### 2. Expandir o diálogo de edição no `NfseActionsMenu`

Aplicar as mesmas melhorias ao segundo diálogo de edição, replicando os campos fiscais editáveis.

### 3. Corrigir a mutation de update

Atualizar `updateMutation` em ambos os componentes para salvar **todos** os campos fiscais editados:
- `codigo_tributacao`
- `cnae`
- `aliquota`
- `iss_retido`
- `valor_pis`, `valor_cofins`, `valor_csll`, `valor_irrf`, `valor_inss`

### 4. Corrigir a mutation de resend

Atualizar `resendMutation` no `NfseDetailsSheet` para usar os **valores editados** (do estado local) em vez dos valores antigos do `nfse`:
- `iss_rate` deve usar a alíquota editada
- `retain_iss` deve usar o valor editado
- Retenções federais devem usar valores editados

## Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Adicionar estados para campos fiscais, expandir dialogo de edição com `NfseServiceCodeCombobox` e `NfseTributacaoSection`, corrigir mutations de update e resend |
| `src/components/nfse/NfseActionsMenu.tsx` | Adicionar campos fiscais ao dialogo de edição, corrigir mutation de update e resend |

## Fluxo Corrigido

```text
Usuario abre NFS-e com erro:
  1. Ve a mensagem de erro no topo
  2. Clica "Editar"
  3. Formulario completo abre com:
     - Erro atual destacado
     - Todos os campos editaveis (valor, competencia, descricao)
     - Campos fiscais editaveis (codigo servico, CNAE, aliquota, ISS retido, retencoes)
  4. Ao salvar, TODOS os campos sao persistidos no banco
  5. Ao clicar "Validar e Reenviar", os valores EDITADOS sao enviados ao Asaas
```
