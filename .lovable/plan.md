

# Análise de Necessidade: Rate Limit de 10 req/seg

## Achados da Investigação

### 1. **Estado Atual da Aplicação**

**Endpoints Públicos (sem `verify_jwt`):**
- `resolve-username` - sem autenticação (login flow)
- `forgot-password` - sem autenticação (password recovery)
- `send-email-smtp` - sem autenticação (entregas de email)
- `send-whatsapp` - sem autenticação (entregas de WhatsApp)
- + 16 outras funções de orquestração/webhook

**Infraestrutura de Rate Limit:**
- Existe utility `checkRateLimit()` em `src/lib/security.ts`
- Configurável via `RateLimitConfig { maxRequests, windowMs }`
- **Atualmente NUNCA é chamada** - nenhuma implementação ativa

**Padrão de Uso:**
- 426 chamadas a `supabase.functions.invoke()` em 44 arquivos
- Chamadas síncronas no frontend (UI pode ficar travada se edge functions falharem)
- Batch operations (ex: `batch-process-invoices`, `generate-monthly-invoices`)
- Processamento de faturas via Banco Inter e Asaas (integrações externas)

---

### 2. **Análise de Necessidade: 10 req/seg É ADEQUADO?**

**CENÁRIOS CRÍTICOS que PRECISAM de Rate Limit:**

| Endpoint | Risco | Impacto Atual |
|----------|-------|--------------|
| `resolve-username` | Enumeration attack (descobrir usuários válidos) | ALTO - sem proteção |
| `forgot-password` | Email spam / credential stuffing | ALTO - sem proteção |
| `batch-process-invoices` | Consumo massivo de recursos / spam de email | ALTO - sem proteção |
| `send-email-smtp` | Email spam / DDoS ao provedor SMTP | MÉDIO - pode afetar reputação |
| `send-whatsapp` | WhatsApp API quota esgotamento | MÉDIO - custos multiplicam |

**Limite de 10 req/seg:**
- ✅ **Apropriado para**: login (5-10 tentativas legítimas/min por usuário)
- ✅ **Apropriado para**: password recovery (1-2 tentativas/min por usuário)
- ✅ **Apropriado para**: notificações em batch (graduais, não explosivas)
- ❌ **NÃO apropriado para**: operações internas (ex: sync de dados, batch processing)
  - Esses endpoints já têm autenticação (`verify_jwt = true` por padrão)
  - Podem precisar de limites maiores (50-100 req/seg)

---

### 3. **Recomendação: Escopo de Segurança**

**IMPLEMENTAR Rate Limit de 10 req/seg SOMENTE em:**

1. **Endpoints de Autenticação** (público, sem `verify_jwt`)
   - `resolve-username` → 10 req/seg por IP (previne enumeration)
   - `forgot-password` → 10 req/seg por IP (previne email spam)

2. **Endpoints de Notificação** (sem `verify_jwt`)
   - `send-email-smtp` → 10 req/seg por `from` address (previne spam)
   - `send-whatsapp` → 10 req/seg por phone (previne WhatsApp API abuse)

3. **Endpoints de Batch** (sem `verify_jwt`, chamados internamente)
   - `batch-process-invoices` → 5 req/seg (operação pesada)
   - `batch-collection-notification` → 10 req/seg

**NÃO implementar em:**
- Endpoints autenticados (ex: `banco-inter`, `asaas-nfse`, `generate-monthly-invoices`)
  - Já têm verificação de `verify_jwt = true` ou validação interna
  - Limites podem prejudicar operações legítimas em massa

---

### 4. **Impacto em Usuários Legítimos**

**Cenário 1: Usuário tentando login**
- 10 req/seg = 600 tentativas por minuto = seguro para login (típico: 1-3/min)
- ✅ Impacto: **NENHUM**

**Cenário 2: Envio em batch de 1000 faturas**
- `batch-process-invoices` → 1000 faturas / 5 req/seg = ~200 segundos (~3 min)
- Tempo de processamento aceitável
- ✅ Impacto: **MÍNIMO**

**Cenário 3: Sincronização com CheckMK**
- Endpoints internos (`checkmk-sync`) não precisam de rate limit
- ✅ Impacto: **NENHUM**

---

### 5. **Classificação de Segurança**

**Este é um escopo de segurança LEGÍTIMO porque:**
- ✅ Protege contra força bruta (enumeration, password stuffing)
- ✅ Previne abuso de email/WhatsApp (spam, custos)
- ✅ Evita DDoS em endpoints públicos
- ✅ Alinhado com OWASP (API2:2023 - Authentication)
- ✅ Não prejudica usuários legítimos

**Risco Atual (SEM rate limit):**
- Um atacante pode fazer 10.000 tentativas/segundo em `resolve-username`
- Descobrir todos os usuários em minutos
- Desativar a aplicação com email spam em `send-email-smtp`

---

### 6. **Estratégia de Implementação Proposta**

**Phase 1 - Endpoints Críticos** (implementar primeiro)
- `resolve-username` → 10 req/seg por IP/username
- `forgot-password` → 10 req/seg por IP/identifier

**Phase 2 - Endpoints de Notificação** (implementar depois)
- `send-email-smtp` → 10 req/seg por `from` address
- `send-whatsapp` → 10 req/seg por phone

**Phase 3 - Monitoramento**
- Logs de rejections (429 responses)
- Alertas se algum IP atingir limite múltiplas vezes
- Dashboard de rate limit metrics

---

## CONCLUSÃO

**Implementar rate limit de 10 req/seg é NECESSÁRIO e apropriado em escopo de segurança.**

Recomendação: Começar pela Phase 1 (autenticação), que é a mais crítica. A implementação usando `checkRateLimit()` já existe no codebase e pode ser integrada rapidamente.

