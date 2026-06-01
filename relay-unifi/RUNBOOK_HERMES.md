# Runbook — Implantação do Relay UniFi na LXC clm-tailnet

> Para execução pelo Hermes Agent na VM/LXC `clm-tailnet` (já na tailnet,
> com rota até os UDMs). Executa SOMENTE a parte da LXC. Os pré-requisitos
> do Supabase (passo 0) são manuais e devem estar feitos ANTES.

## Contexto

O relay sincroniza UDMs (UniFi OS) via Tailscale e grava no Supabase através
de RPCs escopadas, sem usar service_role. Autentica como usuário de serviço
`relay-unifi@colmeiagsti.com.br` (role technician). Código já está na `main`
do repo `central-de-suporte-pro`, pasta `relay-unifi/`.

Fluxo por UDM: `/api/auth/login` (cookie TOKEN + x-csrf-token) →
`/proxy/network/api/self/sites` → devices → alarmes → grava via RPC.

---

## Passo 0 — PRÉ-REQUISITOS MANUAIS (NÃO executáveis pelo Hermes)

Confirmar que já foram feitos no painel Supabase antes de prosseguir:

1. Usuário `relay-unifi@colmeiagsti.com.br` criado em Authentication > Users
   (Auto Confirm = true).
2. Migration `20260601120000_unifi_relay_service_and_rpcs.sql` aplicada
   (via Lovable ou SQL Editor), RE-EXECUTADA após criar o usuário para
   aplicar a role technician.
3. Senha do usuário guardada no Vault como `UNIFI_RELAY_PASSWORD`.

Se qualquer um faltar, o teste no passo 6 falha no login do Supabase.

---

## Variáveis a injetar (substituir antes de rodar)

```
SUPABASE_ANON_KEY  = <VITE_SUPABASE_PUBLISHABLE_KEY do .env do repo>
RELAY_PASSWORD     = <senha do Vault UNIFI_RELAY_PASSWORD>
UDM_IP             = 100.78.33.119   (UDM de teste — Airduto)
GH_PAT             = <PAT do GitHub, se o repo for privado>
```

---

## Passo 1 — Instalar Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"
grep -q '.deno/bin' ~/.bashrc || echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
deno --version
```

## Passo 2 — Obter o código do relay

```bash
mkdir -p /opt/relay-unifi && cd /opt/relay-unifi
# Repo privado: usar o PAT
git clone --depth 1 --filter=blob:none --sparse \
  https://${GH_PAT}@github.com/Colmeia-GSTI/central-de-suporte-pro /tmp/cdsp
cd /tmp/cdsp && git sparse-checkout set relay-unifi
cp relay-unifi/relay-unifi.ts /opt/relay-unifi/relay-unifi.ts
rm -rf /tmp/cdsp
ls -l /opt/relay-unifi/relay-unifi.ts
```

## Passo 3 — Exportar o cert self-signed do UDM

```bash
mkdir -p /etc/relay-unifi
echo | openssl s_client -connect ${UDM_IP}:443 2>/dev/null \
  | openssl x509 > /etc/relay-unifi/udm-certs.pem
grep -q "BEGIN CERTIFICATE" /etc/relay-unifi/udm-certs.pem \
  && echo "OK: cert exportado" || echo "FALHA: cert nao exportado"
```

> Para mais UDMs: repetir com `>>` (append) no mesmo arquivo.

## Passo 4 — Variáveis de ambiente

```bash
cat > /etc/relay-unifi.env <<EOF
SUPABASE_URL=https://silefpsayliwqtoskkdz.supabase.co
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
RELAY_EMAIL=relay-unifi@colmeiagsti.com.br
RELAY_PASSWORD=${RELAY_PASSWORD}
EOF
chmod 600 /etc/relay-unifi.env
echo "env criado (600)"
```

## Passo 5 — Validar tipos

```bash
cd /opt/relay-unifi
deno check relay-unifi.ts && echo "TS OK"
```

## Passo 6 — Teste de ciclo único

```bash
cd /opt/relay-unifi
set -a; source /etc/relay-unifi.env; set +a
DENO_CERT=/etc/relay-unifi/udm-certs.pem \
  deno run --allow-net --allow-env relay-unifi.ts
```

**Saída esperada:**
```
N controller(s) direct ativo(s)
[Airduto] X site(s)
[Airduto] success — Y devices, Z alertas (Wms)
```

**Se falhar:**
- `Supabase login falhou: 400/401` → passo 0 incompleto (usuário/senha/role).
- `0 controller(s)` → nenhum UDM cadastrado com connection_method='direct' e
  url=https://<ip-tailscale>. Cadastrar via UI do HD Pro ou SQL.
- `UDM login falhou` → credenciais locais do UDM erradas no banco.
- timeout no UDM → rota Tailscale caiu (verificar `tailscale status`).

## Passo 7 — Produção (systemd timer)

Só após o passo 6 retornar `success`.

```bash
cat > /etc/systemd/system/relay-unifi.service <<'EOF'
[Unit]
Description=Relay UniFi OS sync
After=network-online.target tailscaled.service

[Service]
Type=oneshot
EnvironmentFile=/etc/relay-unifi.env
Environment=DENO_CERT=/etc/relay-unifi/udm-certs.pem
ExecStart=/root/.deno/bin/deno run --allow-net --allow-env /opt/relay-unifi/relay-unifi.ts
EOF

cat > /etc/systemd/system/relay-unifi.timer <<'EOF'
[Unit]
Description=Relay UniFi OS — a cada 15min

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now relay-unifi.timer
systemctl list-timers relay-unifi.timer --no-pager
```

> Ajustar o caminho do binário deno se não for root: `which deno`.
