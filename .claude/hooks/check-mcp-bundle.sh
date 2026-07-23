#!/bin/sh
# Bloqueia o commit do bundle MCP corrompido.
#
# Contexto: vite.config.ts roda mcpPlugin(), que regenera supabase/functions/mcp/index.ts
# a cada build. No Windows o plugin não resolve o caminho absoluto e emite um
# `import mcp from "npm:C:\...\src\lib\mcp\index.ts"` inválido — o arquivo cai de ~157
# para 8 linhas e as 4 ferramentas MCP somem. Commitar isso quebraria a edge `mcp` em produção.
#
# Sai 2 (bloqueia a chamada e devolve o motivo ao Claude) se o conteúdo STAGED estiver curto.
f=supabase/functions/mcp/index.ts

n=$(git show ":$f" 2>/dev/null | wc -l | tr -d ' ')

# Sem nada staged para esse arquivo (ou não é um repo git): nada a checar.
[ -z "$n" ] && exit 0
[ "$n" -eq 0 ] && exit 0

if [ "$n" -lt 20 ]; then
  echo "BLOQUEADO: $f está corrompido ($n linhas; o correto tem ~157)." >&2
  echo "O build do Windows apagou as 4 ferramentas MCP. Commitar isso quebra a edge 'mcp' em produção." >&2
  echo "Corrija com: git restore --staged --worktree $f" >&2
  exit 2
fi

exit 0
