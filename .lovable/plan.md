

# Bloqueio de Envio: Validacao de Artefatos Completos (NFS-e + Boleto)

## Resumo

Implementar duas camadas de protecao no envio de documentos ao cliente:
1. **NFS-e**: so envia quando PDF **e** XML estiverem armazenados
2. **Cobranca**: quando a fatura possui NFS-e vinculada, so envia quando boleto (PDF+barcode) **e** NFS-e (PDF+XML) estiverem completos

## Arquivos Afetados

### 1. `supabase/functions/send-nfse-notification/index.ts`
**Validacao de XML obrigatoria antes do envio**

Atualmente (linha 156) so valida `pdf_url`. Alterar para:
- Incluir `xml_url` na query do `nfse_history` (linha 132-135)
- Adicionar validacao: se `xml_url` estiver ausente, retornar erro 400 com mensagem clara
- Registrar evento no `nfse_event_logs` com tipo `envio_bloqueado` e motivo `xml_ausente`

### 2. `supabase/functions/resend-payment-notification/index.ts`
**Bloqueio conjunto: NFS-e + Boleto devem estar completos**

Apos buscar a fatura (linha 100-103):
- Consultar `nfse_history` vinculada a fatura (pelo `invoice_id`)
- Se existe NFS-e autorizada MAS sem `pdf_url` ou `xml_url`: bloquear envio e retornar erro detalhado
- Se boleto esta em processamento (`boleto_status = pendente/processando`) sem `boleto_url` e sem `boleto_barcode`: bloquear envio
- Retornar campo `blocked_reason` com o motivo exato do bloqueio

### 3. `supabase/functions/batch-process-invoices/index.ts`
**Validacao antes do passo 4 (notificacoes)**

Antes de enviar notificacoes (linha 209-254):
- Buscar dados atualizados da fatura (boleto_url, boleto_barcode, pix_code)
- Buscar NFS-e vinculada e verificar `pdf_url` + `xml_url`
- Se artefatos incompletos: registrar `email_status = "blocked"` ao inves de enviar
- Continuar o processamento sem erro, mas reportando o bloqueio no resultado

### 4. `supabase/functions/notify-due-invoices/index.ts`
**Validacao no lembrete automatico (CRON)**

Antes de enviar cada notificacao (dentro do loop, linha 149):
- Consultar se a fatura tem NFS-e vinculada via `nfse_history`
- Se NFS-e existe mas XML nao disponivel: pular envio e registrar no log
- Lembretes de vencimento NAO dependem de boleto estar pronto (sao avisos previos)

### 5. `src/hooks/useInvoiceActions.ts`
**Validacao no frontend antes de disparar notificacoes**

Na funcao `handleResendNotification` (linha 107):
- Antes de chamar a edge function, verificar localmente se os artefatos basicos existem
- Se boleto ausente e NFS-e ausente: mostrar toast de aviso explicando o bloqueio
- Se so NFS-e ausente: permitir envio da cobranca (boleto) mas avisar que a nota nao sera anexada

Na funcao `handleEmitComplete` (passo 4, linha 237):
- Apos gerar boleto e NFS-e, recarregar dados da fatura antes de enviar notificacoes
- Se algum artefato falhou nos passos anteriores, pular notificacao e informar no resultado

### 6. `src/components/billing/InvoiceActionIndicators.tsx`
**Indicador visual de bloqueio**

Adicionar um novo estado visual:
- Quando o envio esta bloqueado por falta de artefatos, exibir icone de cadeado (`Lock`) em amarelo
- Tooltip explicando o motivo: "Envio bloqueado: XML da NFS-e nao disponivel" ou "Envio bloqueado: Boleto em processamento"

### 7. `src/components/billing/InvoiceInlineActions.tsx`
**Desabilitar botao de envio quando bloqueado**

- Verificar presenca de `pdf_url`, `xml_url` (NFS-e) e `boleto_url`/`boleto_barcode` (boleto)
- Quando incompleto: desabilitar acoes de envio e exibir tooltip com razao

## Fluxo de Decisao para Envio

```text
Fatura pronta para envio?
|
+-- Tem NFS-e vinculada (nfse_history)?
|   |
|   +-- SIM: pdf_url E xml_url presentes?
|   |   |
|   |   +-- SIM: NFS-e OK
|   |   +-- NAO: BLOQUEADO (motivo: "NFS-e incompleta - PDF ou XML ausente")
|   |
|   +-- NAO: NFS-e nao aplicavel, prosseguir
|
+-- Tem boleto vinculado (boleto_status != null)?
|   |
|   +-- SIM: boleto_url OU boleto_barcode presentes?
|   |   |
|   |   +-- SIM: Boleto OK
|   |   +-- NAO: BLOQUEADO (motivo: "Boleto em processamento")
|   |
|   +-- NAO: Verificar pix_code como alternativa
|
+-- Todos artefatos OK? -> ENVIAR
+-- Algum bloqueado? -> BLOQUEAR com motivo detalhado
```

## Registro de Metricas de Falha

Na tabela `application_logs`, registrar eventos de bloqueio com:
- `module`: `billing_notification`
- `level`: `warn`
- `message`: motivo do bloqueio
- `metadata`: `{ invoice_id, blocked_artifacts: ["xml", "boleto_pdf"], correlation_id }`

Isso permite consultar posteriormente o tempo medio entre emissao da NFS-e e disponibilizacao do XML, e a taxa de bloqueios por periodo.

## Pontos Importantes

- O bloqueio e **soft**: o usuario pode forcar o envio manualmente se desejar (via confirmacao)
- Envios automaticos (CRON) respeitam o bloqueio sem excecao
- Processamento em lote (`batch-process-invoices`) registra o bloqueio mas nao interrompe o processamento das demais faturas
- A validacao e aplicada em **todos** os pontos de envio (4 edge functions + 1 hook frontend)
