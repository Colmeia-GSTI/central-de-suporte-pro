

# Registro Automático de Webhook do Banco Inter via API

## Descoberta

O portal do desenvolvedor do Banco Inter (developers.inter.co) é apenas documentação -- **não tem painel para registrar webhooks manualmente**. O registro é feito **programaticamente via API**:

- **PUT** `/cobranca/v3/cobrancas/webhook` -- Criar/editar webhook
- **GET** `/cobranca/v3/cobrancas/webhook` -- Consultar webhook cadastrado
- **DELETE** `/cobranca/v3/cobrancas/webhook` -- Excluir webhook
- Escopo requerido: `boleto-cobranca.write`
- O body e simplesmente: `{ "webhookUrl": "https://..." }`
- Retentativas automaticas do Inter: 4 tentativas em 20, 30, 60 e 120 minutos

## Payload de Callback

Quando o Inter envia callbacks, o formato e:
```text
[{
  "codigoSolicitacao": "string",
  "seuNumero": "string",
  "situacao": "RECEBIDO",
  "dataHoraSituacao": "2019-08-24T14:15:22Z",
  "valorTotalRecebido": "string",
  "origemRecebimento": "BOLETO",
  "nossoNumero": "string",
  "codigoBarras": "...",
  "linhaDigitavel": "...",
  "txid": "string",
  "pixCopiaECola": "string"
}]
```

**Observacao importante:** O callback vem como **array**, nao objeto simples. O `webhook-banco-inter` atual espera um objeto -- precisa ser ajustado.

---

## Plano de Implementacao

### 1. Adicionar action `register_webhook` na edge function `banco-inter/index.ts`

Nova action que:
- Autentica com escopo `boleto-cobranca.write`
- Chama `PUT /cobranca/v3/cobrancas/webhook` com a URL do nosso endpoint
- Body: `{ "webhookUrl": "https://silefpsayliwqtoskkdz.supabase.co/functions/v1/webhook-banco-inter" }`
- Retorna sucesso (204) ou erro

### 2. Adicionar action `check_webhook` na edge function `banco-inter/index.ts`

Nova action que:
- Autentica com escopo `boleto-cobranca.read`
- Chama `GET /cobranca/v3/cobrancas/webhook` para verificar se ja esta cadastrado
- Retorna a URL cadastrada ou "nenhum webhook cadastrado"

### 3. Ajustar `webhook-banco-inter/index.ts` para aceitar payload como array

O callback do Inter envia um **array de objetos**, nao um objeto simples. Ajustar o handler para:
- Verificar se o payload e array ou objeto
- Se array, iterar sobre cada item
- Processar cada item individualmente (boleto ou PIX)

### 4. Adicionar botao "Registrar Webhook" no `BancoInterConfigForm.tsx`

Na tela de configuracao do Banco Inter:
- Botao "Verificar Webhook" -- chama action `check_webhook` e mostra status
- Botao "Registrar Webhook" -- chama action `register_webhook`
- Indicador visual: verde se webhook cadastrado, vermelho se nao
- Executar automaticamente ao testar conexao (action `test`)

### 5. Registro automatico no fluxo de teste

Quando o usuario clica "Testar Conexao" (action `test`):
- Apos validar escopos, verificar se webhook esta cadastrado
- Se nao estiver, registrar automaticamente
- Informar no resultado: "Webhook registrado com sucesso" ou "Webhook ja cadastrado"

---

## Detalhes Tecnicos

### `supabase/functions/banco-inter/index.ts` -- Novas actions

```text
// Action: register_webhook
if (action === "register_webhook") {
  const token = await tryGetTokenWithFallback("boleto-cobranca.write", "boleto-cobranca.read boleto-cobranca.write");
  
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-banco-inter`;
  
  const response = await mtlsFetch(`${baseUrl}/cobranca/v3/cobrancas/webhook`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ webhookUrl }),
  });
  
  // 204 = sucesso
  return Response 200: { success: true, webhookUrl }
}

// Action: check_webhook
if (action === "check_webhook") {
  const token = await tryGetTokenWithFallback("boleto-cobranca.read", "boleto-cobranca.read boleto-cobranca.write");
  
  const response = await mtlsFetch(`${baseUrl}/cobranca/v3/cobrancas/webhook`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  
  if (response.status === 404) return { registered: false }
  const data = await response.json();
  return { registered: true, webhookUrl: data.webhookUrl, criacao: data.criacao }
}
```

### `supabase/functions/webhook-banco-inter/index.ts` -- Suporte a array

```text
// ANTES:
const payload: InterWebhookPayload = JSON.parse(rawPayload);

// DEPOIS:
const parsed = JSON.parse(rawPayload);
const payloads: InterWebhookPayload[] = Array.isArray(parsed) ? parsed : [parsed];

for (const payload of payloads) {
  // processar cada item...
}
```

### `src/components/settings/integrations/BancoInterConfigForm.tsx`

Adicionar secao "Webhook" com:
- Badge de status (Cadastrado/Nao cadastrado)
- Botao "Verificar" que chama `check_webhook`
- Botao "Registrar" que chama `register_webhook`
- URL do webhook exibida (readonly)

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/banco-inter/index.ts` | Adicionar actions `register_webhook` e `check_webhook` |
| `supabase/functions/webhook-banco-inter/index.ts` | Ajustar para aceitar payload como array |
| `src/components/settings/integrations/BancoInterConfigForm.tsx` | Adicionar secao de gerenciamento de webhook |

## Ordem de Implementacao

1. Ajustar `webhook-banco-inter` para aceitar array (correcao critica)
2. Adicionar actions `register_webhook` e `check_webhook` no `banco-inter`
3. Adicionar UI de gerenciamento no `BancoInterConfigForm`
4. Deploy e teste

