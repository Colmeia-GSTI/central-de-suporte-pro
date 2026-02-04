

# Melhorar Tratamento de Erro SMTP para Rejeicao de Relay

## Contexto

O teste de SMTP funciona porque envia para dominios internos (`@colmeiagsti.com.br`), mas o compartilhamento de NFS-e falha porque envia para dominios externos (`@capasemu.com.br`). O servidor UHServer esta bloqueando relay para dominios externos.

## Objetivo

Melhorar o tratamento de erro para que o usuario receba uma mensagem clara sobre o problema real, e nao apenas "Erro ao enviar email".

---

## Arquivo a Modificar

### supabase/functions/send-email-smtp/index.ts

Adicionar tratamento especifico para o erro 554 de politica de relay:

**Linha 209-216 atual:**
```typescript
let userMessage = "Erro ao enviar email. Verifique as configurações SMTP.";
if (errorMsg.includes("connect")) {
  userMessage = "Não foi possível conectar ao servidor SMTP...";
} else if (errorMsg.includes("auth")...
```

**Adicionar novo caso para erro 554:**
```typescript
} else if (errorMsg.includes("554") || errorMsg.includes("policy")) {
  userMessage = "O servidor SMTP rejeitou o email. Isso pode ocorrer quando o servidor não permite envio para domínios externos. Verifique as configurações de relay do seu provedor SMTP.";
}
```

---

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/send-email-smtp/index.ts` | Adicionar tratamento de erro 554 com mensagem explicativa |

---

## Nota Importante

**Este e um problema de configuracao do servidor SMTP, nao do codigo:**

- O servidor `smtps.uhserver.com` esta configurado para nao permitir relay externo
- Para resolver definitivamente, voce precisa:
  1. Acessar o painel do UHServer
  2. Habilitar "SMTP Relay" ou "Envio para dominios externos"
  3. Ou usar um servico de email como Resend/SendGrid que nao tem essa restricao

A mudanca no codigo apenas melhora a mensagem de erro para facilitar o diagnostico.

