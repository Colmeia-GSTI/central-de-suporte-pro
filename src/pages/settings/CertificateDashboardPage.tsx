import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Calendar,
  Clock,
  Upload,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { format, differenceInDays, isPast, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface CompanyWithCertificate {
  id: string;
  razao_social: string;
  cnpj: string;
  certificado_validade: string | null;
  certificado_arquivo_url: string | null;
  certificado_uploaded_at: string | null;
  certificado_tipo: string | null;
}

type CertificateStatus = "valid" | "expiring" | "expired" | "not_configured";

function getCertificateStatus(validade: string | null): CertificateStatus {
  if (!validade) return "not_configured";
  
  const expiryDate = new Date(validade);
  const today = new Date();
  const daysRemaining = differenceInDays(expiryDate, today);
  
  if (isPast(expiryDate)) return "expired";
  if (daysRemaining <= 30) return "expiring";
  return "valid";
}

function getDaysRemaining(validade: string | null): number | null {
  if (!validade) return null;
  return differenceInDays(new Date(validade), new Date());
}

const statusConfig = {
  valid: {
    label: "Válido",
    color: "bg-status-success text-white",
    icon: ShieldCheck,
    iconColor: "text-status-success",
  },
  expiring: {
    label: "Expirando",
    color: "bg-status-warning text-white",
    icon: ShieldAlert,
    iconColor: "text-status-warning",
  },
  expired: {
    label: "Expirado",
    color: "bg-status-danger text-white",
    icon: ShieldX,
    iconColor: "text-status-danger",
  },
  not_configured: {
    label: "Não Configurado",
    color: "bg-muted text-muted-foreground",
    icon: Shield,
    iconColor: "text-muted-foreground",
  },
};

export default function CertificateDashboardPage() {
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["certificate-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, razao_social, cnpj, certificado_validade, certificado_arquivo_url, certificado_uploaded_at, certificado_tipo")
        .order("razao_social");
      
      if (error) throw error;
      return data as CompanyWithCertificate[];
    },
  });

  // Calculate stats
  const stats = companies.reduce(
    (acc, company) => {
      const status = getCertificateStatus(company.certificado_validade);
      acc[status]++;
      acc.total++;
      return acc;
    },
    { valid: 0, expiring: 0, expired: 0, not_configured: 0, total: 0 }
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Certificados Digitais</h1>
            <p className="text-muted-foreground">
              Acompanhamento de validade e alertas de vencimento
            </p>
          </div>
          <Link to="/settings">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats.total}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Válidos</CardTitle>
              <ShieldCheck className="h-4 w-4 text-status-success" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-status-success">{stats.valid}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expirando (30 dias)</CardTitle>
              <ShieldAlert className="h-4 w-4 text-status-warning" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-status-warning">{stats.expiring}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expirados</CardTitle>
              <ShieldX className="h-4 w-4 text-status-danger" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-status-danger">{stats.expired}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        {!isLoading && (stats.expiring > 0 || stats.expired > 0) && (
          <Card className="border-status-warning/50 bg-status-warning/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-status-warning" />
                <CardTitle className="text-lg">Atenção Necessária</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.expired > 0 && (
                  <div className="flex items-center gap-2 text-status-danger">
                    <XCircle className="h-4 w-4" />
                    <span>{stats.expired} certificado(s) expirado(s) - renovação imediata necessária</span>
                  </div>
                )}
                {stats.expiring > 0 && (
                  <div className="flex items-center gap-2 text-status-warning">
                    <Clock className="h-4 w-4" />
                    <span>{stats.expiring} certificado(s) expirando nos próximos 30 dias</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certificates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Certificados Cadastrados</CardTitle>
            <CardDescription>
              Lista de todos os certificados digitais configurados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Dias Restantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Upload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="mt-2 text-muted-foreground">
                        Nenhum certificado configurado
                      </p>
                      <Link to="/settings" className="mt-4 inline-block">
                        <Button variant="outline" size="sm">
                          <Upload className="mr-2 h-4 w-4" />
                          Configurar Certificado
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ) : (
                  companies.map((company) => {
                    const status = getCertificateStatus(company.certificado_validade);
                    const daysRemaining = getDaysRemaining(company.certificado_validade);
                    const config = statusConfig[status];
                    const StatusIcon = config.icon;

                    return (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">
                          {company.razao_social || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {company.cnpj || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {company.certificado_tipo || "A1"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {company.certificado_validade ? (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {format(new Date(company.certificado_validade), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {daysRemaining !== null ? (
                            <div className={`flex items-center gap-1.5 ${
                              daysRemaining <= 0 ? "text-status-danger" :
                              daysRemaining <= 30 ? "text-status-warning" :
                              "text-muted-foreground"
                            }`}>
                              <Clock className="h-3.5 w-3.5" />
                              {daysRemaining <= 0 ? "Expirado" : `${daysRemaining} dias`}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={config.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {company.certificado_uploaded_at ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(company.certificado_uploaded_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sobre Alertas Automáticos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-status-success" />
                <span>O sistema verifica diariamente a validade dos certificados cadastrados</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-status-warning" />
                <span>Notificações são enviadas 30, 15 e 7 dias antes do vencimento</span>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 text-status-danger" />
                <span>Alertas críticos são enviados quando o certificado expira</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
