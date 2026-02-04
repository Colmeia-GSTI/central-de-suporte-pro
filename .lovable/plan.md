
# Sistema de Templates de Email Personalizaveis

## Visao Geral

Criar um sistema completo para personalizar os emails enviados pelo sistema, permitindo:
- Adicionar logo da empresa
- Editar textos e cores dos templates
- Configurar assinatura padrao
- Visualizar preview antes de salvar

---

## Tipos de Email Identificados no Sistema

| Tipo | Funcao | Descricao |
|------|--------|-----------|
| **nfse** | send-nfse-notification | Compartilhamento de NFS-e |
| **ticket** | send-ticket-notification | Notificacoes de chamados (criado, atualizado, comentado, resolvido) |
| **invoice_reminder** | notify-due-invoices | Lembrete de fatura proxima do vencimento |
| **invoice_payment** | resend-payment-notification | Cobranca com dados de pagamento (boleto/PIX) |
| **invoice_collection** | batch-collection-notification | Cobranca em lote (reminder, urgent, final) |
| **certificate_expiry** | check-certificate-expiry | Alerta de certificado digital expirando |
| **alert** | send-alert-notification | Alertas de monitoramento |

---

## Arquitetura da Solucao

### 1. Nova Tabela: email_templates

Armazenar templates personalizaveis para cada tipo de email.

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Tipos disponiveis:**
- nfse
- ticket_created
- ticket_updated
- ticket_commented
- ticket_resolved
- invoice_reminder
- invoice_payment
- invoice_collection_reminder
- invoice_collection_urgent
- invoice_collection_final
- certificate_expiry_warning
- certificate_expiry_critical
- certificate_expiry_expired

### 2. Nova Tabela: email_settings

Configuracoes globais de email (logo, cores, assinatura).

```sql
CREATE TABLE email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#f59e0b',
  secondary_color TEXT DEFAULT '#1f2937',
  footer_text TEXT DEFAULT 'Este e um email automatico. Em caso de duvidas, entre em contato.',
  show_social_links BOOLEAN DEFAULT false,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Bucket de Storage: email-assets

Para armazenar a logo e outros arquivos usados nos emails.

---

## Componentes do Frontend

### 1. Nova Aba em Configuracoes: "Templates de Email"

Local: `src/components/settings/EmailTemplatesTab.tsx`

**Funcionalidades:**
- Lista de todos os templates disponiveis
- Editor visual com preview em tempo real
- Upload de logo da empresa
- Configuracoes de cores (primary, secondary)
- Editor de assinatura/rodape

### 2. Componentes Auxiliares

| Componente | Funcao |
|------------|--------|
| `EmailTemplateEditor.tsx` | Editor de template individual com variaveis |
| `EmailPreview.tsx` | Preview do email renderizado |
| `EmailSettingsForm.tsx` | Formulario de configuracoes globais |
| `LogoUploader.tsx` | Upload e crop da logo |

### 3. Variaveis de Template

Cada template tera variaveis especificas que podem ser usadas:

**NFS-e:**
- `{{client_name}}`, `{{nfse_number}}`, `{{valor}}`, `{{competencia}}`, `{{pdf_url}}`

**Ticket:**
- `{{client_name}}`, `{{ticket_number}}`, `{{title}}`, `{{status}}`, `{{priority}}`, `{{comment}}`, `{{portal_url}}`

**Invoice:**
- `{{client_name}}`, `{{invoice_number}}`, `{{amount}}`, `{{due_date}}`, `{{days_until_due}}`, `{{boleto_url}}`, `{{boleto_barcode}}`, `{{pix_code}}`

**Certificate:**
- `{{company_name}}`, `{{cnpj}}`, `{{days_remaining}}`, `{{expiry_date}}`

---

## Modificacoes nas Edge Functions

Cada edge function que envia email sera modificada para:

1. Buscar o template ativo do banco
2. Buscar configuracoes globais (logo, cores)
3. Substituir variaveis no template
4. Usar layout base padronizado

### Template Base Compartilhado

Todas as funcoes usarao um layout base:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .header { background: {{primary_color}}; padding: 20px; text-align: center; }
    .logo { max-height: 60px; }
    .content { padding: 30px; background: #fff; }
    .footer { background: {{secondary_color}}; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    {{#logo}}<img src="{{logo_url}}" class="logo" alt="Logo">{{/logo}}
  </div>
  <div class="content">
    {{content}}
  </div>
  <div class="footer">
    {{footer_text}}
  </div>
</body>
</html>
```

---

## Arquivos a Criar

### Frontend

