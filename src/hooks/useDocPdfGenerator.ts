import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DocPdfData } from "@/components/clients/documentation/DocPdfExport";

async function fetchTable(table: string, clientId: string) {
  const { data, error } = await (supabase.from(table) as any)
    .select("*")
    .eq("client_id", clientId);
  if (error) {
    console.error(`[useDocPdfGenerator] Error fetching ${table}:`, error);
    return [];
  }
  return data ?? [];
}

async function fetchSingle(table: string, clientId: string) {
  const { data, error } = await (supabase.from(table) as any)
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    console.error(`[useDocPdfGenerator] Error fetching ${table}:`, error);
    return null;
  }
  return data;
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

export function useDocPdfGenerator(clientId: string) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePdf = useCallback(async () => {
    setIsGenerating(true);
    try {
      // Fetch all data in parallel
      const [
        clientResult,
        infrastructure,
        telephony,
        supportHours,
        internetLinks,
        devices,
        cftv,
        licenses,
        softwareErp,
        domains,
        credentials,
        contacts,
        vlans,
        accessPolicies,
        externalProviders,
        routines,
      ] = await Promise.all([
        supabase.from("clients").select("name, trade_name, document, email, phone, address, city, state, zip_code").eq("id", clientId).single(),
        fetchSingle("doc_infrastructure", clientId),
        fetchSingle("doc_telephony", clientId),
        fetchSingle("doc_support_hours", clientId),
        fetchTable("doc_internet_links", clientId),
        supabase.from("doc_devices").select("id, name, device_type, brand_model, serial_number, os, cpu, ram, disks, ip_local, mac_address, firmware, status, last_seen, primary_user, physical_location, trmm_agent_id, unifi_device_id, data_source").eq("client_id", clientId).then(r => r.data ?? []),
        fetchTable("doc_cftv", clientId),
        fetchTable("doc_licenses", clientId),
        fetchTable("doc_software_erp", clientId),
        fetchTable("doc_domains", clientId),
        fetchTable("doc_credentials", clientId),
        fetchTable("doc_contacts", clientId),
        fetchTable("doc_vlans", clientId),
        fetchTable("doc_access_policies", clientId),
        fetchTable("doc_external_providers", clientId),
        fetchTable("doc_routines", clientId),
      ]);

      if (clientResult.error || !clientResult.data) {
        throw new Error("Não foi possível carregar dados do cliente");
      }

      const client = clientResult.data;

      // Separate workstations/servers from network devices
      const networkTypes = ["switch", "ap", "access point", "roteador", "router", "firewall", "gateway", "modem", "udm", "usg", "usw", "uap"];
      const networkDevices = devices.filter((d: Record<string, unknown>) => {
        const dt = String(d.device_type ?? "").toLowerCase();
        return networkTypes.some(t => dt.includes(t));
      });

      const pdfData: DocPdfData = {
        client,
        infrastructure,
        telephony,
        internetLinks,
        devices,
        networkDevices,
        cftv,
        licenses,
        softwareErp,
        domains,
        credentialsCount: credentials.length,
        contacts,
        supportHours,
        vlans,
        firewallRules: [],
        accessPolicies,
        externalProviders,
        routines,
      };

      // Dynamic import to avoid loading the heavy PDF library until needed
      const [{ pdf }, { DocPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/clients/documentation/DocPdfExport"),
      ]);

      const blob = await pdf(DocPdfDocument({ data: pdfData })).toBlob();

      // Download
      const clientName = sanitizeFilename(client.trade_name || client.name);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `Documentacao_TI_${clientName}_${dateStr}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("PDF gerado com sucesso");
    } catch (error) {
      console.error("[useDocPdfGenerator] Error:", error);
      toast.error("Erro ao gerar PDF. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  }, [clientId]);

  return { generatePdf, isGenerating };
}
