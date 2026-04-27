# Plano — E2E manual PR #4 (branch_id em CMDB de rede)

## Alvo
Cliente **VIZU EDITORA** (`c9bab9b7-4d68-438e-aaea-459ae4fa7e85`) — tem 2 filiais:
- `94c6fa79-...` **Sede** (is_main=true)
- `4b345121-...` Teste Filial

## Componentes envolvidos
- `DocTableInternetLinks.tsx` (Sheet de criar/editar Link de Internet)
- `DocSectionInfrastructure.tsx` (Editor inline da seção Infraestrutura, campo "Geral")

## Execução (browser tools no preview)

### Cenário 1 — Internet Links (criação com Sede pré-selecionada)
1. `navigate_to_sandbox` → `/clients/c9bab9b7-4d68-438e-aaea-459ae4fa7e85`
2. Clicar aba **Documentação** → expandir **Links de Internet**
3. Clicar **Novo / +**
4. **Validar**: dropdown "Filial" visível, habilitado, com `Sede (Sede)` pré-selecionado
5. Preencher: Provedor `Vivo Fibra E2E`, Tipo `Principal`
6. Salvar → toast verde
7. **SQL**: `select id, provider, branch_id from doc_internet_links where provider='Vivo Fibra E2E'` → confirmar `branch_id = 94c6fa79-...`

### Cenário 2 — Infraestrutura (criação)
1. Mesma página → seção **Infraestrutura**
2. Clicar **Editar** (lápis)
3. **Validar**: campo "Filial" no topo de "Geral" com `Sede` pré-selecionada
4. Preencher Tipo de Servidor `Físico`
5. Salvar → toast verde
6. **SQL**: `select id, server_type, branch_id from doc_infrastructure where client_id='c9bab9b7-...'` → confirmar `branch_id = 94c6fa79-...`

### Cenário 3 — Infraestrutura (edição preserva valor)
1. Clicar **Editar** novamente
2. **Validar**: dropdown carrega `Sede` (valor persistido); useEffect NÃO sobrescreve nada (guarda `!data?.id` impede)
3. Fechar sem alterar

### Cenário 4 — Regressão NULL
1. Clicar **Editar** → trocar dropdown para `— Sem filial —`
2. Salvar
3. **SQL**: confirmar `branch_id IS NULL`
4. Reabrir **Editar**
5. **Validar crítico**: dropdown mostra `— Sem filial —`, NÃO força Sede de novo (este é o bug que a guarda corrige)

## Dados de teste a limpar no fim
```sql
delete from doc_internet_links where provider='Vivo Fibra E2E';
-- doc_infrastructure: deixar como está ou resetar branch_id conforme preferência
```

## Critérios de sucesso
| # | Validação | Pass se |
|---|---|---|
| 1 | Dropdown Sede pré-selecionado em criação | branch_id salvo = Sede |
| 2 | Idem em Infraestrutura nova | branch_id salvo = Sede |
| 3 | Reabrir edição preserva valor | dropdown = Sede, sem mudança |
| 4 | NULL persiste após edição | reabrir mostra "Sem filial", branch_id IS NULL |

## O que NÃO fazer
- Não logar/deslogar (usar sessão atual do preview)
- Não tocar em filiais existentes
- Não criar dados em outros clientes
- Não rodar Try-to-Fix se algo falhar — reportar e aguardar instrução

## Entregável
Tabela de resultados (4 linhas) + screenshots dos pontos críticos (dropdown pré-selecionado, dropdown preservando NULL) + outputs SQL.

Aguardo OK para executar.
