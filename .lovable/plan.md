
# Migrar Sistema de Email de SMTP para Resend

## Objetivo

Substituir completamente a infraestrutura de email SMTP por Resend API, simplificando a configuracao e melhorando a confiabilidade do envio de emails transacionais.

---

## Analise do Sistema Atual

### Componentes que usam SMTP

| Componente | Uso |
|------------|-----|
| `send-email-smtp` (Edge Function) | Funcao principal de envio via denomailer |
| `send-notification` (Edge Function) | Orquestrador multi-canal (email/whatsapp/telegram) |
| `resend-payment-notification` | Reenvio de faturas |
| `batch-collection-notification` | Cobranca em lote |
| `send-ticket-notification` | Notificacoes de chamados |
| `poll-boleto-status` | Aviso de boleto disponivel |
| `check-no-contact-tickets` | Alertas SLA para tecnicos |
| `notify-due-invoices` | Faturas a vencer |
| `check-certificate-expiry` | Certificados expirando |
| `SmtpConfigForm.tsx` | Tela de configuracao |
| `IntegrationsTab.tsx` | Aba de integracoes |
| `IntegrationStatusPanel.tsx` | Painel de status |

### Secrets Atuais

Nao existe `RESEND_API_KEY` configurado. Sera necessario solicitar ao usuario.

---

## Arquitetura Proposta

```text
ANTES:
SmtpConfigForm -> integration_settings (smtp) -> send-email-smtp -> denomailer -> Servidor SMTP

DEPOIS:
ResendConfigForm -> integration_settings (resend) -> send-email-resend -> Resend API
```

---

## Etapas de Implementacao

### 1. Nova Edge Function: `send-email-resend`

Criar uma edge function simplificada usando a API Resend.

**Arquivo:** `supabase/functions/send-email-resend/index.ts`

**Funcionalidades:**
- Buscar configuracoes de `integration_settings` (tipo `resend`)
- Enviar email via `npm:resend@2.0.0`
- Validacao de inputs (email, subject, html)
- Logging para debug

**Estrutura da Configuracao:**
```typescript
interface ResendSettings {
  api_key: string;
  from_email: string;
  from_name: string;
}
```

**Exemplo de Uso:**
```typescript
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(settings.api_key);

await resend.emails.send({
  from: `${settings.from_name} <${settings.from_email}>`,
  to: recipients,
  subject: sanitizedSubject,
  html: sanitizedHtml,
});
```

### 2. Nova Tela de Configuracao: `ResendConfigForm`

Criar componente de configuracao simplificado para Resend.

**Arquivo:** `src/components/settings/integrations/ResendConfigForm.tsx`

**Campos:**
- API Key (tipo password)
- Email Remetente (ex: `noreply@seudominio.com`)
- Nome Remetente (ex: `Colmeia TI`)
- Switch Ativo/Inativo
- Botao de Teste
- Campo para email de teste

**Layout:**
```text
+----------------------------------------------+
| [Logo] Resend - Email Transacional           |
|        Envio de emails via API               |
+----------------------------------------------+
| API Key: [_________________________]         |
| Email Remetente: [noreply@exemplo.com]       |
| Nome Remetente: [Sistema Colmeia]            |
|                                              |
| [Testar] [Salvar]                            |
+----------------------------------------------+
```

### 3. Atualizar IntegrationsTab

Substituir `SmtpConfigForm` por `ResendConfigForm` na aba de comunicacao.

**Arquivo:** `src/components/settings/integrations/IntegrationsTab.tsx`

**Alteracao:**
```diff
- import { SmtpConfigForm } from "./integrations/SmtpConfigForm";
+ import { ResendConfigForm } from "./integrations/ResendConfigForm";

<TabsContent value="comunicacao" className="space-y-4 mt-4">
-   <SmtpConfigForm />
+   <ResendConfigForm />
    <GoogleCalendarConfigForm />
</TabsContent>
```

### 4. Atualizar IntegrationStatusPanel

Mudar referencia de `smtp` para `resend` no painel de status.

**Arquivo:** `src/components/settings/integrations/IntegrationStatusPanel.tsx`

**Alteracao:**
```diff
const INTEGRATION_META = {
-   smtp: { name: "Email SMTP", icon: <Mail />, category: "Comunicacao" },
+   resend: { name: "Email (Resend)", icon: <Mail />, category: "Comunicacao" },
    // ... demais integracoes
};
```

### 5. Atualizar Edge Functions que Enviam Email

Modificar todas as edge functions para usar `send-email-resend` ao inves de `send-email-smtp`.

**Arquivos a modificar:**

