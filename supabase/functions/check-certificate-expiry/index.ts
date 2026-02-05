import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailSettings {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
}

interface EmailTemplate {
  subject_template: string;
  html_template: string;
  is_active: boolean;
}

function replaceVariables(template: string, data: Record<string, string>): string {
  let result = template;
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  });
  Object.entries(data).forEach(([key, value]) => {
    const conditionalRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    if (value) {
      result = result.replace(conditionalRegex, "$1");
    } else {
      result = result.replace(conditionalRegex, "");
    }
  });
  return result;
}

function wrapInEmailLayout(content: string, settings: EmailSettings): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; }
    .email-container { max-width: 600px; margin: 0 auto; background: #fff; }
    .email-header { background: ${settings.primary_color}; padding: 24px; text-align: center; }
    .email-header img { max-height: 50px; max-width: 200px; }
    .email-content { padding: 32px 24px; color: #1f2937; line-height: 1.6; }
    .email-content h2 { margin-top: 0; color: #111827; }
    .email-content a { color: ${settings.primary_color}; }
    .email-footer { background: ${settings.secondary_color}; color: #9ca3af; padding: 20px 24px; text-align: center; font-size: 12px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      ${settings.logo_url ? `<img src="${settings.logo_url}" alt="Logo" />` : `<span style="color: #fff; font-size: 18px; font-weight: 600;">Colmeia</span>`}
    </div>
    <div class="email-content">
      ${content}
    </div>
    <div class="email-footer">
      ${settings.footer_text}
    </div>
  </div>
</body>
</html>`;
}

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

    // Fetch email settings and companies in parallel
    const [settingsRes, companiesRes] = await Promise.all([
      supabase.from("email_settings").select("*").limit(1).single(),
      supabase.from("company_settings").select("id, razao_social, cnpj, certificado_validade, certificado_arquivo_url, email").not("certificado_validade", "is", null),
    ]);

    const emailSettings: EmailSettings = settingsRes.data || {
      logo_url: null,
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este é um alerta automático do sistema Colmeia.",
    };

    const companies = companiesRes.data;

    if (companiesRes.error) {
      console.error("[CHECK-CERT] Erro ao buscar empresas:", companiesRes.error);
      return new Response(
        JSON.stringify({ success: false, error: companiesRes.error.message }),
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
      let templateType: string = "";

      if (daysRemaining <= 0) {
        alertLevel = "expired";
        notificationType = "error";
        templateType = "certificate_expiry_expired";
      } else if (daysRemaining <= 7) {
        alertLevel = "critical";
        notificationType = "error";
        templateType = "certificate_expiry_critical";
      } else if (daysRemaining <= 15) {
        alertLevel = "alert";
        notificationType = "warning";
        templateType = "certificate_expiry_critical";
      } else if (daysRemaining <= 30) {
        alertLevel = "warning";
        notificationType = "warning";
        templateType = "certificate_expiry_warning";
      }

      if (alertLevel && staffUserIds.length > 0) {
        alerts.push({ company: company.razao_social, daysRemaining, level: alertLevel });

        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("related_type", "certificate")
          .eq("related_id", company.id)
          .gte("created_at", todayStart.toISOString())
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          // Fetch template
          const { data: templateData } = await supabase
            .from("email_templates")
            .select("*")
            .eq("template_type", templateType)
            .maybeSingle();

          const emailTemplate: EmailTemplate | null = templateData?.is_active ? templateData : null;

          const templateVars: Record<string, string> = {
            company_name: company.razao_social,
            cnpj: company.cnpj,
            days_remaining: String(daysRemaining <= 0 ? 0 : daysRemaining),
            expiry_date: new Date(company.certificado_validade!).toLocaleDateString("pt-BR"),
          };

          let title: string;
          let message: string;

          if (emailTemplate) {
            title = replaceVariables(emailTemplate.subject_template, templateVars);
            message = `O certificado digital da empresa ${company.razao_social} ${daysRemaining <= 0 ? "expirou" : `expira em ${daysRemaining} dia(s)`}. CNPJ: ${company.cnpj}`;
          } else {
            if (daysRemaining <= 0) {
              title = "🚨 Certificado Digital Expirado";
              message = `O certificado digital da empresa ${company.razao_social} (${company.cnpj}) expirou! A emissão de NFS-e está comprometida.`;
            } else if (daysRemaining <= 7) {
              title = "⚠️ Certificado Expirando em 7 Dias";
              message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dia(s). Renove imediatamente!`;
            } else if (daysRemaining <= 15) {
              title = "⚠️ Certificado Expirando em 15 Dias";
              message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dias. Providencie a renovação.`;
            } else {
              title = "📅 Certificado Expirando em 30 Dias";
              message = `O certificado digital da empresa ${company.razao_social} expira em ${daysRemaining} dias. Planeje a renovação.`;
            }
          }

          // Create notifications
          const notifications = staffUserIds.map((userId) => ({
            user_id: userId,
            type: notificationType,
            title,
            message,
            related_type: "certificate",
            related_id: company.id,
          }));

          const { error: notifError } = await supabase.from("notifications").insert(notifications);

          if (notifError) {
            console.error(`[CHECK-CERT] Erro ao criar notificação para ${company.razao_social}:`, notifError);
          } else {
            console.log(`[CHECK-CERT] Notificação criada para ${company.razao_social} (${alertLevel})`);
          }

          // Send email for critical alerts
          if (alertLevel === "expired" || alertLevel === "critical") {
            try {
              const { data: smtpSettings } = await supabase
                .from("integration_settings")
                .select("settings, is_active")
                .eq("integration_type", "smtp")
                .single();

              if (smtpSettings?.is_active) {
                const { data: adminProfiles } = await supabase
                  .from("profiles")
                  .select("email")
                  .in("user_id", staffUserIds)
                  .not("email", "is", null);

                if (adminProfiles && adminProfiles.length > 0) {
                  for (const profile of adminProfiles) {
                    let emailSubject: string;
                    let emailHtml: string;

                    if (emailTemplate) {
                      emailSubject = replaceVariables(emailTemplate.subject_template, templateVars);
                      const contentHtml = replaceVariables(emailTemplate.html_template, templateVars);
                      emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
                    } else {
                      emailSubject = title;
                      const defaultContent = `
                        <h2>${title}</h2>
                        <p>${message}</p>
                        <p><strong>Empresa:</strong> ${company.razao_social}</p>
                        <p><strong>CNPJ:</strong> ${company.cnpj}</p>
                        <p><strong>Validade:</strong> ${new Date(company.certificado_validade!).toLocaleDateString("pt-BR")}</p>
                        <p><strong>Dias Restantes:</strong> ${daysRemaining <= 0 ? "EXPIRADO" : daysRemaining + " dias"}</p>
                      `;
                      emailHtml = wrapInEmailLayout(defaultContent, emailSettings);
                    }

                    await supabase.functions.invoke("send-email-smtp", {
                      body: { to: profile.email, subject: emailSubject, html: emailHtml },
                    });
                    console.log(`[CHECK-CERT] Email enviado para ${profile.email}`);
                  }
                }
              }
            } catch (emailError) {
              console.error("[CHECK-CERT] Erro ao enviar email:", emailError);
            }

            // Send Telegram
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
      JSON.stringify({ success: true, message: "Verificação de certificados concluída", processed: companies.length, alerts }),
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
