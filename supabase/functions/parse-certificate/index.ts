import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseCertificateRequest {
  certificateBase64: string;
  password: string;
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { certificateBase64, password }: ParseCertificateRequest = await req.json();

    if (!certificateBase64) {
      return new Response(
        JSON.stringify({ error: "Arquivo do certificado não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password) {
      return new Response(
        JSON.stringify({ error: "Senha do certificado não fornecida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsing certificate...");

    try {
      // Decode Base64 to binary
      const p12Der = forge.util.decode64(certificateBase64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);

      // Parse PKCS12 with password
      let p12;
      try {
        p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
      } catch (e) {
        console.error("Password error:", e);
        return new Response(
          JSON.stringify({ error: "Senha do certificado incorreta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract certificate from bags
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = bags[forge.pki.oids.certBag];

      if (!certBag || certBag.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhum certificado encontrado no arquivo" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the end-entity certificate (not CA certificates)
      let cert = certBag[0].cert;
      for (const bag of certBag) {
        if (bag.cert) {
          const basicConstraints = bag.cert.getExtension("basicConstraints");
          if (!basicConstraints || !basicConstraints.cA) {
            cert = bag.cert;
            break;
          }
        }
      }

      if (!cert) {
        return new Response(
          JSON.stringify({ error: "Certificado inválido ou corrompido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract certificate data
      const validFrom = cert.validity.notBefore;
      const validTo = cert.validity.notAfter;
      const now = new Date();
      
      // Calculate days remaining
      const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining < 0;
      const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 15;

      // Extract subject CN
      const subjectCN = cert.subject.getField("CN");
      const subject = subjectCN ? subjectCN.value : "Não identificado";

      // Extract issuer CN
      const issuerCN = cert.issuer.getField("CN");
      const issuer = issuerCN ? issuerCN.value : "Não identificado";

      // Get serial number
      const serialNumber = cert.serialNumber;

      const certificateInfo: CertificateInfo = {
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        subject,
        issuer,
        serialNumber,
        daysRemaining,
        isExpired,
        isExpiringSoon,
      };

      console.log("Certificate parsed successfully:", {
        subject,
        issuer,
        validTo: validTo.toISOString(),
        daysRemaining,
      });

      return new Response(
        JSON.stringify(certificateInfo),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "Arquivo não é um certificado digital válido (.pfx ou .p12)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao processar o certificado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
