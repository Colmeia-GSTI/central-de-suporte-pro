import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CalendarRequest {
  action: "auth_url" | "callback" | "sync_event" | "delete_event";
  code?: string;
  redirect_uri?: string;
  event_id?: string;
  user_id?: string;
}

interface GoogleSettings {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get settings from database
    const { data: settingsData, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "google_calendar")
      .single();

    if (settingsError || !settingsData) {
      return new Response(
        JSON.stringify({ 
          error: "Integração Google Calendar não configurada",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settingsData.is_active) {
      return new Response(
        JSON.stringify({ 
          error: "Integração Google Calendar desativada",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as GoogleSettings;

    if (!settings.client_id || !settings.client_secret) {
      return new Response(
        JSON.stringify({ 
          error: "Credenciais Google Calendar incompletas",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, code, redirect_uri, event_id, user_id }: CalendarRequest = await req.json();

    switch (action) {
      case "auth_url": {
        // Generate OAuth URL
        const scopes = [
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.readonly",
        ];
        
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", settings.client_id);
        authUrl.searchParams.set("redirect_uri", redirect_uri || "");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes.join(" "));
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", user_id || "");

        return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "callback": {
        // Exchange code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: code || "",
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            redirect_uri: redirect_uri || "",
            grant_type: "authorization_code",
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("Token exchange error:", errorText);
          throw new Error("Erro ao autenticar com Google");
        }

        const tokens = await tokenResponse.json();

        // Get calendar list to find primary calendar
        const calendarResponse = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );

        const calendarData = await calendarResponse.json();

        // Store integration info
        const { error: upsertError } = await supabase
          .from("google_calendar_integrations")
          .upsert({
            user_id: user_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            calendar_id: calendarData.id || "primary",
            sync_enabled: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        if (upsertError) {
          console.error("Upsert error:", upsertError);
          throw new Error("Erro ao salvar integração");
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "sync_event": {
        // Get user's integration
        const { data: integration, error: intError } = await supabase
          .from("google_calendar_integrations")
          .select("user_id, access_token, refresh_token, token_expires_at, calendar_id")
          .eq("user_id", user_id)
          .single();

        if (intError || !integration) {
          throw new Error("Integração não encontrada");
        }

        // Refresh token if needed
        let accessToken = integration.access_token;
        if (new Date(integration.token_expires_at) < new Date()) {
          const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              refresh_token: integration.refresh_token,
              client_id: settings.client_id,
              client_secret: settings.client_secret,
              grant_type: "refresh_token",
            }),
          });

          if (!refreshResponse.ok) {
            throw new Error("Erro ao renovar token");
          }

          const newTokens = await refreshResponse.json();
          accessToken = newTokens.access_token;

          await supabase
            .from("google_calendar_integrations")
            .update({
              access_token: accessToken,
              token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            })
            .eq("user_id", user_id);
        }

        // Get event from database
        const { data: event, error: eventError } = await supabase
          .from("calendar_events")
          .select("id, title, description, start_time, end_time, all_day, location, google_event_id")
          .eq("id", event_id)
          .single();

        if (eventError || !event) {
          throw new Error("Evento não encontrado");
        }

        // Create/update event in Google Calendar
        const googleEvent = {
          summary: event.title,
          description: event.description,
          location: event.location,
          start: event.all_day
            ? { date: event.start_time.split("T")[0] }
            : { dateTime: event.start_time, timeZone: "America/Sao_Paulo" },
          end: event.all_day
            ? { date: event.end_time.split("T")[0] }
            : { dateTime: event.end_time, timeZone: "America/Sao_Paulo" },
        };

        let googleResponse;
        if (event.google_event_id) {
          // Update existing event
          googleResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events/${event.google_event_id}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(googleEvent),
            }
          );
        } else {
          // Create new event
          googleResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(googleEvent),
            }
          );
        }

        if (!googleResponse.ok) {
          const errorText = await googleResponse.text();
          console.error("Google Calendar error:", errorText);
          throw new Error("Erro ao sincronizar evento");
        }

        const googleEventData = await googleResponse.json();

        // Update local event with Google ID
        await supabase
          .from("calendar_events")
          .update({
            google_event_id: googleEventData.id,
            google_calendar_id: integration.calendar_id,
          })
          .eq("id", event_id);

        return new Response(JSON.stringify({ success: true, google_event: googleEventData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_event": {
        const { data: integration } = await supabase
          .from("google_calendar_integrations")
          .select("user_id, access_token, refresh_token, token_expires_at, calendar_id")
          .eq("user_id", user_id)
          .single();

        if (!integration) {
          throw new Error("Integração não encontrada");
        }

        const { data: event } = await supabase
          .from("calendar_events")
          .select("google_event_id")
          .eq("id", event_id)
          .single();

        if (event?.google_event_id) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events/${event.google_event_id}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${integration.access_token}` },
            }
          );
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error("Ação inválida");
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