| Arquivo | Alteracao |
|---------|-----------|
| `send-notification/index.ts` | Trocar logica SMTP por chamada a send-email-resend |
| `resend-payment-notification/index.ts` | `invoke("send-email-smtp")` -> `invoke("send-email-resend")` |
| `batch-collection-notification/index.ts` | Mesma alteracao |
| `send-ticket-notification/index.ts` | Mesma alteracao |
| `poll-boleto-status/index.ts` | Mesma alteracao |
| `check-no-contact-tickets/index.ts` | Mesma alteracao |
| `notify-due-invoices/index.ts` | Verificar e atualizar |
| `check-certificate-expiry/index.ts` | Verificar e atualizar |

**Padrao de alteracao em cada funcao:**
```diff
- const { error: emailError } = await supabase.functions.invoke("send-email-smtp", {
+ const { error: emailError } = await supabase.functions.invoke("send-email-resend", {
    body: {
      to: emailTo,
      subject: "...",
      html: emailHtml,
    },
  });
```

### 6. Simplificar `send-notification`

A funcao `send-notification` tem logica SMTP embutida. Atualizar para usar Resend.

**Alteracoes:**
- Remover import de `SMTPClient` (denomailer)
- Alterar busca de configuracoes de `smtp` para `resend`
- Usar chamada interna ou SDK Resend diretamente

### 7. Remover Arquivos Obsoletos

Apos migracao bem-sucedida, remover:

| Arquivo | Acao |
|---------|------|
| `supabase/functions/send-email-smtp/` | Deletar pasta |
| `src/components/settings/integrations/SmtpConfigForm.tsx` | Deletar arquivo |
| Registro `smtp` em `integration_settings` | Manter para historico ou deletar |

---

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/send-email-resend/index.ts` | Nova edge function |
| `src/components/settings/integrations/ResendConfigForm.tsx` | Novo formulario |

## Arquivos a Modificar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/settings/IntegrationsTab.tsx` | Trocar SmtpConfigForm por ResendConfigForm |
| `src/components/settings/integrations/IntegrationStatusPanel.tsx` | Atualizar meta de smtp para resend |
| `supabase/functions/send-notification/index.ts` | Remover SMTP, usar Resend |
| `supabase/functions/resend-payment-notification/index.ts` | Atualizar invoke |
| `supabase/functions/batch-collection-notification/index.ts` | Atualizar invoke |
| `supabase/functions/send-ticket-notification/index.ts` | Atualizar invoke |
| `supabase/functions/poll-boleto-status/index.ts` | Atualizar invoke |
| `supabase/functions/check-no-contact-tickets/index.ts` | Atualizar invoke |

## Arquivos a Deletar

| Arquivo | Motivo |
|---------|--------|
| `supabase/functions/send-email-smtp/index.ts` | Substituido por Resend |
| `src/components/settings/integrations/SmtpConfigForm.tsx` | Substituido por ResendConfigForm |

---

## Configuracao do Resend

### Pre-requisitos para o Usuario

1. Criar conta em https://resend.com
2. Validar dominio em https://resend.com/domains
3. Gerar API Key em https://resend.com/api-keys
4. Configurar no sistema

### Estrutura em `integration_settings`

```json
{
  "integration_type": "resend",
  "is_active": true,
  "settings": {
    "api_key": "re_xxxxxxxxxxxx",
    "from_email": "noreply@seudominio.com",
    "from_name": "Colmeia TI"
  }
}
```

---

## Beneficios da Migracao

1. **Simplicidade**: Apenas API Key, sem configurar servidor SMTP
2. **Confiabilidade**: API gerenciada com alta disponibilidade
3. **Rastreabilidade**: Dashboard Resend para monitorar entregas
4. **Menos Campos**: De 7 campos (host, porta, usuario, senha, TLS, from_email, from_name) para 3 (api_key, from_email, from_name)
5. **Sem Problemas de TLS/SSL**: API REST simples

---

## Fluxo de Migracao

```text
1. CRIAR send-email-resend
         |
         v
2. CRIAR ResendConfigForm
         |
         v
3. ATUALIZAR IntegrationsTab
   (trocar SMTP por Resend)
         |
         v
4. ATUALIZAR send-notification
   (remover SMTP, usar Resend)
         |
         v
5. ATUALIZAR demais edge functions
   (invoke send-email-resend)
         |
         v
6. TESTAR envio de emails
         |
         v
7. DELETAR arquivos SMTP
```

---

## Consideracoes de Seguranca

- API Key armazenada em `integration_settings` (banco de dados)
- Acesso restrito a usuarios com permissao de configuracao
- Logs de auditoria para alteracoes de configuracao
- Validacao de inputs (email, HTML sanitizado)
