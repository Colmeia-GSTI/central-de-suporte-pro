# Playbook de Implantação — Colmeia Helpdesk Pro

> Versão: 1.0 | Última atualização: 2026-02-13

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Configuração de Integrações](#2-configuração-de-integrações)
3. [Configuração de CRONs](#3-configuração-de-crons)
4. [Testes de Validação Pós-Deploy](#4-testes-de-validação-pós-deploy)
5. [Runbook de Troubleshooting](#5-runbook-de-troubleshooting)
6. [Procedimento de Onboarding de Novo Cliente](#6-procedimento-de-onboarding-de-novo-cliente)
7. [Treinamento: Time Financeiro](#7-treinamento-time-financeiro)
8. [Treinamento: Time de Suporte](#8-treinamento-time-de-suporte)
9. [Política de Retenção Fiscal](#9-política-de-retenção-fiscal)
10. [SLA de Incidentes Financeiros](#10-sla-de-incidentes-financeiros)

---

## 1. Pré-requisitos

### Secrets Obrigatórios

| Secret | Descrição | Onde Obter |
|--------|-----------|------------|
| `SUPABASE_URL` | URL do projeto (automático) | Lovable Cloud |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (automático) | Lovable Cloud |

### Secrets de Integrações (conforme necessário)

| Secret | Integração | Notas |
|--------|------------|-------|
| Asaas API Key | NFS-e | Obtido no painel Asaas → Integrações |
| Banco Inter Client ID/Secret | Boletos/PIX | Portal Developers Banco Inter |
| Certificados .crt/.key (Base64) | Banco Inter mTLS | Gerados no portal do Banco Inter |
| SMTP (host, port, user, pass) | E-mail | Configurado via Configurações → Integrações |
| Evolution API URL/Key | WhatsApp | Servidor Evolution API próprio |
| Telegram Bot Token | Telegram | @BotFather no Telegram |
| CheckMK URL/User/Secret | Monitoramento | Servidor CheckMK |
| Tactical RMM URL/Key | RMM | Servidor Tactical RMM |

### Certificado Digital

- Tipo: **A1** (arquivo .pfx ou .p12)
- Upload via: Configurações → Certificados → Upload
- Validade mínima recomendada: **6 meses**
- O sistema envia alertas automáticos 30, 15 e 7 dias antes do vencimento

### DNS e Domínio

- Domínio custom configurado via Lovable (Settings → Domain)
- HTTPS automático via Lovable Cloud

---

## 2. Configuração de Integrações

### 2.1 Banco Inter (Boletos e PIX)

1. Acessar **Configurações → Integrações → Banco Inter**
2. Preencher:
   - Client ID e Client Secret (obtidos no portal developers)
   - Upload de certificados .crt e .key
   - Ambiente: `sandbox` para testes, `production` para produção
3. Clicar **Testar Conexão** — deve retornar escopos disponíveis
4. Escopos necessários no portal Inter:
   - `boleto-cobranca.read`
   - `boleto-cobranca.write`
   - `cob.read` / `cob.write` (para PIX)

### 2.2 Asaas (NFS-e)

1. Acessar **Configurações → Integrações → Asaas**
2. Preencher:
   - API Key (obtida no painel Asaas → Integrações → API)
   - Wallet ID (se aplicável para subconta)
   - Ambiente: `sandbox` ou `production`
3. Clicar **Testar Conexão**
4. Configurar dados fiscais em **Configurações → Empresa**:
   - CNPJ, Inscrição Municipal, Código IBGE
   - Regime tributário, alíquota padrão, CNAE

### 2.3 SMTP (E-mail)

1. Acessar **Configurações → Integrações → SMTP**
2. Preencher host, porta, usuário, senha
3. Clicar **Enviar E-mail de Teste**
4. Personalizar templates em **Configurações → Templates de E-mail**

### 2.4 Evolution API (WhatsApp)

1. Acessar **Configurações → Integrações → Evolution API**
2. Preencher URL da instância e API Key
3. Configurar instância e nome
4. Testar envio de mensagem

### 2.5 Telegram

1. Acessar **Configurações → Integrações → Telegram**
2. Preencher Bot Token (obtido via @BotFather)
3. Configurar Chat IDs para notificações

### 2.6 CheckMK

1. Acessar **Configurações → Integrações → CheckMK**
2. Preencher URL do servidor, usuário e secret
3. Mapear sites e hosts para clientes

### 2.7 Tactical RMM

1. Acessar **Configurações → Integrações → Tactical RMM**
2. Preencher URL da API e chave
3. Configurar sincronização de agentes

---

## 3. Configuração de CRONs

Os seguintes jobs devem ser configurados via `pg_cron` no banco de dados:

```sql
-- Geração mensal de faturas (dia 1 às 06:00)
SELECT cron.schedule('generate-monthly-invoices', '0 6 1 * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-monthly-invoices',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Polling de status de boletos (a cada 30 min)
SELECT cron.schedule('poll-boleto-status', '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-boleto-status',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Polling de status de NFS-e (a cada 15 min)
SELECT cron.schedule('poll-asaas-nfse-status', '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-asaas-nfse-status',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Notificação de faturas próximas do vencimento (diário às 08:00)
SELECT cron.schedule('notify-due-invoices', '0 8 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/notify-due-invoices',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Verificação de reajuste contratual (diário às 07:00)
SELECT cron.schedule('check-contract-adjustments', '0 7 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-contract-adjustments',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Busca de índices econômicos (semanal, segunda às 06:00)
SELECT cron.schedule('fetch-economic-indices', '0 6 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-economic-indices',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Verificação de expiração de certificados (diário às 09:00)
SELECT cron.schedule('check-certificate-expiry', '0 9 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-certificate-expiry',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Verificação de tickets sem contato (a cada 2 horas)
SELECT cron.schedule('check-no-contact-tickets', '0 */2 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-no-contact-tickets',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);

-- Escalação de alertas de monitoramento (a cada 5 min)
SELECT cron.schedule('escalate-alerts', '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/escalate-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'::jsonb
  )$$
);
```

---

## 4. Testes de Validação Pós-Deploy

### Checklist de Validação

- [ ] **Login/Logout** — Criar conta, verificar e-mail, fazer login
- [ ] **Cadastro de empresa** — Preencher dados fiscais em Configurações → Empresa
- [ ] **Cadastro de cliente** — Criar cliente com CNPJ, e-mail, endereço completo
- [ ] **Contrato** — Criar contrato com serviços e valor mensal
- [ ] **Fatura manual** — Criar fatura avulsa e verificar listagem
- [ ] **Boleto** — Gerar boleto (ambiente sandbox) e verificar retorno
- [ ] **NFS-e** — Emitir nota fiscal (ambiente homologação) e verificar status
- [ ] **E-mail** — Enviar e-mail de teste via SMTP
- [ ] **WhatsApp** — Enviar mensagem de teste via Evolution API (se configurado)
- [ ] **Monitoramento** — Verificar sync CheckMK/RMM (se configurado)
- [ ] **Ticket** — Criar ticket, atribuir técnico, resolver
- [ ] **Dashboard** — Verificar que métricas atualizam corretamente

### Testes de Edge Functions

```bash
# Teste Banco Inter
curl -X POST $SUPABASE_URL/functions/v1/banco-inter \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "test"}'

# Teste Asaas
curl -X POST $SUPABASE_URL/functions/v1/asaas-nfse \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "test"}'

# Teste SMTP
curl -X POST $SUPABASE_URL/functions/v1/send-email-smtp \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "teste@empresa.com", "subject": "Teste", "html": "<p>Teste</p>"}'
```

---

## 5. Runbook de Troubleshooting

### Erro: "Integração Asaas não configurada"
- **Causa:** API Key não cadastrada ou integração desativada
- **Solução:** Configurações → Integrações → Asaas → Ativar e preencher API Key

### Erro: "Certificados do Banco Inter não configurados"
- **Causa:** Arquivos .crt/.key não foram enviados
- **Solução:** Configurações → Integrações → Banco Inter → Upload certificados

### Erro: "E0014 — DPS Duplicada"
- **Causa:** Nota fiscal já emitida no Portal Nacional com mesma Série/Número DPS
- **Solução:**
  1. Acessar o Portal Nacional e verificar se a nota existe
  2. No sistema, usar "Vincular Nota Existente" informando o número da nota
  3. Preencher justificativa obrigatória para auditoria

### Erro: "Escopo não habilitado no Banco Inter"
- **Causa:** Escopos OAuth não configurados no portal do Banco Inter
- **Solução:** Acessar portal developers do Banco Inter → App → Habilitar escopos necessários

### Boleto sem linha digitável
- **Causa:** Banco Inter ainda processando (pode levar até 30 segundos)
- **Solução:** O sistema faz polling automático. Verificar em Faturamento → Boletos se o status atualizou. Se persistir por >1h, verificar aba Saúde.

### NFS-e travada em "Processando"
- **Causa:** Timeout na comunicação com Asaas/Prefeitura
- **Solução:**
  1. Verificar logs de eventos da NFS-e
  2. Se >2h, clicar "Cancelar processamento" e reenviar
  3. Verificar aba Saúde para métricas de latência

### E-mail não enviado
- **Causa:** Credenciais SMTP inválidas ou servidor bloqueando
- **Solução:** Testar conexão SMTP em Configurações → Integrações. Verificar logs em Configurações → Logs de Mensagens.

---

## 6. Procedimento de Onboarding de Novo Cliente

### Passo a Passo

1. **Cadastrar Cliente**
   - Menu Clientes → Novo Cliente
   - Campos obrigatórios: Nome, CNPJ/CPF, E-mail, Endereço completo, CEP
   - Campo recomendado: WhatsApp (para notificações)

2. **Cadastrar Contatos**
   - Na ficha do cliente → Aba Contatos
   - Adicionar contato principal (marcar como primário)
   - Adicionar contatos adicionais se necessário

3. **Criar Contrato**
   - Menu Contratos → Novo Contrato
   - Selecionar cliente, definir valor mensal e dia de faturamento
   - Adicionar serviços incluídos
   - Configurar preferência de pagamento (boleto/PIX)
   - Habilitar emissão automática de NFS-e se aplicável

4. **Primeiro Faturamento**
   - Se o contrato foi criado após o dia de faturamento, gerar fatura manual:
     - Faturamento → Faturas → Nova Fatura
   - Verificar geração do boleto e/ou NFS-e
   - Confirmar recebimento pelo cliente

5. **Configurar Monitoramento** (se aplicável)
   - CheckMK: Mapear site/host do cliente
   - Tactical RMM: Vincular agentes ao cliente
   - Configurar regras de notificação por cliente

6. **Criar Usuário do Portal** (se aplicável)
   - Na ficha do cliente → Aba Usuários
   - Criar acesso ao portal do cliente

---

## 7. Treinamento: Time Financeiro

### Fluxo Diário

1. **Manhã:** Verificar aba Saúde em Faturamento
   - Boletos pendentes > 1h → investigar
   - NFS-e processando > 2h → investigar
   - Taxa de falha alta → escalonar

2. **Durante o dia:**
   - Conciliação bancária: Faturamento → Conciliação → Conciliar Automaticamente
   - Revisar matches sugeridos e aprovar/rejeitar
   - Processar pagamentos manuais conforme necessário

3. **Mensal (dia 1-5):**
   - Verificar geração automática de faturas
   - Conferir faturas geradas vs contratos ativos
   - Emitir NFS-e avulsas se necessário
   - Gerar relatório fiscal (Faturamento → Fiscal → Exportar)

### Ações Comuns

| Ação | Onde | Passos |
|------|------|--------|
| Gerar 2ª via de boleto | Fatura → Ações → 2ª Via | Selecionar, gerar, enviar |
| Registrar pagamento manual | Fatura → Ações → Pag. Manual | Informar data e valor |
| Renegociar fatura | Fatura → Ações → Renegociar | Definir novo vencimento/valor |
| Emitir NFS-e avulsa | Faturamento → NFS-e → Nova | Preencher dados e emitir |
| Cancelar NFS-e | NFS-e → Detalhes → Cancelar | Informar motivo (obrigatório) |

---

## 8. Treinamento: Time de Suporte

### Fluxo de Atendimento

1. **Abertura de Ticket**
   - Via portal do cliente, e-mail, WhatsApp ou manualmente
   - Classificar: categoria, prioridade, SLA

2. **Atendimento**
   - Atribuir técnico responsável
   - Registrar tempo trabalhado
   - Adicionar comentários internos e públicos

3. **Resolução**
   - Preencher descrição da resolução
   - Marcar como resolvido (notifica o cliente)
   - Cliente pode avaliar o atendimento

4. **Base de Conhecimento**
   - Consultar artigos antes de escalonar
   - Criar novos artigos após resolver problemas recorrentes

---

## 9. Política de Retenção Fiscal

### Regras de Retenção

| Tipo de Documento | Retenção | Justificativa |
|-------------------|----------|---------------|
| NFS-e (PDF/XML) | **7 anos** (2.555 dias) | Código Tributário Nacional art. 173/174 |
| Boletos | **5 anos** | Prescrição de cobrança |
| Comprovantes de pagamento | **5 anos** | Prescrição tributária |

### Armazenamento

- **Provedor:** Lovable Cloud Storage (S3-compatible)
- **Bucket:** `nfse-files`
- **SLA de disponibilidade:** 99.9%
- **Acesso:** URLs assinadas temporárias (60 segundos)
- **Redundância:** Replicação automática via infraestrutura do provedor

### Auditoria

- A tabela `storage_retention_policies` controla as políticas de retenção
- O dashboard Saúde (Faturamento → Saúde) mostra status de compliance
- Verificação periódica via RPC `audit_storage_retention`

### Procedimento de Restauração

1. Documentos são acessíveis via URLs assinadas no sistema
2. Em caso de indisponibilidade, re-download via API Asaas (para NFS-e)
3. Backup: recomenda-se exportação periódica para armazenamento externo

---

## 10. SLA de Incidentes Financeiros

### SLAs Definidos

| Tipo de Incidente | Tempo de Resolução | Escalonamento |
|-------------------|--------------------|---------------|
| Falha de emissão NFS-e | **4 horas úteis** | Admin |
| Falha de geração de boleto | **2 horas úteis** | Admin |
| Falha de envio ao cliente | **24 horas** | Financeiro |
| Erro E0014 (duplicidade) | **48 horas** | Admin |

### Playbook de Escalonamento

```
Nível 1: Financeiro (0-2h)
  ↓ sem resolução
Nível 2: Admin (2-4h)
  ↓ sem resolução  
Nível 3: Desenvolvedor (4h+)
```

### Templates de Comunicação

**Falha NFS-e:**
> Identificamos uma falha na emissão da NFS-e referente à fatura #{invoice_number} do cliente {client_name}. Nossa equipe está trabalhando na resolução. Prazo estimado: 4 horas úteis.

**Falha Boleto:**
> Houve um problema na geração do boleto da fatura #{invoice_number}. Uma nova tentativa será realizada automaticamente. Caso persista, entraremos em contato.

**Erro E0014:**
> A nota fiscal referente à fatura #{invoice_number} já existe no Portal Nacional. Estamos realizando a vinculação manual do registro. Prazo: 48 horas.

### Monitoramento

- O dashboard **Saúde** (Faturamento → Saúde) mostra incidentes abertos em tempo real
- Badge vermelho: SLA estourado
- Badge amarelo: próximo do limite (>75% do tempo)
- Botão "Criar Ticket" permite abrir ticket de incidente pré-preenchido
