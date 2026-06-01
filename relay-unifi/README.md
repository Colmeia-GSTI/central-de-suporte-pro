# Relay UniFi OS — Implantação na LXC (tailnet)

Worker autônomo que sincroniza UDMs (UniFi OS) via Tailscale, gravando no
Supabase através de RPCs escopadas. Não usa `service_role`.

## Arquitetura

```
LXC clm-tailnet (Deno)
  ├─ supabaseLogin() ──► /auth/v1/token (usuário relay-unifi, role technician)
  ├─ rpc('unifi_relay_list_controllers') ──► lista UDMs direct ativos
  ├─ para cada UDM (via Tailscale):
  │     /api/auth/login → cookie TOKEN + x-csrf-token
  │     /proxy/network/api/self/sites
  │     /proxy/network/api/s/<site>/stat/device
  │     /proxy/network/api/s/<site>/rest/alarm
  └─ rpc('unifi_relay_upsert_device' | 'post_alert' | 'log_sync')
```

Sem porta exposta. Saída: TLS para Supabase + Tailscale para os UDMs.

## Pré-requisitos (ordem obrigatória)

1. **Criar usuário de serviço** no painel Supabase:
   - Authentication > Users > Add user
   - Email: `relay-unifi@colmeiagsti.com.br`
   - Senha forte, **Auto Confirm = true**
   - Guardar a senha no Vault como `UNIFI_RELAY_PASSWORD`

2. **Aplicar a migration** `20260601120000_unifi_relay_service_and_rpcs.sql`
   (via Lovable prompt ou SQL Editor). Ela cria as RPCs e, ao rodar **depois**
   do passo 1, aplica role `technician` ao usuário. Se rodar antes, apenas
   re-execute após criar o usuário.

3. **Obter a ANON/publishable key** (já está no `.env` do repo como
   `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Configuração na LXC

```bash
# Instalar Deno
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"

# Variáveis (ajustar valores reais)
cat > /etc/relay-unifi.env <<'EOF'
SUPABASE_URL=https://silefpsayliwqtoskkdz.supabase.co
SUPABASE_ANON_KEY=<VITE_SUPABASE_PUBLISHABLE_KEY do .env>
RELAY_EMAIL=relay-unifi@colmeiagsti.com.br
RELAY_PASSWORD=<senha do Vault UNIFI_RELAY_PASSWORD>
EOF
chmod 600 /etc/relay-unifi.env
```

## Certificado self-signed do UDM

UDMs usam cert auto-assinado. Deno valida TLS por padrão. **Não** desative a
validação globalmente. Use o flag específico do Deno apontando para o(s) IP(s):

```bash
# Opção recomendada: exportar o cert do UDM e confiar nele
# (executar uma vez por UDM, na LXC)
echo | openssl s_client -connect 100.78.33.119:443 2>/dev/null \
  | openssl x509 > /etc/relay-unifi/udm-100.78.33.119.pem

# Rodar apontando os certs confiáveis
DENO_CERT=/etc/relay-unifi/udm-100.78.33.119.pem \
  deno run --allow-net --allow-env relay-unifi.ts
```

> Para múltiplos UDMs com certs distintos, concatene os PEMs num único arquivo
> e aponte `DENO_CERT` para ele. Alternativa de último caso (menos segura):
> `--unsafely-ignore-certificate-errors=100.78.33.119` restrito por host.

## Teste manual (ciclo único)

```bash
set -a; source /etc/relay-unifi.env; set +a
DENO_CERT=/etc/relay-unifi/udm-100.78.33.119.pem \
  deno run --allow-net --allow-env relay-unifi.ts
```

Saída esperada: `N controller(s) direct ativo(s)` → por UDM:
`[Nome] success — X devices, Y alertas (Zms)`.

## Produção: systemd timer (recomendado)

`/etc/systemd/system/relay-unifi.service`:
```ini
[Unit]
Description=Relay UniFi OS sync
After=network-online.target tailscaled.service

[Service]
Type=oneshot
EnvironmentFile=/etc/relay-unifi.env
Environment=DENO_CERT=/etc/relay-unifi/udm-certs.pem
ExecStart=/root/.deno/bin/deno run --allow-net --allow-env /opt/relay-unifi/relay-unifi.ts
```

`/etc/systemd/system/relay-unifi.timer`:
```ini
[Unit]
Description=Relay UniFi OS — a cada 15min

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now relay-unifi.timer
```

> O worker já respeita `sync_interval_hours` por controller, então o timer
> pode rodar a cada 15min sem sobrecarregar — só sincroniza quem está vencido.

## Migração de cada UDM para método `direct`

Para o relay assumir um UDM, o registro em `unifi_controllers` deve ter:
- `connection_method = 'direct'`
- `url = https://<ip-tailscale-do-udm>` (ex.: `https://100.78.33.119`)
- `username` / `password_encrypted` = credenciais locais do UDM (usuário local,
  não conta UI.com cloud)

Isso é feito pela UI do HD Pro (tela de controllers UniFi) ou via SQL pelo Jonatas.
