
# Corrigir Icone de Compartilhamento de NFS-e

## Diagnostico

O botao de compartilhamento nao esta funcionando devido a dois problemas identificados nos logs:

### Problema 1: Erro na funcao send-email-smtp

A biblioteca `denomailer` esta gerando erro `BadResource: Bad resource ID` porque:
- A conexao SMTP e fechada duas vezes (linha 178 e linha 195)
- O bloco `finally` tenta fechar uma conexao ja fechada

**Log de erro:**
```
ERROR event loop error: BadResource: Bad resource ID at TlsConn.close
ERROR Error while in datamode - connection not recoverable
```

### Problema 2: Configuracao de JWT

As funcoes `send-nfse-notification` e `send-email-smtp` nao estao configuradas com `verify_jwt = false` no `config.toml`, o que pode causar problemas quando uma edge function invoca outra.

---

## Arquivos a Modificar

### 1. supabase/functions/send-email-smtp/index.ts

Corrigir o gerenciamento de conexao do cliente SMTP para evitar duplo fechamento:

**Problema atual (linhas 169-199):**
```typescript
try {
  await client.send({ ... });
  await client.close();  // Fecha aqui
  return new Response(...);
} catch (sendError) {
  throw sendError;
} finally {
  try {
    await client.close();  // Tenta fechar NOVAMENTE
  } catch { }
}
```

**Solucao:**
- Usar variavel de controle para evitar fechamento duplo
- OU remover o close do try e deixar apenas no finally

```typescript
let closed = false;
try {
  await client.send({ ... });
  await client.close();
  closed = true;
  return new Response(...);
} catch (sendError) {
  throw sendError;
} finally {
  if (!closed) {
    try {
      await client.close();
    } catch { }
  }
}
```

### 2. supabase/config.toml

Adicionar configuracao de `verify_jwt = false` para as funcoes que sao invocadas por outras edge functions:

```toml
[functions.send-nfse-notification]
verify_jwt = false

[functions.send-email-smtp]
verify_jwt = false

[functions.send-whatsapp]
verify_jwt = false
```

Isso e necessario porque quando uma edge function invoca outra usando `supabase.functions.invoke`, o token JWT pode nao ser passado corretamente na cadeia de chamadas.

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/send-email-smtp/index.ts` | Corrigir fechamento duplo da conexao SMTP |
| `supabase/config.toml` | Adicionar `verify_jwt = false` para as 3 funcoes |

---

## Fluxo Corrigido

```text
USUARIO CLICA COMPARTILHAR
        |
        v
  NfseShareMenu.tsx
        |
        v
  supabase.functions.invoke("send-nfse-notification")
        |
        v
  send-nfse-notification (verify_jwt=false)
        |
   +----+----+
   |         |
EMAIL     WHATSAPP
   |         |
   v         v
send-email-smtp   send-whatsapp
(verify_jwt=false) (verify_jwt=false)
   |              |
   v              v
  SMTP         Evolution API
   |              |
   v              v
     Email/WhatsApp enviado
```

---

## Apos a Correcao

Testarei a funcao diretamente para confirmar que esta funcionando antes de finalizar.
