

# Adicionar Campo "Apelido" nos Clientes

## Objetivo
Permitir cadastrar um apelido/tag em cada cliente para facilitar a identificacao rapida pelos tecnicos, especialmente ao vincular usuarios. O apelido aparecera na listagem de clientes e no detalhe.

## Alteracoes

### 1. Banco de Dados
- Adicionar coluna `nickname` (text, nullable) na tabela `clients`
- Tambem adicionar na VIEW `clients_contact_only` para que tecnicos vejam o apelido

### 2. Formulario do Cliente (`ClientForm.tsx`)
- Adicionar campo "Apelido" no schema Zod e no formulario, logo apos "Nome Fantasia"
- Campo opcional, placeholder "Ex: Padaria do Ze, Escritorio Centro"

### 3. Listagem de Clientes (`ClientsPage.tsx`)
- Exibir o apelido como uma Badge colorida (estilo tag) ao lado do nome do cliente na tabela
- Incluir o campo `nickname` na query de busca (search tambem filtra por apelido)

### 4. Detalhe do Cliente (`ClientDetailPage.tsx`)
- Exibir o apelido no cabecalho, abaixo do nome fantasia, como uma Badge destacada
- Incluir `nickname` no select da query

### 5. Mutation do ClientForm
- Incluir `nickname` no payload de insert/update
- Incluir no defaultValues e no rastreamento de mudancas (historico)

---

## Detalhes Tecnicos

**Migracao SQL:**
```sql
ALTER TABLE clients ADD COLUMN nickname text;

CREATE OR REPLACE VIEW clients_contact_only AS
SELECT id, name, trade_name, nickname, email, phone, whatsapp,
       whatsapp_validated, is_active, created_at, updated_at,
       address, city, state, zip_code, notes
FROM clients;
```

**Formulario -- novo campo apos trade_name:**
```tsx
<FormField name="nickname" ...>
  <FormLabel>Apelido</FormLabel>
  <Input placeholder="Ex: Padaria do Ze" />
  <FormDescription>Identificacao rapida para os tecnicos</FormDescription>
</FormField>
```

**Listagem -- badge ao lado do nome:**
```tsx
<p className="font-medium">
  {client.name}
  {client.nickname && (
    <Badge variant="outline" className="ml-2 text-xs">
      {client.nickname}
    </Badge>
  )}
</p>
```

**Arquivos afetados:**
1. Migracao SQL (nova coluna + view)
2. `src/components/clients/ClientForm.tsx` -- campo no formulario + schema + payload
3. `src/pages/clients/ClientsPage.tsx` -- exibir badge + incluir na busca
4. `src/pages/clients/ClientDetailPage.tsx` -- exibir no cabecalho

