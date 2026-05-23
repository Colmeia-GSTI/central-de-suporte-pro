# Plano de Migração — Email: Resend → Lovable Cloud Custom Emails

> **Status:** PLANEJADO (não iniciado). Projeto separado da refatoração estrutural.
> **Criado:** 2026-05-23
> **Risco:** MÉDIO — mexe em fluxo crítico (convites, cobrança, notificações fiscais), mas a arquitetura favorece migração isolada.

## 1. Por que a arquitetura atual ajuda

Todo envio de email no sistema passa por **um único ponto**: a edge function `send-email-resend`. As 16 edge functions que enviam email apenas chamam `supabase.functions.invoke("send-email-resend", { body: {...} })`. A chamada real à API do Resend está isolada em ~30 linhas (linhas ~104-230 de `send-email-resend/index.ts`).

Tudo o que vem antes (validação de destinatários, sanitização de HTML contra XSS, rate limiting, logging em `message_logs`, attachments base64/URL) é **agnóstico de provider** e pode ser preservado integralmente.

**Consequência:** a migração não precisa tocar nas 16 functions consumidoras. Só o miolo do `send-email-resend`.

## 2. Edge functions consumidoras (NÃO precisam mudar)

batch-collection-notification, send-notification, invite-user, resend-confirmation,
webhook-asaas-nfse, webhook-banco-inter, send-nfse-notification, resend-payment-notification,
generate-monthly-invoices, send-alert-notification, resend-invite, generate-invoice-payments,
check-no-contact-tickets, send-ticket-notification, notify-due-invoices, auth-email-hook.

Todas continuam chamando `send-email-resend` com o mesmo contrato (`to`, `subject`, `html`, `from_name`, `from_email`, `attachments`, `related_type`, `related_id`, `user_id`).

## 3. Pré-requisitos (infra, ANTES de qualquer código)

1. **Lovable Cloud habilitado** no projeto (confirmar).
2. **Workspace em plano pago** (confirmar — Custom Emails exige).
3. **Domínio próprio com acesso ao DNS**: `colmeiagsti.com`. Recomendado subdomínio dedicado de envio: `notify.colmeiagsti.com` ou `mail.colmeiagsti.com` (protege a reputação do domínio raiz).
4. **Ser admin/owner do workspace Lovable** para adicionar/verificar domínio.
5. **Verificação de DNS**: Lovable configura SPF/DKIM/DMARC automaticamente, mas a propagação leva tempo (minutos a 48h). Emails só saem do domínio próprio APÓS verificação.

## 4. Ordem de execução proposta (faseada, reversível)

### Fase 0 — Preparação (sem código)
- Habilitar Custom Emails no Lovable Cloud.
- Adicionar e verificar o subdomínio de envio.
- Aguardar verificação DNS concluir.
- **Não desligar o Resend ainda.**

### Fase 1 — Adaptador dual-provider no `send-email-resend`
- Refatorar o miolo (~30 linhas) para um adaptador que escolhe o provider via env var `EMAIL_PROVIDER` (`resend` | `lovable`), default `resend`.
- Extrair a lógica de envio para `_shared/email-providers.ts` com duas implementações: `sendViaResend()` (atual, intacta) e `sendViaLovable()` (nova).
- Renomear NADA externamente — a function continua se chamando `send-email-resend` para não quebrar as 16 consumidoras (renomear é cosmético e fica para o fim).
- Deploy com `EMAIL_PROVIDER=resend` (comportamento idêntico ao atual; zero mudança funcional).

### Fase 2 — Teste canário
- Mudar `EMAIL_PROVIDER=lovable` APENAS em ambiente de preview/staging.
- Testar cada tipo de email: convite, confirmação, notificação de ticket, cobrança, NFSe.
- Validar entrega real (caixa de entrada, não spam), branding, attachments.

### Fase 3 — Cutover gradual em produção
- Opção A (mais segura): roteamento por tipo — emails não-críticos (notificação de ticket) primeiro via Lovable, financeiros/fiscais por último.
- Opção B: cutover total `EMAIL_PROVIDER=lovable` em produção, com Resend como fallback automático se Lovable retornar erro.
- Monitorar `message_logs` por alguns dias.

### Fase 4 — Desativação do Resend
- Após período de estabilidade (sugestão: 2 semanas sem incidente), remover `sendViaResend()`, o secret `RESEND_API_KEY` e a tela `ResendConfigForm`.
- Renomear `send-email-resend` → `send-email` (atualizar as 16 chamadas — pode ser scriptado com sed).
- Atualizar testes de integração.

## 5. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Emails caírem em spam durante transição de domínio | Subdomínio dedicado + aguardar verificação completa antes do cutover |
| Lovable Mail não suportar attachments base64 (NFSe PDF, boleto) | **VALIDAR NA FASE 2** antes de migrar emails fiscais. Se não suportar, manter Resend para esses tipos. |
| Vendor lock-in | Adaptador dual-provider mantém `sendViaResend()` por trás de flag; reverter = mudar 1 env var |
| Convite recém-construído quebrar | Convite é o primeiro a testar na Fase 2 (canário) |
| Limite de envio do plano Lovable | Confirmar quota antes do cutover; comparar com volume atual em `message_logs` |

## 6. Ponto de validação crítico (bloqueador)

**Attachments.** O sistema envia PDF de NFSe e boletos como anexo base64 via Resend. Se o Lovable Cloud Custom Emails não suportar attachments, a migração dos emails fiscais NÃO pode acontecer — manteríamos um modelo híbrido (Lovable para transacionais, Resend para fiscais com anexo). Isso precisa ser confirmado na documentação ou em teste antes da Fase 3.

## 7. Decisão de escopo

Esta migração é **troca de infraestrutura**, não refatoração de código. Foi separada da refatoração estrutural em curso (consolidação de ConfigForms, remoção de código morto) por ter natureza, risco e cadência diferentes.
