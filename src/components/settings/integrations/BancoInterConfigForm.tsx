import { useState, useEffect, useRef } from "react";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Building2, 
  Loader2, 
  Save, 
  TestTube, 
  Check, 
  X, 
  ExternalLink, 
  Upload, 
  FileKey,
  ShieldCheck,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface InterSettings {
  client_id: string;
  client_secret: string;
  pix_key: string;
  certificate_crt: string;
  certificate_key: string;
  environment: "sandbox" | "production";
}

const defaultSettings: InterSettings = {
  client_id: "",
  client_secret: "",
  pix_key: "",
  certificate_crt: "",
  certificate_key: "",
  // Sandbox do Banco Inter pode não estar acessível no ambiente de execução.
  // Por padrão, iniciamos em produção para evitar erro de DNS ao testar.
  environment: "production",
};

interface ScopeStatus {
  boleto: "unknown" | "checking" | "ok" | "error";
  pix: "unknown" | "checking" | "ok" | "error";
  boletoError?: string;
  pixError?: string;
}

export function BancoInterConfigForm() {
  const [settings, setSettings] = useState<InterSettings>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploadingCrt, setUploadingCrt] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(false);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>({
    boleto: "unknown",
    pix: "unknown",
  });
  
  const crtInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "banco_inter")
      .maybeSingle();

    if (data) {
      // Handle legacy settings with certificate_base64
      const loadedSettings = data.settings as unknown as InterSettings & { certificate_base64?: string };
      setSettings({ 
        ...defaultSettings, 
        ...loadedSettings,
        certificate_crt: loadedSettings.certificate_crt || "",
        certificate_key: loadedSettings.certificate_key || "",
      });
      setIsActive(data.is_active);
    } else {
      // Para novo cadastro, iniciar como ativo por padrão
      setIsActive(true);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleCrtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".crt") && !file.name.endsWith(".pem")) {
      toast.error("Arquivo inválido", { 
        description: "Por favor, selecione um arquivo .crt ou .pem" 
      });
      return;
    }

    setUploadingCrt(true);
    try {
      const base64 = await readFileAsBase64(file);
      setSettings({ ...settings, certificate_crt: base64 });
      toast.success("Certificado carregado!", { description: file.name });
    } catch (error) {
      toast.error("Erro ao ler o arquivo");
    } finally {
      setUploadingCrt(false);
      if (crtInputRef.current) crtInputRef.current.value = "";
    }
  };

  const handleKeyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".key") && !file.name.endsWith(".pem")) {
      toast.error("Arquivo inválido", { 
        description: "Por favor, selecione um arquivo .key ou .pem" 
      });
      return;
    }

    setUploadingKey(true);
    try {
      const base64 = await readFileAsBase64(file);
      setSettings({ ...settings, certificate_key: base64 });
      toast.success("Chave privada carregada!", { description: file.name });
    } catch (error) {
      toast.error("Erro ao ler o arquivo");
    } finally {
      setUploadingKey(false);
      if (keyInputRef.current) keyInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "banco_inter")
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from("integration_settings")
          .update({
            settings: settings as unknown as Json,
            is_active: isActive,
          })
          .eq("integration_type", "banco_inter");
        error = result.error;
      } else {
        const result = await supabase
          .from("integration_settings")
          .insert({
            integration_type: "banco_inter",
            settings: settings as unknown as Json,
            is_active: isActive,
          });
        error = result.error;
      }

      if (error) throw error;
      toast.success("Configurações do Banco Inter salvas!");
    } catch (error: unknown) {
      toast.error("Erro ao salvar: " + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (settings.environment === "sandbox") {
      toast.error("Sandbox indisponível neste ambiente", {
        description: "Selecione Produção para testar a conexão com o Banco Inter.",
      });
      return;
    }

    setTesting(true);
    setScopeStatus({ boleto: "checking", pix: "checking" });
    
    try {
      // First save settings
      await handleSave();

      const { data, error } = await supabase.functions.invoke("banco-inter", {
        body: { action: "test" },
      });

      if (error || data?.error) {
        const errorMsg = data?.error || "Erro ao testar integração";
        
        // Check if it's a scope error and parse which scopes are missing
        if (errorMsg.includes("scope") || errorMsg.includes("escopo")) {
          setScopeStatus({
            boleto: "error",
            pix: "error",
            boletoError: "Escopos não configurados",
            pixError: "Escopos não configurados",
          });
        } else {
          setScopeStatus({ boleto: "error", pix: "error", boletoError: errorMsg, pixError: errorMsg });
        }
        
        toast.error(errorMsg);
      } else {
        // Parse available scopes from response
        const availableScopes = data?.available_scopes || [];
        const hasBoleto = availableScopes.some((s: string) => s.includes("boleto"));
        const hasPix = availableScopes.some((s: string) => s.includes("cob"));
        
        setScopeStatus({
          boleto: hasBoleto ? "ok" : "error",
          pix: hasPix ? "ok" : "error",
          boletoError: hasBoleto ? undefined : "Escopos boleto-cobranca.read/write não habilitados",
          pixError: hasPix ? undefined : "Escopos cob.read/write não habilitados",
        });
        
        if (hasBoleto || hasPix) {
          toast.success("Conexão com Banco Inter validada!", {
            description: `Escopos disponíveis: ${hasBoleto ? "Boleto" : ""}${hasBoleto && hasPix ? ", " : ""}${hasPix ? "PIX" : ""}`,
          });
        } else {
          toast.warning("Conexão OK, mas nenhum escopo de cobrança habilitado");
        }
      }
    } catch (error: unknown) {
      setScopeStatus({ boleto: "error", pix: "error", boletoError: getErrorMessage(error), pixError: getErrorMessage(error) });
      toast.error("Erro: " + getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const hasCertificates = settings.certificate_crt && settings.certificate_key;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Banco Inter
                {isActive && settings.client_id && hasCertificates ? (
                  <Badge variant="default" className="bg-green-500">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Gere boletos e códigos PIX automaticamente
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="inter-active" className="text-sm">Ativo</Label>
            <Switch
              id="inter-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-lg text-sm">
          <p className="text-muted-foreground">
            Acesse o{" "}
            <a
              href="https://developers.inter.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Portal de Desenvolvedores Inter <ExternalLink className="h-3 w-3" />
            </a>
            {" "}para criar sua aplicação e obter as credenciais OAuth e certificados.
          </p>
        </div>

        {/* Sandbox Warning */}
        {settings.environment === "sandbox" && (
          <div className="bg-status-warning/10 border border-status-warning/30 p-3 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-status-warning">Atenção: Sandbox pode não funcionar</p>
              <p className="text-muted-foreground mt-1">
                O ambiente Sandbox do Banco Inter pode estar inacessível neste servidor. 
                Se encontrar erros de conexão, altere para <strong>Produção</strong> e use credenciais reais.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="inter-client-id">Client ID</Label>
          <Input
            id="inter-client-id"
            placeholder="Seu Client ID"
            value={settings.client_id}
            onChange={(e) => setSettings({ ...settings, client_id: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inter-client-secret">Client Secret</Label>
          <Input
            id="inter-client-secret"
            type="password"
            placeholder="••••••••"
            value={settings.client_secret}
            onChange={(e) => setSettings({ ...settings, client_secret: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inter-pix-key">Chave PIX</Label>
          <Input
            id="inter-pix-key"
            placeholder="CNPJ, Email ou Chave Aleatória"
            value={settings.pix_key}
            onChange={(e) => setSettings({ ...settings, pix_key: e.target.value })}
          />
        </div>

        {/* Certificate Files Section */}
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <Label className="font-medium">Certificados de Segurança</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            O Banco Inter fornece dois arquivos: o certificado (.crt) e a chave privada (.key).
            Faça o upload de ambos os arquivos abaixo.
          </p>

          {/* Certificate .crt */}
          <div className="space-y-2">
            <Label htmlFor="inter-cert-crt">Certificado (.crt)</Label>
            <div className="flex items-center gap-2">
              <input
                ref={crtInputRef}
                type="file"
                accept=".crt,.pem"
                className="hidden"
                onChange={handleCrtUpload}
              />
              {settings.certificate_crt ? (
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-status-success/10 border border-status-success/30 rounded-md">
                  <Check className="h-4 w-4 text-status-success" />
                  <span className="text-sm text-status-success">Certificado carregado</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto text-muted-foreground hover:text-status-danger"
                    onClick={() => setSettings({ ...settings, certificate_crt: "" })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={uploadingCrt}
                  onClick={() => crtInputRef.current?.click()}
                >
                  {uploadingCrt ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Selecionar Inter API_Certificado.crt
                </Button>
              )}
            </div>
          </div>

          {/* Key .key */}
          <div className="space-y-2">
            <Label htmlFor="inter-cert-key">Chave Privada (.key)</Label>
            <div className="flex items-center gap-2">
              <input
                ref={keyInputRef}
                type="file"
                accept=".key,.pem"
                className="hidden"
                onChange={handleKeyUpload}
              />
              {settings.certificate_key ? (
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-status-success/10 border border-status-success/30 rounded-md">
                  <Check className="h-4 w-4 text-status-success" />
                  <span className="text-sm text-status-success">Chave privada carregada</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto text-muted-foreground hover:text-status-danger"
                    onClick={() => setSettings({ ...settings, certificate_key: "" })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={uploadingKey}
                  onClick={() => keyInputRef.current?.click()}
                >
                  {uploadingKey ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileKey className="h-4 w-4 mr-2" />
                  )}
                  Selecionar Inter API_Chave.key
                </Button>
              )}
            </div>
          </div>

          {hasCertificates && (
            <div className="flex items-center gap-2 text-sm text-status-success mt-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Ambos os certificados estão configurados</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Ambiente</Label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="environment"
                checked={settings.environment === "sandbox"}
                onChange={() => setSettings({ ...settings, environment: "sandbox" })}
                className="text-primary"
              />
              <span className="text-sm">Sandbox (Teste)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="environment"
                checked={settings.environment === "production"}
                onChange={() => setSettings({ ...settings, environment: "production" })}
                className="text-primary"
              />
              <span className="text-sm">Produção</span>
            </label>
          </div>
        </div>

        {/* Scope Status Section */}
        {(scopeStatus.boleto !== "unknown" || scopeStatus.pix !== "unknown") && (
          <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Status dos Escopos OAuth</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure os escopos no{" "}
              <a
                href="https://developers.inter.co/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Portal de Desenvolvedores Inter <ExternalLink className="h-3 w-3" />
              </a>
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Boleto Scope */}
              <div className={`p-3 rounded-lg border ${
                scopeStatus.boleto === "ok" 
                  ? "bg-status-success/10 border-status-success/30" 
                  : scopeStatus.boleto === "error"
                  ? "bg-status-danger/10 border-status-danger/30"
                  : scopeStatus.boleto === "checking"
                  ? "bg-muted border-muted"
                  : "bg-muted/50 border-muted"
              }`}>
                <div className="flex items-center gap-2">
                  {scopeStatus.boleto === "checking" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : scopeStatus.boleto === "ok" ? (
                    <Check className="h-4 w-4 text-status-success" />
                  ) : scopeStatus.boleto === "error" ? (
                    <X className="h-4 w-4 text-status-danger" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">Boleto</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  boleto-cobranca.read/write
                </p>
                {scopeStatus.boletoError && scopeStatus.boleto === "error" && (
                  <p className="text-xs text-status-danger mt-1">{scopeStatus.boletoError}</p>
                )}
              </div>

              {/* PIX Scope */}
              <div className={`p-3 rounded-lg border ${
                scopeStatus.pix === "ok" 
                  ? "bg-status-success/10 border-status-success/30" 
                  : scopeStatus.pix === "error"
                  ? "bg-status-danger/10 border-status-danger/30"
                  : scopeStatus.pix === "checking"
                  ? "bg-muted border-muted"
                  : "bg-muted/50 border-muted"
              }`}>
                <div className="flex items-center gap-2">
                  {scopeStatus.pix === "checking" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : scopeStatus.pix === "ok" ? (
                    <Check className="h-4 w-4 text-status-success" />
                  ) : scopeStatus.pix === "error" ? (
                    <X className="h-4 w-4 text-status-danger" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">PIX</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  cob.read/write
                </p>
                {scopeStatus.pixError && scopeStatus.pix === "error" && (
                  <p className="text-xs text-status-danger mt-1">{scopeStatus.pixError}</p>
                )}
              </div>
            </div>

            {(scopeStatus.boleto === "error" || scopeStatus.pix === "error") && (
              <div className="bg-status-warning/10 border border-status-warning/30 p-3 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-status-warning">Escopos não habilitados</p>
                  <p className="text-muted-foreground mt-1">
                    Acesse o Portal de Desenvolvedores Inter → Sua Aplicação → Escopos e habilite:
                  </p>
                  <ul className="text-muted-foreground mt-1 list-disc list-inside">
                    {scopeStatus.boleto === "error" && (
                      <li>boleto-cobranca.read e boleto-cobranca.write (para boletos)</li>
                    )}
                    {scopeStatus.pix === "error" && (
                      <li>cob.read e cob.write (para PIX)</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button 
            variant="outline" 
            onClick={handleTest} 
            disabled={testing || !settings.client_id || !hasCertificates || settings.environment === "sandbox"}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Testar Conexão
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
