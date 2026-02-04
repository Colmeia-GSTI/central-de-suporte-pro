import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompanySettings {
  id: string;
  razao_social: string;
  cnpj: string;
  certificado_validade: string | null;
  certificado_arquivo_url: string | null;
  email: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[CHECK-CERT] Iniciando verificação de certificados digitais");

    // Fetch all companies with certificates
    const { data: companies, error: fetchError } = await supabase
      .from("company_settings")
      .select("id, razao_social, cnpj, certificado_validade, certificado_arquivo_url, email")
      .not("certificado_validade", "is", null);

    if (fetchError) {
      console.error("[CHECK-CERT] Erro ao buscar empresas:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!companies || companies.length === 0) {
      console.log("[CHECK-CERT] Nenhuma empresa com certificado configurado");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum certificado para verificar", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-CERT] Verificando ${companies.length} certificados`);

    const today = new Date();
    const alerts: { company: string; daysRemaining: number; level: string }[] = [];

    // Get admin/financial users for notifications
    const { data: staffUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "financial"]);

    const staffUserIds = staffUsers?.map((u) => u.user_id) || [];

    for (const company of companies as CompanySettings[]) {
      if (!company.certificado_validade) continue;

      const expiryDate = new Date(company.certificado_validade);
      const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let alertLevel: string | null = null;
      let notificationType: string = "info";
      let title: string = "";
      let message: string = "";

      // Determine alert level based on days remaining
      if (daysRemaining <= 0) {
        alertLevel = "expired";
        notificationType = "error";
        title = "🚨 Certificado Digital Expirado";
        message = `O certificado digital da empresa ${company.razao_social} (${company.cnpj}) expirou! A emissão de NFS-e está comprometida.`;
      } else if (daysRemaining <= 7) {
        alertLevel = "critical";
        notificationType = "error";
        title = "⚠️ Certificado Expirando em 7 Dias";
        message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dia(s). Renove imediatamente!`;
      } else if (daysRemaining <= 15) {
        alertLevel = "alert";
        notificationType = "warning";
        title = "⚠️ Certificado Expirando em 15 Dias";
        message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dias. Providencie a renovação.`;
      } else if (daysRemaining <= 30) {
        alertLevel = "warning";
        notificationType = "warning";
        title = "📅 Certificado Expirando em 30 Dias";
        message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dias. Planeje a renovação.`;
      }

      if (alertLevel && staffUserIds.length > 0) {
        alerts.push({
          company: company.razao_social,
          daysRemaining,
          level: alertLevel,
        });

        // Check if we already sent a notification today for this company and level
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("related_type", "certificate")
          .eq("related_id", company.id)
          .gte("created_at", todayStart.toISOString())
          .limit(1);

        // Only create notifications if we haven't already today
        if (!existingNotif || existingNotif.length === 0) {
          const notifications = staffUserIds.map((userId) => ({
            user_id: userId,
            type: notificationType,
            title,
            message,
            related_type: "certificate",
            related_id: company.id,
          }));

          const { error: notifError } = await supabase
            .from("notifications")
            .insert(notifications);

          if (notifError) {
            console.error(`[CHECK-CERT] Erro ao criar notificação para ${company.razao_social}:`, notifError);
          } else {
            console.log(`[CHECK-CERT] Notificação criada para ${company.razao_social} (${alertLevel})`);
          }

          // Send email notification if Resend is configured
          if (alertLevel === "expired" || alertLevel === "critical") {
            try {
              const { data: resendSettings } = await supabase
                .from("integration_settings")
                .select("settings, is_active")
                .eq("integration_type", "resend")
                .single();

              if (resendSettings?.is_active) {
                // Get admin emails
                const { data: adminProfiles } = await supabase
                  .from("profiles")
                  .select("email")
                  .in("user_id", staffUserIds)
                  .not("email", "is", null);

                if (adminProfiles && adminProfiles.length > 0) {
                  for (const profile of adminProfiles) {
                    await supabase.functions.invoke("send-email-resend", {
                      body: {
                        to: profile.email,
                        subject: title,
                        html: `
                          <h2>${title}</h2>
                          <p>${message}</p>
                          <p><strong>Empresa:</strong> ${company.razao_social}</p>
                          <p><strong>CNPJ:</strong> ${company.cnpj}</p>
                          <p><strong>Validade:</strong> ${new Date(company.certificado_validade!).toLocaleDateString("pt-BR")}</p>
                          <p><strong>Dias Restantes:</strong> ${daysRemaining <= 0 ? "EXPIRADO" : daysRemaining + " dias"}</p>
                          <hr>
                          <p style="color: #666; font-size: 12px;">
                            Este é um alerta automático do sistema Colmeia.
                          </p>
                        `,
                      },
                    });
                    console.log(`[CHECK-CERT] Email enviado para ${profile.email}`);
                  }
                }
              }
            } catch (emailError) {
              console.error("[CHECK-CERT] Erro ao enviar email:", emailError);
            }
          }

          // Send Telegram notification if configured
          if (alertLevel === "expired" || alertLevel === "critical") {
            try {
              const { data: telegramSettings } = await supabase
                .from("integration_settings")
                .select("settings, is_active")
                .eq("integration_type", "telegram")
                .single();

              if (telegramSettings?.is_active) {
                const settings = telegramSettings.settings as { chat_id?: string };
                if (settings.chat_id) {
                  await supabase.functions.invoke("send-telegram", {
                    body: {
                      chat_id: settings.chat_id,
                      message: `${title}\n\n${message}\n\nEmpresa: ${company.razao_social}\nCNPJ: ${company.cnpj}\nValidade: ${new Date(company.certificado_validade!).toLocaleDateString("pt-BR")}`,
                    },
                  });
                  console.log("[CHECK-CERT] Notificação Telegram enviada");
                }
              }
            } catch (telegramError) {
              console.error("[CHECK-CERT] Erro ao enviar Telegram:", telegramError);
            }
          }
        }
      }
    }

    console.log(`[CHECK-CERT] Verificação concluída. Alertas: ${alerts.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Verificação de certificados concluída",
        processed: companies.length,
        alerts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CHECK-CERT] Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
