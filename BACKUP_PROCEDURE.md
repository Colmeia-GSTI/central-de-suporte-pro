# Procedimento de Backup e Restauração

Este documento descreve **como fazer e restaurar backups** do banco de dados do projeto colmeiahdpro.

> ⚠️ **Importante:** O backup definitivo para qualquer rollback de produção é sempre o **backup nativo do Supabase** (item 1 abaixo). O backup CSV (item 2) é um complemento rápido para consulta de dados, **não substitui** o backup nativo.

---

## 1. Backup nativo do Supabase (DEFINITIVO — recomendado)

É o único backup que cobre 100% do banco: schema, dados, RLS, funções, triggers, tipos, storage e configurações de auth.

### Como fazer download

1. Acessar o painel do Supabase do projeto
2. Menu lateral → **Database** → **Backups**
3. Selecionar o backup automático mais recente (ou criar um manual em **Create backup**)
4. Clicar no botão de **Download** ao lado do backup desejado
5. Salvar o arquivo `.sql` ou `.tar.gz` em local seguro fora do servidor

### Como restaurar

**Opção A — pelo painel (recomendada):**

1. Painel Supabase → **Database** → **Backups**
2. Clicar em **Restore** ao lado do backup desejado
3. Confirmar — o Supabase restaura o banco inteiro automaticamente

**Opção B — via psql (avançado, para clones em outro projeto):**

```bash
psql "postgres://USUARIO:SENHA@HOST:5432/postgres" < backup.sql
```

### Frequência e retenção

- Plano atual: backups automáticos **diários**, retenção conforme plano contratado.
- Recomenda-se baixar manualmente um backup **antes de qualquer refatoração grande** (esta sessão é uma delas).

---

## 2. Backup CSV complementar (rápido, somente dados)

Útil para inspecionar dados em planilha, importar para análise externa ou recuperar rapidamente o conteúdo de uma tabela específica. **Não restaura schema, funções, triggers ou RLS.**

### Como foi gerado

Via `psql \copy` em todas as tabelas do schema `public`, empacotado em `tar.gz`.

### Localização do último backup CSV

- Arquivo: `backup_2026-04-24.tar.gz` (140 KB)
- Caminho: `/mnt/documents/backups/`
- Conteúdo:
  - `csv/<tabela>.csv` — uma por tabela, com cabeçalho
  - `tables.txt` — lista das 103 tabelas
  - `MANIFEST.txt` — metadados

### Como restaurar uma tabela individual

```bash
# Pré-requisito: o schema da tabela já deve existir
tar -xzf backup_2026-04-24.tar.gz
psql -c "\copy public.NOME_DA_TABELA FROM 'csv/NOME_DA_TABELA.csv' WITH CSV HEADER"
```

### Quando usar

- Consulta histórica de dados de uma tabela
- Análise externa em Excel/duckdb
- Recuperação pontual de registros perdidos

### Quando NÃO usar

- Restauração completa de banco → use o backup nativo (item 1)
- Recriação de RLS, funções, triggers → use o backup nativo
- Disaster recovery → use o backup nativo

---

## 3. Checklist antes de cada refatoração

- [ ] Baixar backup nativo do Supabase (item 1)
- [ ] Gerar backup CSV complementar (item 2)
- [ ] Anotar data, hora e localização no `CHANGELOG.md`
- [ ] Confirmar que ambos os backups estão acessíveis fora do servidor
