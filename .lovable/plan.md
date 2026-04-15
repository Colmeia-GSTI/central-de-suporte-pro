

## Plano: Implementar Seções 7 (Licenças) e 12 (Segurança)

### Banco de dados

**Migração necessária**: Adicionar `credential_id` na tabela `doc_licenses` para referência à seção 10 (usado no tipo Antivírus).

```sql
ALTER TABLE public.doc_licenses ADD COLUMN credential_id uuid REFERENCES public.doc_credentials(id) ON DELETE SET NULL;
```

### Hook `useDocTableCrud`

Adicionar 5 tabelas ao type union: `doc_licenses`, `doc_vlans`, `doc_vpn`, `doc_firewall_rules`, `doc_access_policies`.

### Seção 7 — Licenças (`DocTableLicenses.tsx`)

**Componente novo**: `src/components/clients/documentation/DocTableLicenses.tsx`

- Tabela: `doc_licenses`
- Colunas resumo: Produto, Tipo, Qtd, Vencimento, Alerta
- Badge de vencimento reutilizando `daysUntil()` + badge verde "OK" quando >60 dias, e sem badge para perpétuas
- Drawer com campo `license_type` como primeiro campo (select: Windows / Office/M365 / Antivírus / Outro)
- **Campos condicionais por tipo**:
  - **Windows**: license_model (OEM/Retail/Volume/MAK/KMS), key, linked_device, quantity_total. Campo extra "Servidor KMS/MAK" se modelo = Volume ou MAK. Sem campos de data.
  - **Office/M365**: license_model (Assinatura mensal/anual/Perpétua/OEM), key, linked_email, quantity_total, quantity_in_use, start_date, expiry_date (oculto se Perpétua), alert_days (default 60)
  - **Antivírus**: key, devices_covered, months_contracted, start_date, expiry_date (auto-calculado de start + months, editável), alert_days (default 30), cloud_console_url, credential_id (ref seção 10). Barra de progresso na linha expandida.
  - **Outro**: license_model, key, quantity_total, quantity_in_use, start_date, expiry_date, alert_days
- **Barra de progresso antivírus**: `Progress` component. Cálculo: `(diasDecorridos / diasTotais) * 100`. Cores: ≤70% verde, ≤90% amarelo, >90% vermelho.
- **Auto-cálculo vencimento antivírus**: `useEffect` que recalcula `expiry_date` quando `start_date` ou `months_contracted` mudam no drawer.
- Password input com botão copiar para campo `key`.

### Seção 12 — Segurança (`DocSectionSecurity.tsx`)

**Componente novo**: `src/components/clients/documentation/DocSectionSecurity.tsx`

- Usa `Tabs` (horizontal) com 4 abas: VLANs, VPN, Firewall e Portas, Políticas de Acesso
- Cada aba renderiza um sub-componente de tabela CRUD
- Aba ativa gerenciada por `useState` (persiste enquanto seção aberta)

**4 sub-componentes** (inline no mesmo arquivo para simplicidade, ou separados se ficarem grandes — vou manter inline pois seguem o mesmo padrão):

**Aba VLANs** (`doc_vlans`):
- Colunas: ID VLAN, Nome, Finalidade, Range IP, Origem
- Badge origem: UniFi → verde, Manual → cinza
- Drawer: vlan_id (number), name, purpose, ip_range, gateway, dhcp_enabled (toggle), isolated (toggle), unifi_network_id, data_source (select), notes

**Aba VPN** (`doc_vpn`):
- Colunas: Nome, Tipo, Servidor, Usuários, Origem
- Drawer: name, vpn_type (select), server, port, protocol (select), users_configured (textarea), unifi_vpn_id, data_source, notes

**Aba Firewall** (`doc_firewall_rules`):
- Colunas: Descrição, Tipo, Origem → Destino, Porta, Ação
- Badge ação: Permitir → verde, Bloquear → vermelho
- Drawer: name, rule_type (select), source, destination, port, protocol (select), action (select), context (textarea), unifi_rule_id, data_source

**Aba Políticas** (`doc_access_policies`):
- Colunas: Tipo, Alvo, Grupo, Configurado via
- Badge tipo: Bloqueio → vermelho, Liberação → verde
- Drawer: policy_type (select), target, affected_group, reason, exceptions, configured_via (select), unifi_rule_id, notes

### Integração

- `ClientDocumentation.tsx`: Adicionar cases "7" e "12" no switch, importar os 2 novos componentes
- `useDocTableCrud.ts`: Expandir o type union com as 5 novas tabelas

### Arquivos

| Arquivo | Ação |
|---|---|
| Migração SQL | Adicionar `credential_id` em `doc_licenses` |
| `src/hooks/useDocTableCrud.ts` | Adicionar 5 tabelas ao type |
| `src/components/clients/documentation/DocTableLicenses.tsx` | Criar |
| `src/components/clients/documentation/DocSectionSecurity.tsx` | Criar |
| `src/components/clients/ClientDocumentation.tsx` | Integrar seções 7 e 12 |