| Arquivo | Descricao |
|---------|-----------|
| `src/components/settings/EmailTemplatesTab.tsx` | Aba principal de templates |
| `src/components/settings/email-templates/EmailTemplateEditor.tsx` | Editor de template |
| `src/components/settings/email-templates/EmailPreview.tsx` | Preview do email |
| `src/components/settings/email-templates/EmailSettingsForm.tsx` | Config globais |
| `src/components/settings/email-templates/TemplateVariablesHelp.tsx` | Ajuda com variaveis |

### Backend

| Arquivo | Descricao |
|---------|-----------|
| Migracao SQL | Criar tabelas email_templates e email_settings |
| Storage bucket | Criar bucket email-assets |

### Edge Functions a Modificar

| Funcao | Modificacao |
|--------|-------------|
| send-nfse-notification | Usar template personalizado |
| send-ticket-notification | Usar template personalizado |
| notify-due-invoices | Usar template personalizado |
| resend-payment-notification | Usar template personalizado |
| batch-collection-notification | Usar templates personalizados |
| check-certificate-expiry | Usar template personalizado |

---

## Integracao com SettingsPage

Adicionar nova aba "Templates" na pagina de configuracoes, apos "Integrações":

```tsx
<TabsTrigger value="email-templates" className="gap-2">
  <Mail className="h-4 w-4" />
  Templates
</TabsTrigger>
```

---

## Interface do Usuario

### Listagem de Templates

```
┌─────────────────────────────────────────────────────────────┐
│  📧 Templates de Email                                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🎫 Notificacao de Chamado - Criado    [Editar]    │   │
│  │  🎫 Notificacao de Chamado - Resolvido [Editar]    │   │
│  │  📄 Compartilhamento de NFS-e          [Editar]    │   │
│  │  💰 Lembrete de Fatura                 [Editar]    │   │
│  │  💰 Cobranca - Boleto/PIX              [Editar]    │   │
│  │  ⚠️ Certificado Expirando              [Editar]    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Editor de Template

```
┌─────────────────────────────────────────────────────────────┐
│  Editando: Notificacao de Chamado - Criado                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Assunto:                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Chamado #{{ticket_number}}] {{title}}              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────┬───────────────────────────────┐   │
│  │  Editor HTML        │  Preview                      │   │
│  │                     │                               │   │
│  │  <p>Ola {{client}}, │  ┌─────────────────────────┐ │   │
│  │  Seu chamado foi... │  │ [LOGO]                  │ │   │
│  │                     │  │ Ola Cliente Exemplo,    │ │   │
│  │                     │  │ Seu chamado foi aberto  │ │   │
│  │                     │  └─────────────────────────┘ │   │
│  └─────────────────────┴───────────────────────────────┘   │
│                                                             │
│  Variaveis disponiveis: {{client_name}}, {{ticket_number}}, │
│  {{title}}, {{status}}, {{priority}}, {{portal_url}}        │
│                                                             │
│                            [Cancelar] [Salvar Template]     │
└─────────────────────────────────────────────────────────────┘
```

### Configuracoes Globais

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Configuracoes Globais de Email                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Logo da Empresa:                                           │
│  ┌─────────────┐                                            │
│  │   [LOGO]    │  [Upload] [Remover]                        │
│  └─────────────┘                                            │
│                                                             │
│  Cor Primaria:    [#f59e0b] 🎨                              │
│  Cor Secundaria:  [#1f2937] 🎨                              │
│                                                             │
│  Texto do Rodape:                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Este e um email automatico do sistema Colmeia.      │   │
│  │ Em caso de duvidas, entre em contato.               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                           [Salvar]          │
└─────────────────────────────────────────────────────────────┘
```

---

## Resumo das Mudancas

| Tipo | Quantidade |
|------|------------|
| Novas tabelas SQL | 2 |
| Novo bucket storage | 1 |
| Novos componentes frontend | 5 |
| Edge functions modificadas | 6 |
| Arquivo SettingsPage modificado | 1 |

---

## Secao Tecnica

### Detalhes de Implementacao

**Migracao SQL:**
- Criar tabela `email_templates` com RLS para admin/manager
- Criar tabela `email_settings` (singleton) com RLS
- Inserir templates padrao para cada tipo
- Criar bucket `email-assets` publico

**Edge Functions:**
- Criar funcao helper `getEmailTemplate(type)` reutilizavel
- Criar funcao helper `renderEmailTemplate(template, variables, settings)`
- Modificar cada funcao para usar o sistema de templates

**Frontend:**
- Usar Monaco Editor ou Textarea para edicao de HTML
- Preview atualizado em tempo real com debounce
- Upload de logo via Supabase Storage
- Color picker para selecao de cores
