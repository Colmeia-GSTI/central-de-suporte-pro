import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOpenTicketsTool from "./tools/list-open-tickets";
import getTicketTool from "./tools/get-ticket";
import searchClientsTool from "./tools/search-clients";
import listActiveContractsTool from "./tools/list-active-contracts";

// Build the OAuth issuer from the Supabase project ref (inlined at build time).
// SUPABASE_URL is the Lovable Cloud proxy in production, which does not match the
// issuer published by the discovery document — mcp-js would reject tokens.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "colmeia-mcp",
  title: "Colmeia — Central de Suporte",
  version: "0.1.0",
  instructions:
    "Ferramentas do sistema Colmeia (MSP): consultar chamados abertos, ver detalhes de um chamado, buscar clientes e listar contratos ativos. Todas as chamadas rodam como o usuário conectado, respeitando as permissões (RLS) da conta.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listOpenTicketsTool, getTicketTool, searchClientsTool, listActiveContractsTool],
});
