import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ── Types ──────────────────────────────────────────
export interface DocPdfData {
  client: {
    name: string;
    trade_name?: string | null;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  };
  infrastructure?: Record<string, unknown> | null;
  telephony?: Record<string, unknown> | null;
  internetLinks?: Record<string, unknown>[];
  devices?: Record<string, unknown>[];
  networkDevices?: Record<string, unknown>[];
  cftv?: Record<string, unknown>[];
  licenses?: Record<string, unknown>[];
  softwareErp?: Record<string, unknown>[];
  domains?: Record<string, unknown>[];
  credentialsCount?: number;
  contacts?: Record<string, unknown>[];
  supportHours?: Record<string, unknown> | null;
  vlans?: Record<string, unknown>[];
  firewallRules?: Record<string, unknown>[];
  accessPolicies?: Record<string, unknown>[];
  externalProviders?: Record<string, unknown>[];
  routines?: Record<string, unknown>[];
}

// ── Colors ─────────────────────────────────────────
const C = {
  coverBg: "#1a1a2e",
  coverText: "#ffffff",
  sectionBg: "#f5a623",
  sectionText: "#ffffff",
  rowEven: "#f9f9f9",
  rowOdd: "#ffffff",
  text: "#1a1a1a",
  label: "#666666",
  border: "#e0e0e0",
};

// ── Styles ─────────────────────────────────────────
const s = StyleSheet.create({
  page: { paddingTop: 60, paddingBottom: 50, paddingHorizontal: 40, fontSize: 9, fontFamily: "Helvetica", color: C.text },
  // Cover
  cover: { flex: 1, backgroundColor: C.coverBg, justifyContent: "center", alignItems: "center", padding: 60 },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.coverText, marginBottom: 8, textAlign: "center" },
  coverSubtitle: { fontSize: 14, color: "#f5a623", marginBottom: 40, textAlign: "center" },
  coverClient: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.coverText, marginBottom: 6, textAlign: "center" },
  coverCnpj: { fontSize: 11, color: "#cccccc", marginBottom: 40, textAlign: "center" },
  coverDate: { fontSize: 10, color: "#999999", textAlign: "center" },
  coverFooter: { position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#777777" },
  // Header / Footer
  header: { position: "absolute", top: 15, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  headerSection: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.label },
  headerClient: { fontSize: 7, color: C.label },
  footer: { position: "absolute", bottom: 15, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.label },
  // Section
  sectionHeader: { backgroundColor: C.sectionBg, padding: 6, marginBottom: 8, borderRadius: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.sectionText },
  // Field pair
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 130, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.label },
  fieldValue: { flex: 1, fontSize: 9 },
  // Table
  tableHeader: { flexDirection: "row", backgroundColor: C.sectionBg, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 1 },
  tableHeaderCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.sectionText },
  tableRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableCell: { fontSize: 8 },
  // Info
  infoBox: { backgroundColor: "#f0f0f0", padding: 8, borderRadius: 2, marginBottom: 8 },
  infoText: { fontSize: 8, color: C.label, fontStyle: "italic" },
  mb8: { marginBottom: 8 },
  mb16: { marginBottom: 16 },
  subsectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.text, marginTop: 8, marginBottom: 4 },
});

// ── Helpers ────────────────────────────────────────
const v = (val: unknown): string => {
  if (val === null || val === undefined || val === "") return "—";
  return String(val);
};

const formatDate = (d?: string | null): string => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR");
  } catch { return "—"; }
};

