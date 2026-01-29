

# Plano: Implementar Push Nativo (Navegador) com Web Push

## Resumo

Para que as notificações push funcionem mesmo com a aba fechada, é necessário configurar corretamente o protocolo **Web Push** que requer:
1. Par de chaves VAPID (pública e privada) para autenticação do servidor
2. Criptografia adequada das mensagens usando o padrão Web Push
3. Service Worker registrado para receber e exibir as notificações

## O Que Já Existe

- Hook `usePushNotifications` que gerencia subscrições
- Tabela `push_subscriptions` no banco de dados
- Service Worker `sw-push.js` para receber e exibir notificações
- Edge function `send-push-notification` (precisa de ajustes)

## O Que Falta

1. **Secret VAPID_PRIVATE_KEY não está configurado** - sem isso, o servidor não consegue autenticar as mensagens push
2. A edge function não implementa a criptografia correta do Web Push (precisa usar a biblioteca `web-push`)

---

## Etapas de Implementação

### Etapa 1: Gerar e Configurar Chaves VAPID

Você precisará gerar um novo par de chaves VAPID. O sistema já usa uma chave pública hardcoded, então vou:
- Gerar novas chaves VAPID
- Atualizar a chave pública no frontend (`usePushNotifications.ts`)
- Solicitar que você adicione a chave privada como secret

### Etapa 2: Atualizar Edge Function com Web Push

Reescrever a edge function `send-push-notification` para:
- Usar a biblioteca `web-push` do Deno que implementa corretamente o protocolo
- Assinar as mensagens com VAPID
- Criptografar o payload corretamente com as chaves p256dh e auth do subscriber

```text
+------------------+        +-------------------+        +------------------+
|  Colmeia App     |        |  Edge Function    |        |  Push Service    |
|  (Frontend)      |        |  send-push-notif  |        |  (FCM/APNS)      |
+--------+---------+        +--------+----------+        +--------+---------+
         |                           |                            |
         | 1. Subscribe to push      |                            |
         |-------------------------->|                            |
         |                           |                            |
         | 2. Save subscription      |                            |
         |   (endpoint, p256dh, auth)|                            |
         |                           |                            |
         |                           | 3. Send encrypted message  |
         |                           |   + VAPID signature        |
         |                           |--------------------------->|
         |                           |                            |
         |                           |                            | 4. Deliver
         |<--------------------------------------------------------|
         |                   5. Show notification                 |
```

### Etapa 3: Adicionar Botão de Teste

Adicionar um botão para testar as notificações push diretamente das preferências, similar ao botão "Testar Som" existente.

### Etapa 4: Integrar com Sistema de Notificações

Garantir que o sistema de notificações (tickets, alertas, SLA) chame a edge function de push quando apropriado.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/usePushNotifications.ts` | Atualizar chave VAPID pública |
| `supabase/functions/send-push-notification/index.ts` | Implementar Web Push corretamente |
| `src/components/settings/profile/NotificationPreferencesForm.tsx` | Adicionar botão de teste push |

## Secret Necessário

Será solicitado que você adicione:
- **VAPID_PRIVATE_KEY**: Chave privada para assinar mensagens Web Push

---

## Detalhes Técnicos

### Geração de Chaves VAPID

As chaves VAPID são um par de chaves EC (curva P-256):
- **Pública**: Usada no frontend para identificar o servidor ao se inscrever
- **Privada**: Usada no backend para assinar as mensagens (prova que o servidor é quem diz ser)

### Fluxo de uma Notificação Push

1. Usuário clica "Ativar Push" → navegador pede permissão
2. Navegador cria subscription com endpoint único + chaves de criptografia
3. Subscription é salva no banco (user_id, endpoint, p256dh, auth)
4. Quando evento ocorre (novo ticket, alerta), edge function:
   - Busca subscriptions dos usuários alvo
   - Para cada subscription, criptografa o payload com as chaves
   - Envia para o endpoint com assinatura VAPID
5. Push Service entrega ao navegador (mesmo offline/aba fechada)
6. Service Worker recebe e exibe a notificação

