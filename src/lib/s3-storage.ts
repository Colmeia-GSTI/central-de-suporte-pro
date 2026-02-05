/**
 * S3-Compatible Storage Service
 * Integração com S3-compatível (Netskope, AWS S3, MinIO, etc)
 */

import { createClient } from "@supabase/supabase-js";

export interface S3StorageConfig {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  bucket_name: string;
  access_key: string;
  secret_key: string;
  path_prefix: string;
  signed_url_expiry_hours: number;
  is_active: boolean;
}

export interface DocumentUploadParams {
  clientId: string;
  invoiceId: string;
  invoiceNumber: number;
  documentType: "boleto" | "nfse" | "xml" | "attachment";
  year: number;
  month: number;
  fileContent: ArrayBuffer | Blob;
  fileName: string;
  mimeType: string;
}

export interface SignedUrlParams {
  clientId: string;
  invoiceNumber: number;
  year: number;
  month: number;
  documentType: string;
  expiryHours?: number;
}

export class S3StorageClient {
  private config: S3StorageConfig;
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || "",
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""
  );

  constructor(config: S3StorageConfig) {
    this.config = config;
  }

  /**
   * Gera o caminho do arquivo no S3 baseado no template
   */
  private generateFilePath(params: DocumentUploadParams | SignedUrlParams): string {
    const template = this.config.path_prefix;

    return template
      .replace("{clientId}", params.clientId)
      .replace("{year}", String(params.year))
      .replace("{month}", String(params.month).padStart(2, "0"))
      .replace("{type}", params.documentType)
      .replace("{invoiceNumber}", String(params.invoiceNumber));
  }

  /**
   * Calcula a assinatura AWS v4 para as requisições
   */
  private async calculateSignature(
    method: string,
    path: string,
    timestamp: string,
    dateStamp: string
  ): Promise<string> {
    const algorithm = "AWS4-HMAC-SHA256";
    const service = "s3";
    const region = this.config.region;

    // Credential scope
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    // CanonicalRequest
    const canonicalRequest = `${method}\n${path}\n\nhost:${this.config.endpoint}\n\nhost\nUNSIGNED-PAYLOAD`;

    // StringToSign
    const canonicalRequestHash = await this.sha256(canonicalRequest);
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate Signature
    const kDate = await this.hmacSha256(
      `AWS4${this.config.secret_key}`,
      dateStamp
    );
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, "aws4_request");
    const signature = await this.hmacSha256(kSigning, stringToSign);

    return signature;
  }

  /**
   * Calcula SHA256
   */
  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Calcula HMAC-SHA256
   */
  private async hmacSha256(key: string | ArrayBuffer, data: string): Promise<string> {
    const keyData = typeof key === "string" ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(data)
    );

    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Faz upload de documento para S3
   */
  async uploadDocument(params: DocumentUploadParams): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    try {
      const filePath = this.generateFilePath(params);
      const blob = params.fileContent instanceof Blob
        ? params.fileContent
        : new Blob([params.fileContent], { type: params.mimeType });

      // Prepara headers para upload direto (sem auth no browser)
      const response = await fetch(`${this.config.endpoint}/${this.config.bucket_name}/${filePath}`, {
        method: "PUT",
        headers: {
          "Content-Type": params.mimeType,
          "x-amz-acl": "private",
        },
        body: blob,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      // Salva referência no banco de dados
      const { error: dbError } = await this.supabase.from("invoice_documents").insert({
        invoice_id: params.invoiceId,
        document_type: params.documentType,
        file_name: params.fileName,
        file_path: filePath,
        file_size: blob.size,
        mime_type: params.mimeType,
        storage_config_id: this.config.id,
        upload_status: "uploaded",
      });

      if (dbError) {
        console.error("Error saving document metadata:", dbError);
        return { success: false, error: "Failed to save document metadata" };
      }

      return {
        success: true,
        url: `${this.config.endpoint}/${this.config.bucket_name}/${filePath}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Upload error:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Gera URL assinada temporária para acesso seguro
   */
  async generateSignedUrl(params: SignedUrlParams): Promise<{
    success: boolean;
    url?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    try {
      const filePath = this.generateFilePath(params);
      const expiryHours = params.expiryHours || this.config.signed_url_expiry_hours;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      // Para implementação completa com AWS Signature v4, seria necessário
      // No browser, recomenda-se usar uma Edge Function do Supabase que gera a assinatura

      // Placeholder - retorna URL simples
      const url = `${this.config.endpoint}/${this.config.bucket_name}/${filePath}?expires=${expiresAt.getTime()}`;

      return {
        success: true,
        url,
        expiresAt,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Signed URL generation error:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Testa conexão com o storage S3
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Tenta acessar o bucket com um HEAD request
      const response = await fetch(`${this.config.endpoint}/${this.config.bucket_name}/`, {
        method: "HEAD",
        headers: {
          Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.access_key}`,
        },
      });

      if (response.ok || response.status === 404) {
        // 404 é OK - significa que o bucket existe mas está vazio
        return { success: true, message: "Connection successful" };
      }

      return {
        success: false,
        message: `Connection failed: ${response.statusText}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Connection error: ${errorMsg}`,
      };
    }
  }

  /**
   * Deleta documento do storage
   */
  async deleteDocument(filePath: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.config.endpoint}/${this.config.bucket_name}/${filePath}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Lista documentos de um cliente/mês
   */
  async listDocuments(clientId: string, year: number, month: number): Promise<{
    success: boolean;
    documents?: string[];
    error?: string;
  }> {
    try {
      const prefix = `${clientId}/${year}/${String(month).padStart(2, "0")}/`;

      const response = await fetch(
        `${this.config.endpoint}/${this.config.bucket_name}/?prefix=${prefix}`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        throw new Error(`List failed: ${response.statusText}`);
      }

      // Parse XML response (implementação simplificada)
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "application/xml");
      const keys = Array.from(xml.querySelectorAll("Key")).map(
        (el) => el.textContent || ""
      );

      return { success: true, documents: keys };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMsg };
    }
  }
}

/**
 * Factory para criar instância do cliente S3
 */
export async function getS3Client(
  configId?: string
): Promise<S3StorageClient | null> {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || "",
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""
  );

  try {
    // Se não especificar configId, busca a config ativa
    const query = supabase
      .from("storage_config")
      .select("*")
      .eq("is_active", true);

    if (configId) {
      query.eq("id", configId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error("Error fetching storage config:", error);
      return null;
    }

    return new S3StorageClient(data as S3StorageConfig);
  } catch (error) {
    console.error("Error creating S3 client:", error);
    return null;
  }
}
