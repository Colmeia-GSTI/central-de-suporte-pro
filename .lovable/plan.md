

# Diagnóstico: Push Notifications não vinculam dispositivos

## Descobertas da Investigação E2E

### 1. Tabela `push_subscriptions` — vazia para o usuário atual
O usuário logado (`3d877c38-...`) **não possui nenhuma assinatura push** na tabela. Existem apenas 2 registros de outros usuários (de março).

### 2. CAUSA RAIZ: `checkSubscription` trava indefinidamente
No hook `usePushNotifications.ts`, o `checkSubscription` (chamado no `useEffect` inicial) faz:
```
const registration = await navigator.serviceWorker.ready;
```
Se nenhum Service Worker está registrado (e não há PWA configurada com `vite-plugin-pwa`), essa promise **nunca resolve**. Resultado:
- `isLoading` fica `true` para sempre
- O botão "Ativar Notificações Push" fica desabilitado ou oculto
- O usuário nunca consegue se inscrever

### 3. Service Worker só é registrado no `subscribe()`
O `navigator.serviceWorker.register("/sw-push.js")` só é chamado dentro da função `subscribe()`. Mas `checkSubscription` (que roda antes) depende de `navigator.serviceWorker.ready` — criando um deadlock lógico.

### 4. Sem logs na Edge Function
A função `send-push-notification` não tem logs recentes — confirmando que o fluxo de envio nunca está sendo acionado.

### 5. RLS policies estão corretas
As policies permitem INSERT/SELECT/UPDATE/DELETE com `auth.uid() = user_id`. A edge function usa service role key (bypass RLS). ✅ OK.

### 6. Manifest com escopo incorreto
O `manifest.json` tem `scope: "https://suporte.colmeiagsti.com/"` mas o app roda em domínios diferentes (lovable.app/lovableproject.com). Isso pode causar problemas de escopo do SW.

---

## Plano de Correção

### Arquivo 1: `src/hooks/usePushNotifications.ts`

**Problema**: `checkSubscription` chama `navigator.serviceWorker.ready` sem SW registrado → hang infinito.

**Correção**:
1. Substituir `navigator.serviceWorker.ready` por `navigator.serviceWorker.getRegistrations()` para verificar se já existe um SW registrado sem bloquear
2. Se não há SW registrado, definir `isSubscribed: false` imediatamente (sem hang)
3. Se há SW registrado, usar `registration.pushManager.getSubscription()` para verificar
4. Adicionar um timeout de 5 segundos como fallback de segurança

```typescript
// Antes (trava):
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.getSubscription();

// Depois (seguro):
const registrations = await navigator.serviceWorker.getRegistrations();
const pushReg = registrations.find(r => r.active?.scriptURL.includes("sw-push"));
if (!pushReg) {
  // Nenhum SW push registrado — não há subscription
  setState(prev => ({ ...prev, isSupported: true, isSubscribed: false, isLoading: false }));
  return;
}
const subscription = await pushReg.pushManager.getSubscription();
```

### Arquivo 2: `public/manifest.json`

**Problema**: `scope` e `start_url` hardcoded para `suporte.colmeiagsti.com`.

**Correção**: Usar caminhos relativos (`/`) para funcionar em qualquer domínio:
```json
"start_url": "/",
"scope": "/",
"id": "/"
```

### Arquivo 3: `public/sw-push.js`

**Problema menor**: O `pushsubscriptionchange` referencia `self.VAPID_PUBLIC_KEY` que nunca é definido.

**Correção**: Remover o handler `pushsubscriptionchange` (a re-sincronização já é feita pelo hook no frontend via upsert automático).

---

## Resumo do Impacto

| Item | Antes | Depois |
|---|---|---|
| `checkSubscription` | Trava se não há SW | Retorna imediato, mostra botão |
| Botão "Ativar Push" | Invisível/desabilitado | Visível e funcional |
| Manifest scope | Fixo em domínio externo | Relativo (funciona em qualquer domínio) |
| SW `pushsubscriptionchange` | Referencia variável inexistente | Removido (resync no frontend) |

## Arquivos alterados
- `src/hooks/usePushNotifications.ts`
- `public/manifest.json`
- `public/sw-push.js`

