
# Ajustar Sistema para Dominio Principal .com

## Objetivo

Atualizar todos os arquivos para usar o dominio principal `https://suporte.colmeiagsti.com` e manter `https://suporte.colmeiagsti.com.br` como secundario.

---

## Arquivos a Modificar

### 1. index.html

Atualizar todas as meta tags de SEO e Open Graph:

| Tag | De | Para |
|-----|----|------|
| canonical | `suporte.colmeiagsti.com.br` | `suporte.colmeiagsti.com` |
| og:url | `suporte.colmeiagsti.com.br` | `suporte.colmeiagsti.com` |
| og:image | `suporte.colmeiagsti.com.br/og-image.png` | `suporte.colmeiagsti.com/og-image.png` |
| twitter:image | `suporte.colmeiagsti.com.br/og-image.png` | `suporte.colmeiagsti.com/og-image.png` |

---

### 2. public/manifest.json

Atualizar URLs do PWA:

| Campo | De | Para |
|-------|----|------|
| start_url | `suporte.colmeiagsti.com.br/` | `suporte.colmeiagsti.com/` |
| scope | `suporte.colmeiagsti.com.br/` | `suporte.colmeiagsti.com/` |
| id | `suporte.colmeiagsti.com.br/` | `suporte.colmeiagsti.com/` |

---

### 3. Edge Function: send-ticket-notification

Atualizar fallback do PORTAL_URL:

```typescript
// De:
const portalUrl = Deno.env.get("PORTAL_URL") || "https://colmeiahdpro.lovable.app/portal";

// Para:
const portalUrl = Deno.env.get("PORTAL_URL") || "https://suporte.colmeiagsti.com/portal";
```

---

## Configuracao Google Cloud Console

Dominios a configurar nas credenciais OAuth:

**Authorized JavaScript Origins:**
- `https://suporte.colmeiagsti.com` (principal)
- `https://suporte.colmeiagsti.com.br` (secundario)

**Authorized Redirect URIs:**
- `https://suporte.colmeiagsti.com/settings` (principal)
- `https://suporte.colmeiagsti.com.br/settings` (secundario)

---

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `index.html` | Trocar `.com.br` por `.com` em 4 meta tags |
| `public/manifest.json` | Trocar `.com.br` por `.com` em 3 campos |
| `supabase/functions/send-ticket-notification/index.ts` | Atualizar fallback PORTAL_URL |
| `public/robots.txt` | Ja esta correto com `.com` |

---

## Nota

O arquivo `robots.txt` ja usa o dominio `.com` corretamente no sitemap. Os demais arquivos serao atualizados para consistencia.
