import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_ticket",
  title: "Get ticket details",
  description: "Fetch a single support ticket by ID, including comments.",
  inputSchema: {
    ticketId: z.string().uuid().describe("The ticket UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ticketId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data: ticket, error } = await sb.from("tickets").select("*").eq("id", ticketId).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!ticket) return { content: [{ type: "text", text: "Ticket not found" }], isError: true };
    const { data: comments } = await sb
      .from("ticket_comments")
      .select("id, content, created_at, user_id, is_internal")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    const payload = { ticket, comments: comments ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
