
# Adicionar Compartilhamento de NFS-e por Email e WhatsApp

## Objetivo

Adicionar icone de PDF na tabela de NFS-e e opcoes de envio direto por Email (SMTP) e WhatsApp (Evolution API), mantendo o sistema SMTP ja configurado.

---

## Analise do Sistema Atual

### Infraestrutura disponivel

| Componente | Status | Local |
|------------|--------|-------|
| Botao PDF na tabela | Implementado | `BillingNfseTab.tsx:591-607` |
| Botao XML na tabela | Implementado | `BillingNfseTab.tsx:574-590` |
| Edge function Email | Pronta | `send-email-smtp` |
| Edge function WhatsApp | Pronta | `send-whatsapp` |
| Storage de arquivos | Bucket `nfse-files` | Supabase Storage |
| Campos cliente | email, phone, whatsapp | Tabela `clients` |
| Campos NFS-e | pdf_url, xml_url, client_id | Tabela `nfse_history` |

---

## Solucao Proposta

### 1. Nova Edge Function: `send-nfse-notification`

Criar uma edge function dedicada para envio de NFS-e via Email (SMTP) e WhatsApp.

**Arquivo:** `supabase/functions/send-nfse-notification/index.ts`

**Funcionalidades:**
- Receber `nfse_history_id` e `channels` (email e/ou whatsapp)
- Buscar dados da NFS-e com join em `clients`
- Gerar URL assinada do PDF (valida por 24h)
- Para Email: chamar `send-email-smtp` com template profissional
- Para WhatsApp: chamar `send-whatsapp` com mensagem formatada
- Registrar log em `nfse_event_logs`

**Request:**
```typescript
{
  nfse_history_id: string;
  channels: ("email" | "whatsapp")[];
}
```

**Template de Email:**
```text
Assunto: NFS-e #77 - [Cliente] - R$ 1.461,44

Prezado(a) [Nome do Cliente],

Segue a Nota Fiscal de Servico Eletronica referente aos servicos prestados.

Dados da NFS-e:
- Numero: 77
- Competencia: Fevereiro/2026
- Valor: R$ 1.461,44

[Baixar PDF]

Atenciosamente,
[Nome da Empresa]
```

**Mensagem WhatsApp:**
```text
Ola, [Nome]!

Segue a NFS-e #77 referente aos servicos prestados em fev/2026.

Valor: R$ 1.461,44

Baixar PDF:
[URL]

Atenciosamente, [Empresa]
```

### 2. Novo Componente: `NfseShareMenu`

Menu dropdown para compartilhamento de NFS-e.

**Arquivo:** `src/components/billing/nfse/NfseShareMenu.tsx`

**Props:**
```typescript
interface NfseShareMenuProps {
  nfse: {
    id: string;
    numero_nfse: string | null;
    pdf_url: string | null;
    valor_servico: number;
    clients: {
      name: string;
      email: string | null;
      whatsapp: string | null;
    } | null;
  };
}
```

**Funcionalidades:**
- Dropdown com opcoes: Enviar por Email, Enviar por WhatsApp, Copiar Link
- Validacao: verifica se cliente tem email/whatsapp cadastrado
- Toast de erro se campo nao preenchido
- Loading state durante envio
- Desabilitado quando nao tem PDF

**Layout visual:**
```text
[Share2 icon v]
  |-- Mail      Enviar por Email
  |-- MessageCircle  Enviar por WhatsApp
  |-- Copy      Copiar Link do PDF
```

### 3. Atualizar Tabela de NFS-e

**Arquivo:** `src/components/billing/BillingNfseTab.tsx`

Adicionar `NfseShareMenu` na coluna de Arquivos, apos os botoes existentes.

**Layout atualizado (linha ~607):**
```text
[Historico] [XML] [PDF] [Compartilhar v]
```

O join com clients ja existe na query, basta usar os dados.

### 4. Atualizar Detalhes da NFS-e

**Arquivo:** `src/components/billing/nfse/NfseDetailsSheet.tsx`

Adicionar botoes de envio no footer do sheet (linha ~774).

**Layout:**
```text
[Enviar Email] [Enviar WhatsApp] [Fechar]
```

---

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/send-nfse-notification/index.ts` | Edge function para envio de NFS-e |
| `src/components/billing/nfse/NfseShareMenu.tsx` | Componente dropdown de compartilhamento |

## Arquivos a Modificar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/billing/BillingNfseTab.tsx` | Adicionar NfseShareMenu na tabela |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Adicionar botoes de envio no footer |

---

## Fluxo de Compartilhamento

```text
USUARIO CLICA COMPARTILHAR
        |
        v
    TEM PDF?
        |
   +----+----+
   |         |
  NAO       SIM
   |         |
   v         v
 Toast    Exibe Menu
 erro     [Email] [WhatsApp]
             |
             v
    SELECIONA CANAL
             |
       +-----+-----+
       |           |
    EMAIL       WHATSAPP
       |           |
       v           v
 TEM EMAIL?   TEM WHATSAPP?
       |           |
   +---+---+   +---+---+
   |       |   |       |
  NAO     SIM NAO     SIM
   |       |   |       |
   v       v   v       v
 Toast  Envia Toast  Envia
 erro   SMTP  erro   Evolution
             |           |
             v           v
          Log em nfse_event_logs
             |
             v
       Toast sucesso
```

---

## Detalhes Tecnicos

### URL Assinada para PDF

Para emails, a URL do PDF precisa ter validade maior (24h):

```typescript
const { data } = await supabase.storage
  .from("nfse-files")
  .createSignedUrl(path, 86400); // 24 horas
```

### Validacao Pre-Envio

Verificar antes de enviar:
- NFS-e tem `pdf_url` preenchido
- Cliente tem `email` cadastrado (para canal email)
- Cliente tem `whatsapp` cadastrado (para canal whatsapp)

### Log de Eventos

Registrar em `nfse_event_logs`:
```typescript
{
  nfse_history_id: id,
  event_type: "compartilhamento",
  event_data: {
    channel: "email" | "whatsapp",
    recipient: "email@..." | "5511...",
    sent_at: new Date()
  }
}
```

---

## Sobre Armazenamento

O sistema ja utiliza Supabase Storage (bucket `nfse-files`), que e compativel com S3 e suficiente para as necessidades. Nao e necessario migrar para S3 externo.

---

## Beneficios

1. **Produtividade**: Envio direto de NFS-e sem sair do sistema
2. **Rastreabilidade**: Logs de envio em `nfse_event_logs`
3. **Aproveitamento**: Reutiliza SMTP e Evolution API ja configurados
4. **Flexibilidade**: Suporta ambos os canais (Email e WhatsApp)
5. **Consistencia**: Mesmo padrao visual de outros envios do sistema