const now = () => {
  const d = new Date();
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

// ── Reusable Components ────────────────────────────
function HeaderFooter({ sectionName, clientName }: { sectionName: string; clientName: string }) {
  return (
    <>
      <View style={s.header} fixed>
        <Text style={s.headerSection}>{sectionName}</Text>
        <Text style={s.headerClient}>{clientName}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>Colmeia — Documentação Técnica</Text>
        <Text render={({ pageNumber }) => `Página ${pageNumber}`} />
      </View>
    </>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{number}. {title}</Text>
    </View>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{v(value)}</Text>
    </View>
  );
}

function DataTable({ headers, widths, rows }: { headers: string[]; widths: number[]; rows: unknown[][] }) {
  if (rows.length === 0) return null;
  return (
    <View style={s.mb8}>
      <View style={s.tableHeader}>
        {headers.map((h, i) => (
          <Text key={i} style={[s.tableHeaderCell, { width: `${widths[i]}%` }]}>{h}</Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={[s.tableRow, { backgroundColor: ri % 2 === 0 ? C.rowEven : C.rowOdd }]}>
          {row.map((cell, ci) => (
            <Text key={ci} style={[s.tableCell, { width: `${widths[ci]}%` }]}>{v(cell)}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Section renderers ──────────────────────────────

function CoverPage({ data }: { data: DocPdfData }) {
  const c = data.client;
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={s.cover}>
        <Text style={s.coverTitle}>⬡ COLMEIA</Text>
        <Text style={s.coverSubtitle}>Documentação Técnica de TI</Text>
        <Text style={s.coverClient}>{c.trade_name || c.name}</Text>
        {c.document && <Text style={s.coverCnpj}>CNPJ: {c.document}</Text>}
        <Text style={s.coverDate}>Gerado em: {now()}</Text>
        <Text style={s.coverFooter}>
          Documento gerado pelo sistema Colmeia — Central de Atendimento MSP
        </Text>
      </View>
    </Page>
  );
}

function Section1({ data }: { data: DocPdfData }) {
  const c = data.client;
  return (
    <>
      <SectionHeader number="01" title="Dados Gerais do Cliente" />
      <Field label="Razão Social" value={c.name} />
      <Field label="Nome Fantasia" value={c.trade_name} />
      <Field label="CNPJ" value={c.document} />
      <Field label="E-mail" value={c.email} />
      <Field label="Telefone" value={c.phone} />
      <Field label="Endereço" value={[c.address, c.city, c.state, c.zip_code].filter(Boolean).join(", ")} />
    </>
  );
}

function Section2({ data }: { data: DocPdfData }) {
  const infra = data.infrastructure;
  if (!infra) return null;
  const hasAny = Object.entries(infra).some(([k, val]) => !["id", "client_id", "created_at", "updated_at"].includes(k) && val);
  if (!hasAny) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="02" title="Infraestrutura" />
      <Text style={s.subsectionTitle}>Geral</Text>
      <Field label="Tipo de Servidor" value={infra.server_type} />
      <Field label="Active Directory" value={infra.active_directory} />
      <Field label="Localização AD" value={infra.ad_location} />
      <Field label="File Server" value={infra.file_server} />
      <Field label="Cloud Provider" value={infra.cloud_provider} />
      <Text style={s.subsectionTitle}>Console UniFi</Text>
      <Field label="Modelo" value={infra.unifi_console_model} />
      <Field label="IP" value={infra.unifi_console_ip} />
      <Field label="Firmware" value={infra.unifi_firmware} />
      <Field label="Uptime" value={infra.unifi_uptime} />
      <Text style={s.subsectionTitle}>Gateway</Text>
      <Field label="Modelo" value={infra.gateway_model} />
      <Field label="IP LAN" value={infra.gateway_ip_lan} />
      <Field label="IP WAN" value={infra.gateway_ip_wan} />
      <Field label="Firmware" value={infra.gateway_firmware} />
      <Field label="Observações" value={infra.notes} />
    </View>
  );
}

function Section3({ data }: { data: DocPdfData }) {
  const links = data.internetLinks ?? [];
  const tel = data.telephony;
  if (links.length === 0 && !tel) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="03" title="Internet, Conectividade e Telefonia" />
      {links.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Links de Internet</Text>
          <DataTable
            headers={["Provedor", "Tipo", "Velocidade", "IP Público", "Vencimento"]}
            widths={[25, 15, 15, 25, 20]}
            rows={links.map(l => [l.provider, l.link_type, l.plan_speed, l.public_ip, formatDate(l.contract_expiry as string)])}
          />
        </>
      )}
      {tel && (
        <>
          <Text style={s.subsectionTitle}>Telefonia</Text>
          <Field label="Tipo" value={tel.type} />
          <Field label="Provedor" value={tel.provider} />
          <Field label="Sistema" value={tel.system} />
          <Field label="Ramais" value={tel.extensions_count} />
          <Field label="Suporte" value={tel.support_phone} />
        </>
      )}
    </View>
  );
}

function Section4({ data }: { data: DocPdfData }) {
  const devs = (data.devices ?? []).filter(d => {
    const dt = String(d.device_type ?? "").toLowerCase();
    return ["desktop", "notebook", "servidor", "server", "workstation", "laptop", "estação"].some(t => dt.includes(t)) || !d.device_type;
  });
  if (devs.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="04" title="Estações e Servidores" />
      <DataTable
        headers={["Nome", "Tipo", "SO", "IP", "Status"]}
        widths={[25, 15, 25, 20, 15]}
        rows={devs.map(d => [d.name, d.device_type, d.os, d.ip_local, d.status])}
      />
    </View>
  );
}

function Section5({ data }: { data: DocPdfData }) {
  const devs = (data.networkDevices ?? []);
  if (devs.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="05" title="Dispositivos de Rede" />
      <DataTable
        headers={["Nome", "Tipo", "Modelo", "IP", "Localização"]}
        widths={[20, 15, 25, 20, 20]}
        rows={devs.map(d => [d.name, d.device_type, d.brand_model, d.ip_local, d.physical_location])}
      />
    </View>
  );
}

function Section6({ data }: { data: DocPdfData }) {
  const all = data.cftv ?? [];
  if (all.length === 0) return null;
  const nvrs = all.filter(c => String(c.device_type).toLowerCase().includes("nvr"));
  const cams = all.filter(c => !String(c.device_type).toLowerCase().includes("nvr"));
  return (
    <View style={s.mb16}>
      <SectionHeader number="06" title="CFTV — Câmeras e NVR" />
      {nvrs.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>NVRs / DVRs</Text>
          <DataTable
            headers={["Nome", "Modelo", "IP", "Canais", "Armazenamento", "Retenção"]}
            widths={[18, 20, 15, 12, 18, 17]}
            rows={nvrs.map(n => [n.name, n.brand_model, n.ip, n.channels, n.storage_size, n.retention_days ? `${n.retention_days}d` : "—"])}
          />
        </>
      )}
      {cams.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Câmeras</Text>
          <DataTable
            headers={["Nome", "Modelo", "Tipo", "Resolução", "Local", "Alimentação"]}
            widths={[18, 18, 14, 14, 20, 16]}
            rows={cams.map(c => [c.name, c.brand_model, c.camera_type, c.resolution, c.physical_location, c.power_type])}
          />
        </>
      )}
    </View>
  );
}

function Section7({ data }: { data: DocPdfData }) {
  const lics = data.licenses ?? [];
  if (lics.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="07" title="Licenças" />
      <DataTable
        headers={["Produto", "Tipo", "Qtd", "Vencimento"]}
        widths={[35, 20, 15, 30]}
        rows={lics.map(l => [l.product_name, l.license_type, l.quantity_total, formatDate(l.expiry_date as string)])}
      />
      <View style={s.infoBox}>
        <Text style={s.infoText}>Chaves de licença omitidas por segurança.</Text>
      </View>
    </View>
  );
}

function Section8({ data }: { data: DocPdfData }) {
  const sw = data.softwareErp ?? [];
  if (sw.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="08" title="Softwares e ERPs" />
      <DataTable
        headers={["Sistema", "Categoria", "Versão", "Fornecedor"]}
        widths={[30, 20, 20, 30]}
        rows={sw.map(s => [s.name, s.category, s.version, s.vendor])}
      />
    </View>
  );
}

function Section9({ data }: { data: DocPdfData }) {
  const dom = data.domains ?? [];
  if (dom.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="09" title="Domínios e DNS" />
      <DataTable
        headers={["Domínio", "Registrador", "DNS", "Vencimento"]}
        widths={[30, 25, 25, 20]}
        rows={dom.map(d => [d.domain, d.registrar, d.dns_provider, formatDate(d.expiry_date as string)])}
      />
    </View>
  );
}

function Section10({ data }: { data: DocPdfData }) {
  const count = data.credentialsCount ?? 0;
  if (count === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="10" title="Credenciais de Acesso" />
      <View style={s.infoBox}>
        <Text style={s.infoText}>{count} credencial(is) cadastrada(s) (omitidas por segurança).</Text>
      </View>
    </View>
  );
}

function Section11({ data }: { data: DocPdfData }) {
  const contacts = data.contacts ?? [];
  const sh = data.supportHours;
  if (contacts.length === 0 && !sh) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="11" title="Contatos e Horários de Suporte" />
      {contacts.length > 0 && (
        <DataTable
          headers={["Nome", "Cargo", "Telefone", "E-mail", "Emergência"]}
          widths={[25, 20, 20, 25, 10]}
          rows={contacts.map(c => [c.name, c.role, c.phone, c.email, (c.is_emergency ? "Sim" : "Não")])}
        />
      )}
      {sh && (
        <>
          <Text style={s.subsectionTitle}>SLA e Horários</Text>
          <Field label="Horário Comercial" value={sh.business_hours} />
          <Field label="SLA Normal" value={sh.sla_normal} />
          <Field label="SLA Crítico" value={sh.sla_critical} />
          <Field label="Plantão" value={sh.has_oncall ? `Sim — ${v(sh.oncall_phone)}` : "Não"} />
        </>
      )}
    </View>
  );
}

function Section12({ data }: { data: DocPdfData }) {
  const vlans = data.vlans ?? [];
  const policies = data.accessPolicies ?? [];
  if (vlans.length === 0 && policies.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="12" title="Segurança e Políticas de Rede" />
      {vlans.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>VLANs</Text>
          <DataTable
            headers={["ID", "Nome", "Faixa IP", "Gateway", "Finalidade"]}
            widths={[10, 20, 25, 20, 25]}
            rows={vlans.map(vl => [vl.vlan_id, vl.name, vl.ip_range, vl.gateway, vl.purpose])}
          />
        </>
      )}
      {policies.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Políticas de Acesso</Text>
          <DataTable
            headers={["Tipo", "Alvo", "Grupo", "Motivo"]}
            widths={[20, 25, 25, 30]}
            rows={policies.map(p => [p.policy_type, p.target, p.affected_group, p.reason])}
          />
        </>
      )}
      <View style={s.infoBox}>
        <Text style={s.infoText}>Regras de firewall detalhadas omitidas por segurança.</Text>
      </View>
    </View>
  );
}

