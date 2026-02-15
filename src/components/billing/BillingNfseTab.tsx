import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  FileCode,
  FileSearch,
  FileText,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { formatCurrencyBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/utils";
import { NfseAvulsaDialog } from "@/components/billing/nfse/NfseAvulsaDialog";
import { NfseDetailsSheet, type NfseWithRelations } from "@/components/billing/nfse/NfseDetailsSheet";
import { NfseShareMenu } from "@/components/billing/nfse/NfseShareMenu";
import { NfseEventLogsDialog } from "@/components/billing/nfse/NfseEventLogsDialog";
import {
  formatCompetenciaLabel,
  formatDateTime,
  formatElapsedTime,
  formatNfseErrorMessage,
  statusLabel,
  type NfseStatus,
  ASAAS_STATUS_LABELS,
} from "@/components/billing/nfse/nfseFormat";
import { NfseLinkExternalDialog } from "@/components/billing/nfse/NfseLinkExternalDialog";
import { NfseProcessingStatusCell } from "@/components/billing/nfse/NfseProcessingIndicator";

const ITEMS_PER_PAGE = 15;

function statusBadge(status: NfseStatus, nfse?: NfseWithRelations) {
  const base = "text-white";
  const isProcessing = status === "processando";
  
  const badge = (() => {
    switch (status) {
      case "autorizada":
        return <Badge className={`bg-status-success ${base}`}>{statusLabel(status)}</Badge>;
      case "processando":
        return <Badge className={`bg-blue-600 ${base}`}>{statusLabel(status)}</Badge>;
      case "pendente":
        return <Badge className={`bg-status-warning ${base}`}>{statusLabel(status)}</Badge>;
      case "rejeitada":
        return <Badge className={`bg-status-danger ${base}`}>{statusLabel(status)}</Badge>;
      case "erro":
        return <Badge className={`bg-red-700 ${base}`}>{statusLabel(status)}</Badge>;
      case "cancelada":
        return <Badge variant="secondary">{statusLabel(status)}</Badge>;
      case "substituida":
        return <Badge className={`bg-orange-600 ${base}`}>{statusLabel(status)}</Badge>;
      default:
        return <Badge variant="outline">{statusLabel(status)}</Badge>;
    }
  })();
  
  if (isProcessing && nfse) {
    return (
      <div className="flex flex-col gap-1">
        {badge}
        <NfseProcessingStatusCell nfse={{
          id: nfse.id,
          asaas_invoice_id: nfse.asaas_invoice_id,
          asaas_status: nfse.asaas_status,
          created_at: nfse.created_at,
          data_emissao: nfse.data_emissao,
          ambiente: nfse.ambiente,
          status: nfse.status,
        }} />
      </div>
    );
  }
  
  return badge;
}

async function openUrlOrSigned(url: string) {
  if (url.startsWith("nfse-files/")) {
    const path = url.replace("nfse-files/", "");
    const { data, error } = await supabase.storage.from("nfse-files").createSignedUrl(path, 60);
    if (error) throw error;
    window.open(data.signedUrl, "_blank");
    return;
  }
  window.open(url, "_blank");
}

export function BillingNfseTab() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"notas" | "relatorios" | "ajuda">("notas");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [competenciaFilter, setCompetenciaFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<NfseWithRelations | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [linkExternalNfse, setLinkExternalNfse] = useState<NfseWithRelations | null>(null);

  const currentYear = new Date().getFullYear();
  const [reportYear, setReportYear] = useState(String(currentYear));

  const competenciaOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const value = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy", { locale: ptBR });
      return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, []);

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear]
  );

  const { data: company } = useQuery({
    queryKey: ["nfse-company-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, cnpj, inscricao_municipal, endereco_codigo_ibge, nfse_ambiente")
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const { data: primaryCertificate } = useQuery({
    queryKey: ["nfse-primary-certificate-health", company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from("certificates")
        .select("id, nome, validade, titular")
        .eq("company_id", company.id)
        .eq("is_primary", true)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!company?.id,
  });

  const { data: nfseData, isLoading } = useQuery({
    queryKey: ["nfse-history", search, statusFilter, competenciaFilter, page],
    queryFn: async () => {
      let q = supabase
        .from("nfse_history")
        .select("*, clients(name, document, email, financial_email, whatsapp), contracts(name)", { count: "exact" })
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (competenciaFilter !== "all") q = q.eq("competencia", competenciaFilter);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`numero_nfse.ilike.%${s}%,chave_acesso.ilike.%${s}%`);
      }

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { items: (data ?? []) as NfseWithRelations[], total: count ?? 0 };
    },
    enabled: tab === "notas",
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["nfse-report", reportYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_history")
        .select("id, competencia, status, valor_servico, valor_iss")
        .gte("competencia", `${reportYear}-01`)
        .lte("competencia", `${reportYear}-12`)
        .order("competencia", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pick<
        Tables<"nfse_history">,
        "id" | "competencia" | "status" | "valor_servico" | "valor_iss"
      >[];
    },
    enabled: tab === "relatorios",
  });

  const nfseList = nfseData?.items ?? [];
  const totalItems = nfseData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  const statsForPage = useMemo(() => {
    const total = nfseList.length;
    const pendentes = nfseList.filter((n) => n.status === "pendente" || n.status === "processando").length;
    const autorizadas = nfseList.filter((n) => n.status === "autorizada").length;
    const comErro = nfseList.filter((n) => n.status === "rejeitada" || n.status === "erro").length;
    return { total, pendentes, autorizadas, comErro };
  }, [nfseList]);

  const reportSummary = useMemo(() => {
    const items = reportData ?? [];
    const total = items.length;
    const valorTotal = items.reduce((acc, i) => acc + (i.valor_servico ?? 0), 0);
    const issTotal = items.reduce((acc, i) => acc + (i.valor_iss ?? 0), 0);
    const autorizadas = items.filter((i) => i.status === "autorizada").length;
    const pendentes = items.filter((i) => i.status === "pendente" || i.status === "processando").length;
    const rejeitadas = items.filter((i) => i.status === "rejeitada" || i.status === "erro").length;
    return { total, valorTotal, issTotal, autorizadas, pendentes, rejeitadas };
  }, [reportData]);

  const monthlyReport = useMemo(() => {
    if (!reportData) return [];
    const months: Record<string, { ym: string; total: number; valor: number; iss: number }> = {};
    for (let m = 1; m <= 12; m++) {
      const ym = `${reportYear}-${String(m).padStart(2, "0")}`;
      months[ym] = { ym, total: 0, valor: 0, iss: 0 };
    }
    for (const row of reportData) {
      const ym = row.competencia?.slice(0, 7);
      if (!ym || !months[ym]) continue;
      months[ym].total += 1;
      months[ym].valor += row.valor_servico ?? 0;
      months[ym].iss += row.valor_iss ?? 0;
    }
    return Object.values(months);
  }, [reportData, reportYear]);

  const exportCsv = () => {
    if (!reportData) return;
    const headers = ["Competência", "Status", "Valor Serviço", "Valor ISS"];
    const rows = reportData.map((r) => [
      r.competencia,
      r.status,
      (r.valor_servico ?? 0).toFixed(2),
      (r.valor_iss ?? 0).toFixed(2),
    ]);
    const content = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfse_${reportYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-asaas-nfse-status");
      if (error) throw error;
      const result = data as { updated?: number; processed?: number; message?: string };
      if ((result.updated ?? 0) > 0) {
        toast.success("Status atualizado", { 
          description: `${result.updated} nota(s) atualizada(s)`,
          duration: 3000,
        });
      } else {
        toast.info("Verificação concluída", {
          description: result.message || `${result.processed ?? 0} nota(s) verificadas`,
          duration: 2000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro ao verificar status", { description: getErrorMessage(e) });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleQuickReprocess = async (nfse: NfseWithRelations) => {
    setReprocessingId(nfse.id);
    try {
      // Update local status to "processando"
      await supabase.from("nfse_history").update({ status: "processando" }).eq("id", nfse.id);

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit",
          nfse_history_id: nfse.id,
          invoice_id: nfse.invoice_id,
          client_id: nfse.client_id,
          contract_id: nfse.contract_id || undefined,
          value: nfse.valor_servico,
          service_description: nfse.descricao_servico,
          municipal_service_code: nfse.codigo_tributacao || undefined,
        },
      });
      if (error) throw error;
      toast.success("NFS-e reenviada para processamento");
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
    } catch (e: unknown) {
      toast.error("Erro ao reprocessar NFS-e", { description: getErrorMessage(e) });
    } finally {
      setReprocessingId(null);
    }
  };

  const health = useMemo(() => {
    const companyOk = !!company?.cnpj && !!company?.inscricao_municipal;
    const certOk =
      !!primaryCertificate?.validade && new Date(primaryCertificate.validade).getTime() > Date.now();
    const ambiente = company?.nfse_ambiente === "producao" ? "Produção" : "Homologação";
    return { companyOk, certOk, ambiente };
  }, [company, primaryCertificate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">NFS-e</h2>
          <p className="text-sm text-muted-foreground">Gestão de notas fiscais de serviço eletrônicas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAvulsaOpen(true)}>
            <Wand2 className="h-4 w-4 mr-2" />
            Emitir avulsa
          </Button>
          <Button variant="outline" onClick={handleCheckStatus} disabled={checkingStatus}>
            {checkingStatus ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSearch className="h-4 w-4 mr-2" />
            )}
            Verificar status
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
              queryClient.invalidateQueries({ queryKey: ["nfse-report"] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Configuração da empresa</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm">
              <p className="text-muted-foreground">CNPJ/IM</p>
              <p className="font-medium">{health.companyOk ? "OK" : "Pendente"}</p>
            </div>
            {health.companyOk ? (
              <ShieldCheck className="h-5 w-5 text-status-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-status-danger" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Certificado digital (A1)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm">
              <p className="text-muted-foreground">Principal</p>
              <p className="font-medium">
                {primaryCertificate?.nome ? primaryCertificate.nome : "Não configurado"}
              </p>
            </div>
            {health.certOk ? (
              <ShieldCheck className="h-5 w-5 text-status-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-status-warning" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ambiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.ambiente}</p>
            <p className="text-xs text-muted-foreground">Definido em Configurações → Empresa</p>
          </CardContent>
        </Card>
      </div>

      {!health.companyOk && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Para emitir NFS-e, configure CNPJ e Inscrição Municipal em <strong>Configurações → Empresa</strong>.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="ajuda">Regras e validações</TabsTrigger>
        </TabsList>

        <TabsContent value="notas" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Itens na página</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsForPage.total}</div>
                <p className="text-xs text-muted-foreground">Total no filtro: {totalItems}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Autorizadas (página)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-status-success">{statsForPage.autorizadas}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pendentes (página)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-status-warning">{statsForPage.pendentes}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Com erro (página)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-status-danger">{statsForPage.comErro}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por número ou chave de acesso..."
                className="pl-10"
              />
              <FileSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="processando">Processando</SelectItem>
                <SelectItem value="autorizada">Autorizada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
                <SelectItem value="erro">Erro</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="substituida">Substituída</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={competenciaFilter}
              onValueChange={(v) => {
                setCompetenciaFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Competência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as competências</SelectItem>
                {competenciaOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead className="text-right">Arquivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={idx}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : nfseList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      Nenhuma NFS-e encontrada para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  nfseList.map((n) => {
                    const hasError = (n.status === "erro" || n.status === "rejeitada") && n.mensagem_retorno;
                    const parsed = hasError ? formatNfseErrorMessage(n.mensagem_retorno) : null;
                    const isReprocessing = reprocessingId === n.id;

                    return (
                      <React.Fragment key={n.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => {
                            setSelected(n);
                            setDetailsOpen(true);
                          }}
                        >
                          <TableCell className="font-mono font-medium">{n.numero_nfse || "-"}</TableCell>
                          <TableCell>{n.clients?.name || "-"}</TableCell>
                          <TableCell>{n.contracts?.name || "-"}</TableCell>
                          <TableCell>{formatCompetenciaLabel(n.competencia)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyBRL(n.valor_servico)}</TableCell>
                          <TableCell>{statusBadge(n.status as NfseStatus, n)}</TableCell>
                          <TableCell>{formatDateTime(n.data_emissao)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <NfseEventLogsDialog
                                    nfseHistoryId={n.id}
                                    nfseNumber={n.numero_nfse}
                                    trigger={
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                      >
                                        <History className="h-4 w-4" />
                                      </Button>
                                    }
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Ver histórico de eventos</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Abrir XML"
                            disabled={!n.xml_url}
                            onClick={async () => {
                              if (!n.xml_url) return;
                              try {
                                await openUrlOrSigned(n.xml_url);
                              } catch (e: unknown) {
                                toast.error("Erro ao abrir XML", { description: getErrorMessage(e) });
                              }
                            }}
                          >
                            <FileCode className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Abrir PDF"
                            disabled={!n.pdf_url}
                            onClick={async () => {
                              if (!n.pdf_url) return;
                              try {
                                await openUrlOrSigned(n.pdf_url);
                              } catch (e: unknown) {
                                toast.error("Erro ao abrir PDF", { description: getErrorMessage(e) });
                              }
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <NfseShareMenu
                            nfse={{
                              id: n.id,
                              numero_nfse: n.numero_nfse,
                              pdf_url: n.pdf_url,
                              valor_servico: n.valor_servico ?? 0,
                              clients: n.clients ? {
                                name: n.clients.name,
                                email: (n.clients as { email?: string | null }).email ?? null,
                                whatsapp: (n.clients as { whatsapp?: string | null }).whatsapp ?? null,
                              } : null,
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>

                        {/* Inline error row */}
                        {hasError && parsed && (
                          <TableRow className="bg-destructive/5 hover:bg-destructive/10 border-b border-destructive/20">
                            <TableCell colSpan={8} className="py-2 px-4">
                              <div className="flex items-start gap-3">
                                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-destructive">{parsed.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">{parsed.description}</p>
                                  {parsed.action && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{parsed.action}</p>
                                  )}
                                </div>
                                <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelected(n);
                                      setDetailsOpen(true);
                                    }}
                                  >
                                    Editar e Corrigir
                                  </Button>
                                  {parsed.showLinkButton ? (
                                    <Button
                                      size="sm"
                                      onClick={() => setLinkExternalNfse(n)}
                                    >
                                      Vincular Nota
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => handleQuickReprocess(n)}
                                      disabled={isReprocessing}
                                    >
                                      {isReprocessing ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4 mr-1" />
                                      )}
                                      Reprocessar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (page <= 3) pageNum = i + 1;
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = page - 2 + i;

                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        isActive={page === pageNum}
                        onClick={() => setPage(pageNum)}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </TabsContent>

        <TabsContent value="relatorios" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Select value={reportYear} onValueChange={setReportYear}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={exportCsv} disabled={!reportData || reportLoading}>
              Exportar CSV
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{reportSummary.total}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Valor serviços</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrencyBRL(reportSummary.valorTotal)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">ISS</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? <Skeleton className="h-8 w-28" /> : <div className="text-2xl font-bold">{formatCurrencyBRL(reportSummary.issTotal)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Autorizadas</CardTitle>
              </CardHeader>
              <CardContent>
                {reportLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold text-status-success">{reportSummary.autorizadas}</div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Resumo por mês</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">ISS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    monthlyReport.map((m) => (
                      <TableRow key={m.ym}>
                        <TableCell>{formatCompetenciaLabel(m.ym)}</TableCell>
                        <TableCell className="text-right">{m.total}</TableCell>
                        <TableCell className="text-right">{formatCurrencyBRL(m.valor)}</TableCell>
                        <TableCell className="text-right">{formatCurrencyBRL(m.iss)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Observação: os dados acima refletem o campo <strong>competência</strong> (AAAA-MM) da NFS-e.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="ajuda" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Checklist antes de emitir / reenviar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Empresa</strong>: CNPJ, Inscrição Municipal e município (código IBGE) configurados.
                </li>
                <li>
                  <strong>Cliente</strong>: CNPJ/CPF válido, nome e endereço completos (evita rejeições).
                </li>
                <li>
                  <strong>Serviço</strong>: código (LC 116/2003) + CNAE + descrição detalhada (até 2000 caracteres).
                </li>
                <li>
                  <strong>Competência</strong>: formato <strong>AAAA-MM</strong> (sem dia) e sem datas futuras.
                </li>
                <li>
                  <strong>Certificado</strong>: A1 válido (quando usando API Nacional).
                </li>
              </ul>
            </CardContent>
          </Card>

          <Accordion type="single" collapsible>
            <AccordionItem value="passofundo">
              <AccordionTrigger>Particularidades municipais (Passo Fundo/RS)</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Em Passo Fundo/RS, a NFS-e é obrigatória para serviços sujeitos a ISSQN. Emissão imediata à prestação do serviço e recolhimento mensal.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>ISSQN: alíquota municipal (geralmente 2% a 5%).</li>
                  <li>Retenção na fonte pode ser exigida para serviços específicos.</li>
                  <li>Integração municipal pode ter regras de validação adicionais.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="processo">
              <AccordionTrigger>Processo de autorização e rejeições</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  A nota só é válida após autorização. Mesmo com validação preventiva no sistema, o portal pode rejeitar por schema/regras.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Ambientes: homologação (teste) e produção.</li>
                  <li>Contingência: se houver indisponibilidade do portal, siga procedimento do município/provedor.</li>
                  <li>Logs: use a mensagem de retorno para corrigir dados e reenviar.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="nfe">
              <AccordionTrigger>NF-e / CT-e / MDF-e (referências rápidas)</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Esta tela é de NFS-e (serviços), mas alguns conceitos se aplicam a documentos fiscais eletrônicos em geral.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Autorização eletrônica é condição de validade do documento.</li>
                  <li>Uso de certificado digital (A1/A3) para assinatura de XML.</li>
                  <li>Atualizações normativas são frequentes (ex.: Ajustes SINIEF para NF-e).</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>

      <NfseDetailsSheet
        nfse={selected}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelected(null);
        }}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
          queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
        }}
      />

      <NfseAvulsaDialog
        open={avulsaOpen}
        onOpenChange={(open) => {
          setAvulsaOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
            queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
          }
        }}
      />

      {linkExternalNfse && (
        <NfseLinkExternalDialog
          nfseId={linkExternalNfse.id}
          open={!!linkExternalNfse}
          onOpenChange={(open) => {
            if (!open) {
              setLinkExternalNfse(null);
              queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
            }
          }}
        />
      )}
    </div>
  );
}
