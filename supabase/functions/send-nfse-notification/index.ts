import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NfseNotificationRequest {
  nfse_history_id: string;
  channels: ("email" | "whatsapp")[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NfseNotificationRequest = await req.json();
    const { nfse_history_id, channels } = body;

    // Validate input
    if (!nfse_history_id || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: "nfse_history_id e channels são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch NFS-e data with client info
    const { data: nfse, error: nfseError } = await supabase
      .from("nfse_history")
      .select(`
        id,
        numero_nfse,
        pdf_url,
        valor_servico,
        competencia,
        client_id,
        clients (
          name,
          email,
          whatsapp,
          financial_email
        )
      `)
      .eq("id", nfse_history_id)
      .maybeSingle();

    if (nfseError || !nfse) {
      console.error("[send-nfse-notification] Error fetching NFS-e:", nfseError);
      return new Response(
        JSON.stringify({ error: "NFS-e não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!nfse.pdf_url) {
      return new Response(
        JSON.stringify({ error: "NFS-e não possui PDF disponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company info for email signature
    const { data: company } = await supabase
      .from("company_settings")
      .select("razao_social, nome_fantasia, telefone, email")
      .limit(1)
      .maybeSingle();

    const companyName = company?.nome_fantasia || company?.razao_social || "Empresa";

    // Generate signed URL for PDF (24 hours validity)
    let pdfSignedUrl = nfse.pdf_url;
    if (nfse.pdf_url.startsWith("nfse-files/")) {
      const path = nfse.pdf_url.replace("nfse-files/", "");
      const { data: signedData, error: signError } = await supabase.storage
        .from("nfse-files")
        .createSignedUrl(path, 86400); // 24 hours

      if (signError) {
        console.error("[send-nfse-notification] Error creating signed URL:", signError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar link do PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      pdfSignedUrl = signedData.signedUrl;
    }

    // Handle clients - could be array or object depending on query
    const clientData = nfse.clients;
    const client = (Array.isArray(clientData) ? clientData[0] : clientData) as { name: string; email: string | null; whatsapp: string | null; financial_email: string | null } | null | undefined;
    const clientName = client?.name || "Cliente";
    const nfseNumber = nfse.numero_nfse || "N/A";
    const valorFormatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(nfse.valor_servico || 0);

    // Format competencia
    let competenciaFormatted = "";
    if (nfse.competencia) {
      const [year, month] = nfse.competencia.toString().slice(0, 7).split("-");
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      competenciaFormatted = `${months[parseInt(month, 10) - 1]}/${year}`;
    }

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // Send via Email (SMTP)
    if (channels.includes("email")) {
      const emailTo = client?.financial_email || client?.email;
      
      if (!emailTo) {
        results.push({ channel: "email", success: false, error: "Cliente não possui email cadastrado" });
      } else {
        const emailSubject = `NFS-e #${nfseNumber} - ${clientName} - ${valorFormatted}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Nota Fiscal de Serviço Eletrônica</h2>
            
            <p>Prezado(a) <strong>${clientName}</strong>,</p>
            
            <p>Segue a Nota Fiscal de Serviço Eletrônica referente aos serviços prestados.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #555;">Dados da NFS-e</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Número:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${nfseNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Competência:</td>
                  <td style="padding: 8px 0; font-weight: bold;">${competenciaFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Valor:</td>
                  <td style="padding: 8px 0; font-weight: bold; color: #2563eb;">${valorFormatted}</td>
                </tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${pdfSignedUrl}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                📄 Baixar PDF da NFS-e
              </a>
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Este link expira em 24 horas. Caso precise do documento após esse período, entre em contato conosco.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #666;">
              Atenciosamente,<br>
              <strong>${companyName}</strong>
            </p>
          </div>
        `;

        try {
          const { error: emailError } = await supabase.functions.invoke("send-email-smtp", {
            body: {
              to: emailTo,
              subject: emailSubject,
              html: emailHtml,
            },
          });

          if (emailError) {
            console.error("[send-nfse-notification] Email error:", emailError);
            results.push({ channel: "email", success: false, error: emailError.message || "Erro ao enviar email" });
          } else {
            results.push({ channel: "email", success: true });

            // Log event
            await supabase.from("nfse_event_logs").insert({
              nfse_history_id,
              event_type: "compartilhamento",
              event_data: {
                channel: "email",
                recipient: emailTo,
                sent_at: new Date().toISOString(),
              },
            });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : "Erro desconhecido";
          console.error("[send-nfse-notification] Email exception:", errMsg);
          results.push({ channel: "email", success: false, error: errMsg });
        }
      }
    }

    // Send via WhatsApp (Evolution API)
    if (channels.includes("whatsapp")) {
      const whatsappTo = client?.whatsapp;

      if (!whatsappTo) {
        results.push({ channel: "whatsapp", success: false, error: "Cliente não possui WhatsApp cadastrado" });
      } else {
        const competenciaShort = competenciaFormatted.toLowerCase().replace("/", "/");
        const whatsappMessage = `Olá, ${clientName}!

Segue a NFS-e #${nfseNumber} referente aos serviços prestados em ${competenciaShort}.

💰 *Valor: ${valorFormatted}*

📄 Baixar PDF:
${pdfSignedUrl}

Atenciosamente,
*${companyName}*`;

        try {
          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              to: whatsappTo,
              message: whatsappMessage,
              relatedType: "nfse",
              relatedId: nfse_history_id,
            },
          });

          if (whatsappError) {
            console.error("[send-nfse-notification] WhatsApp error:", whatsappError);
            results.push({ channel: "whatsapp", success: false, error: whatsappError.message || "Erro ao enviar WhatsApp" });
          } else {
            results.push({ channel: "whatsapp", success: true });

            // Log event
            await supabase.from("nfse_event_logs").insert({
              nfse_history_id,
              event_type: "compartilhamento",
              event_data: {
                channel: "whatsapp",
                recipient: whatsappTo,
                sent_at: new Date().toISOString(),
              },
            });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : "Erro desconhecido";
          console.error("[send-nfse-notification] WhatsApp exception:", errMsg);
          results.push({ channel: "whatsapp", success: false, error: errMsg });
        }
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        partial: !allSuccess && anySuccess,
        results,
      }),
      { status: allSuccess ? 200 : anySuccess ? 207 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[send-nfse-notification] Error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
