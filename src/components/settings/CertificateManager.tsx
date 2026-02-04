import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Upload,
  Trash2,
  Star,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  FileKey,
  Building2,
  Calendar,
  Lock,
} from "lucide-react";

interface CertificateManagerProps {
  companyId: string | null;
}

interface Certificate {
  id: string;
  company_id: string;
  nome: string;
  tipo: string;
  arquivo_url: string | null;
  validade: string | null;
  titular: string | null;
  emissor: string | null;
  numero_serie: string | null;
  is_primary: boolean;
  uploaded_at: string | null;
  created_at: string;
  descricao: string | null;
}

interface CertificateInfo {
  validFrom: string;
  validTo: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

type CertificateStatus = "valid" | "expiring" | "expired" | "not_configured";

const getCertificateStatus = (validade: string | null): CertificateStatus => {
  if (!validade) return "not_configured";
  const expiryDate = new Date(validade);
  const today = new Date();
  const daysUntilExpiry = differenceInDays(expiryDate, today);
  
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 15) return "expiring";
  return "valid";
};

const getDaysRemaining = (validade: string | null): number | null => {
  if (!validade) return null;
  const expiryDate = new Date(validade);
  const today = new Date();
  return differenceInDays(expiryDate, today);
};

const statusConfig = {
  valid: {
    label: "Válido",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle2,
  },
  expiring: {
    label: "Expirando",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: AlertTriangle,
  },
  expired: {
    label: "Expirado",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  not_configured: {
    label: "Não Configurado",
    color: "bg-muted text-muted-foreground",
    icon: FileKey,
  },
};

export function CertificateManager({ companyId }: CertificateManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [certificateName, setCertificateName] = useState("");
  const [certificateDescription, setCertificateDescription] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [certificateInfo, setCertificateInfo] = useState<CertificateInfo | null>(null);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<Certificate | null>(null);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);

  // Fetch certificates
  const { data: certificates, isLoading } = useQuery({
    queryKey: ["certificates", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("certificates")
        .select("id, nome, tipo, validade, is_primary, titular, emissor, numero_serie, arquivo_url, company_id, uploaded_at, descricao, created_at, updated_at")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!companyId,
  });

  // Set as primary mutation
  const setPrimaryMutation = useMutation({
    mutationFn: async (certificateId: string) => {
      const { error } = await supabase
        .from("certificates")
        .update({ is_primary: true })
        .eq("id", certificateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      toast.success("Certificado definido como principal");
    },
    onError: (error) => {
      logger.error("Error setting primary", "Certificates", { error: String(error) });
      toast.error("Erro ao definir certificado principal");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (certificate: Certificate) => {
      // Delete from storage if exists
      if (certificate.arquivo_url) {
        const path = certificate.arquivo_url.replace("certificates/", "");
        await supabase.storage.from("certificates").remove([path]);
      }
      
      // Delete from database
      const { error } = await supabase
        .from("certificates")
        .delete()
        .eq("id", certificate.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      toast.success("Certificado removido com sucesso");
      setDeleteDialogOpen(false);
      setCertificateToDelete(null);
    },
    onError: (error) => {
      logger.error("Error deleting certificate", "Certificates", { error: String(error) });
      toast.error("Erro ao remover certificado");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [".pfx", ".p12"];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(fileExtension)) {
      toast.error("Selecione um arquivo .pfx ou .p12");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 5MB");
      return;
    }

    setSelectedFile(file);
    setCertificateName(file.name.replace(/\.(pfx|p12)$/i, ""));
    setCertificateInfo(null);
    setPassword("");
    setDialogOpen(true);
  };

  const handleValidateCertificate = async () => {
    if (!selectedFile || !password) {
      toast.error("Informe a senha do certificado");
      return;
    }

    setValidating(true);
    try {
      // Convert file to Base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      // Call parse-certificate function
      const { data, error } = await supabase.functions.invoke("parse-certificate", {
        body: {
          certificateBase64: base64,
          password: password,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setCertificateInfo(data);
      // Automatically set the certificate name to the subject (company name)
      if (data.subject && !editingCertificate) {
        setCertificateName(data.subject);
      }
      
      if (data.isExpired) {
        toast.warning("Este certificado já expirou!");
      } else if (data.isExpiringSoon) {
        toast.warning(`Este certificado expira em ${data.daysRemaining} dias`);
      }
    } catch (error) {
      logger.error("Validation error", "Certificates", { error: String(error) });
      toast.error("Erro ao validar certificado");
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !certificateInfo || !companyId) return;

    setUploading(true);
    try {
      // Encrypt the password server-side before storing
      const { data: encryptResult, error: encryptError } = await supabase.functions.invoke(
        "certificate-vault",
        {
          body: { action: "encrypt", password },
        }
      );

      if (encryptError || !encryptResult?.encrypted_password) {
        logger.error("Failed to encrypt password", "Certificates", { error: String(encryptError) });
        toast.error("Erro ao proteger a senha do certificado");
        return;
      }

      // Upload file to storage
      const fileName = `${companyId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("certificates")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // If editing, delete old file
      if (editingCertificate?.arquivo_url) {
        const oldPath = editingCertificate.arquivo_url.replace("certificates/", "");
        await supabase.storage.from("certificates").remove([oldPath]);
      }

      // Save to database with encrypted password
      const certificateData = {
        company_id: companyId,
        nome: certificateName || certificateInfo.subject || "Certificado Digital",
        tipo: "A1",
        arquivo_url: `certificates/${fileName}`,
        senha_hash: encryptResult.encrypted_password, // Now encrypted!
        validade: certificateInfo.validTo.split("T")[0],
        titular: certificateInfo.subject,
        emissor: certificateInfo.issuer,
        numero_serie: certificateInfo.serialNumber,
        is_primary: isPrimary || (certificates?.length === 0),
        uploaded_at: new Date().toISOString(),
        descricao: certificateDescription || null,
      };

      if (editingCertificate) {
        const { error } = await supabase
          .from("certificates")
          .update(certificateData)
          .eq("id", editingCertificate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("certificates")
          .insert(certificateData);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      toast.success(editingCertificate ? "Certificado atualizado com sucesso" : "Certificado adicionado com sucesso");
      
      // Reset state
      setDialogOpen(false);
      setSelectedFile(null);
      setPassword("");
      setCertificateName("");
      setCertificateDescription("");
      setIsPrimary(false);
      setCertificateInfo(null);
      setEditingCertificate(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      logger.error("Upload error", "Certificates", { error: String(error) });
      toast.error("Erro ao salvar certificado");
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = (certificate: Certificate) => {
    setEditingCertificate(certificate);
    setCertificateName(certificate.nome);
    setCertificateDescription(certificate.descricao || "");
    setIsPrimary(certificate.is_primary);
    fileInputRef.current?.click();
  };

  const handleDelete = (certificate: Certificate) => {
    setCertificateToDelete(certificate);
    setDeleteDialogOpen(true);
  };

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Certificados Digitais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Salve as configurações da empresa primeiro para gerenciar certificados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Certificados Digitais
              </CardTitle>
              <CardDescription>
                Gerencie os certificados digitais A1 para emissão de NFS-e
              </CardDescription>
            </div>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Certificado
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pfx,.p12"
            className="hidden"
            onChange={handleFileSelect}
          />

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : certificates && certificates.length > 0 ? (
            <div className="space-y-3">
              {certificates.map((cert) => {
                const status = getCertificateStatus(cert.validade);
                const config = statusConfig[status];
                const StatusIcon = config.icon;
                const daysRemaining = getDaysRemaining(cert.validade);

                return (
                  <div
                    key={cert.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {cert.is_primary && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                        <span className="font-medium">{cert.nome}</span>
                        <Badge variant="outline" className={config.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        {!cert.is_primary && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPrimaryMutation.mutate(cert.id)}
                            disabled={setPrimaryMutation.isPending}
                          >
                            <Star className="h-4 w-4 mr-1" />
                            Definir Principal
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReplace(cert)}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Substituir
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(cert)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {cert.descricao && (
                      <p className="text-sm text-muted-foreground italic">
                        {cert.descricao}
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate">{cert.titular || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        <span className="truncate">{cert.emissor || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {cert.validade
                            ? `Válido até ${format(new Date(cert.validade), "dd/MM/yyyy", { locale: ptBR })}`
                            : "—"}
                          {daysRemaining !== null && (
                            <span className="ml-1">
                              ({daysRemaining > 0 ? `${daysRemaining} dias` : "expirado"})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileKey className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum certificado digital cadastrado</p>
              <p className="text-sm mt-1">
                Adicione um certificado A1 para emitir NFS-e
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCertificate ? "Substituir Certificado" : "Adicionar Certificado Digital"}
            </DialogTitle>
            <DialogDescription>
              {certificateInfo
                ? "Confirme os dados do certificado"
                : "Informe a senha do certificado para validação"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!certificateInfo ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cert-password">Senha do Certificado *</Label>
                  <Input
                    id="cert-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite a senha do certificado"
                  />
                  <p className="text-xs text-muted-foreground">
                    O nome será preenchido automaticamente após validação
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cert-description">Descrição / Tag (opcional)</Label>
                  <Input
                    id="cert-description"
                    value={certificateDescription}
                    onChange={(e) => setCertificateDescription(e.target.value)}
                    placeholder="Ex: Certificado principal, Backup, Filial SP..."
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is-primary"
                    checked={isPrimary}
                    onCheckedChange={(checked) => setIsPrimary(checked as boolean)}
                  />
                  <Label htmlFor="is-primary" className="text-sm font-normal">
                    Definir como certificado principal
                  </Label>
                </div>
              </>
            ) : (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {certificateInfo.isExpired ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : certificateInfo.isExpiringSoon ? (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  <span className="font-medium">
                    {certificateInfo.isExpired
                      ? "Certificado Expirado"
                      : certificateInfo.isExpiringSoon
                      ? "Certificado Expirando"
                      : "Certificado Válido"}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Titular:</span>
                    <span className="font-medium truncate max-w-[200px]">
                      {certificateInfo.subject}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Emissor:</span>
                    <span className="font-medium truncate max-w-[200px]">
                      {certificateInfo.issuer}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Válido até:</span>
                    <span className="font-medium">
                      {format(new Date(certificateInfo.validTo), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dias restantes:</span>
                    <span className={`font-medium ${
                      certificateInfo.isExpired
                        ? "text-destructive"
                        : certificateInfo.isExpiringSoon
                        ? "text-yellow-600"
                        : "text-green-600"
                    }`}>
                      {certificateInfo.daysRemaining > 0
                        ? `${certificateInfo.daysRemaining} dias`
                        : "Expirado"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setSelectedFile(null);
                setPassword("");
                setCertificateName("");
                setCertificateDescription("");
                setIsPrimary(false);
                setCertificateInfo(null);
                setEditingCertificate(null);
              }}
            >
              Cancelar
            </Button>
            {!certificateInfo ? (
              <Button onClick={handleValidateCertificate} disabled={validating || !password}>
                {validating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Validar Certificado
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleUpload} disabled={uploading || certificateInfo.isExpired}>
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Confirmar Upload
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Certificado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o certificado "{certificateToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => certificateToDelete && deleteMutation.mutate(certificateToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
