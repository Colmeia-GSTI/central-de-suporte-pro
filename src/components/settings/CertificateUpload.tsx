import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileKey,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CertificateUploadProps {
  certificadoValidade?: string | null;
  certificadoArquivoUrl?: string | null;
  certificadoUploadedAt?: string | null;
  onUploadSuccess: () => void;
  companyId: string | null;
}

export function CertificateUpload({
  certificadoValidade,
  certificadoArquivoUrl,
  certificadoUploadedAt,
  onUploadSuccess,
  companyId,
}: CertificateUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCertificate = !!certificadoArquivoUrl;

  const isExpired = certificadoValidade
    ? new Date(certificadoValidade) < new Date()
    : false;

  const isExpiringSoon = certificadoValidade
    ? new Date(certificadoValidade) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : false;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pfx") && !file.name.endsWith(".p12")) {
      toast.error("Arquivo inválido", {
        description: "Selecione um arquivo de certificado .pfx ou .p12",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande", {
        description: "O certificado não pode ter mais de 10MB",
      });
      return;
    }

    setSelectedFile(file);
    setDialogOpen(true);
  };

  const handleUpload = async () => {
    if (!selectedFile || !password || !companyId) {
      toast.error("Preencha a senha do certificado");
      return;
    }

    setUploading(true);
    try {
      // Upload certificate file
      const filename = `cert_${companyId}_${Date.now()}.pfx`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("certificates")
        .upload(filename, selectedFile, { upsert: true });

      if (uploadError) throw uploadError;

      // Update company settings with certificate info
      const { error: updateError } = await supabase
        .from("company_settings")
        .update({
          certificado_arquivo_url: `certificates/${uploadData.path}`,
          certificado_senha_hash: password, // In production, encrypt this
          certificado_uploaded_at: new Date().toISOString(),
        })
        .eq("id", companyId);

      if (updateError) throw updateError;

      toast.success("Certificado carregado com sucesso!");
      setDialogOpen(false);
      setPassword("");
      setSelectedFile(null);
      onUploadSuccess();
    } catch (error: any) {
      console.error("Erro ao carregar certificado:", error);
      toast.error("Erro ao carregar certificado", {
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId || !certificadoArquivoUrl) return;

    setDeleting(true);
    try {
      // Delete from storage
      const path = certificadoArquivoUrl.replace("certificates/", "");
      await supabase.storage.from("certificates").remove([path]);

      // Clear from company settings
      const { error } = await supabase
        .from("company_settings")
        .update({
          certificado_arquivo_url: null,
          certificado_senha_hash: null,
          certificado_uploaded_at: null,
        })
        .eq("id", companyId);

      if (error) throw error;

      toast.success("Certificado removido");
      onUploadSuccess();
    } catch (error: any) {
      toast.error("Erro ao remover certificado", { description: error.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Certificado Digital A1
        </CardTitle>
        <CardDescription>
          Certificado ICP-Brasil para assinatura de NFS-e
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCertificate ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
              <FileKey className="h-10 w-10 text-primary" />
              <div className="flex-1">
                <p className="font-medium flex items-center gap-2">
                  Certificado A1 instalado
                  {isExpired ? (
                    <Badge variant="destructive">Expirado</Badge>
                  ) : isExpiringSoon ? (
                    <Badge className="bg-status-warning text-white">Expira em breve</Badge>
                  ) : (
                    <Badge className="bg-status-success text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Válido
                    </Badge>
                  )}
                </p>
                {certificadoUploadedAt && (
                  <p className="text-sm text-muted-foreground">
                    Carregado em{" "}
                    {format(new Date(certificadoUploadedAt), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                )}
                {certificadoValidade && (
                  <p className="text-sm text-muted-foreground">
                    Válido até{" "}
                    {format(new Date(certificadoValidade), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </p>
                )}
              </div>
            </div>

            {isExpired && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O certificado expirou. Carregue um novo certificado para continuar emitindo NFS-e.
                </AlertDescription>
              </Alert>
            )}

            {isExpiringSoon && !isExpired && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O certificado expira em menos de 30 dias. Considere renová-lo em breve.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Substituir Certificado
                  </Button>
                </DialogTrigger>
              </Dialog>

              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Remover
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Nenhum certificado digital instalado. Carregue seu certificado A1 (.pfx) para
                habilitar a emissão automática de NFS-e.
              </AlertDescription>
            </Alert>

            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Carregar Certificado A1
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pfx,.p12"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Password Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Senha do Certificado
              </DialogTitle>
              <DialogDescription>
                Insira a senha do certificado digital para validá-lo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedFile && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  <FileKey className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cert-password">Senha do Certificado</Label>
                <Input
                  id="cert-password"
                  type="password"
                  placeholder="Digite a senha do certificado"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !password}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Carregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