function Section13({ data }: { data: DocPdfData }) {
  const prov = data.externalProviders ?? [];
  if (prov.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="13" title="Prestadores Externos" />
      <DataTable
        headers={["Empresa", "Serviço", "Contato", "Telefone", "Vencimento"]}
        widths={[25, 20, 20, 15, 20]}
        rows={prov.map(p => [p.company_name, p.service_type, p.contact_name, p.contact_phone, formatDate(p.contract_expiry as string)])}
      />
    </View>
  );
}

function Section14({ data }: { data: DocPdfData }) {
  const rot = data.routines ?? [];
  if (rot.length === 0) return null;
  return (
    <View style={s.mb16}>
      <SectionHeader number="14" title="Rotinas e Procedimentos" />
      <DataTable
        headers={["Rotina", "Frequência", "Responsável", "Última Exec."]}
        widths={[30, 20, 25, 25]}
        rows={rot.map(r => [r.name, r.frequency, r.responsible, formatDate(r.last_executed as string)])}
      />
      {rot.filter(r => r.procedure).map((r, i) => (
        <View key={i} style={s.mb8}>
          <Text style={[s.fieldLabel, { marginBottom: 2 }]}>{v(r.name)} — Procedimento:</Text>
          <Text style={s.tableCell}>{v(r.procedure)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main Document ──────────────────────────────────
export function DocPdfDocument({ data }: { data: DocPdfData }) {
  const clientName = data.client.trade_name || data.client.name;
  const currentSection = "Documentação Técnica";

  return (
    <Document
      title={`Documentação Técnica — ${clientName}`}
      author="Colmeia — Central de Atendimento MSP"
      subject="Documentação Técnica de TI"
    >
      <CoverPage data={data} />
      <Page size="A4" style={s.page} wrap>
        <HeaderFooter sectionName={currentSection} clientName={clientName} />
        <Section1 data={data} />
        <Section2 data={data} />
        <Section3 data={data} />
        <Section4 data={data} />
        <Section5 data={data} />
        <Section6 data={data} />
        <Section7 data={data} />
        <Section8 data={data} />
        <Section9 data={data} />
        <Section10 data={data} />
        <Section11 data={data} />
        <Section12 data={data} />
        <Section13 data={data} />
        <Section14 data={data} />
      </Page>
    </Document>
  );
}
