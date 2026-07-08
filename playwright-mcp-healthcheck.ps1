Write-Host "=== Playwright MCP Health Check ==="
Write-Host "Node: $(node --version 2>$null)"
Write-Host "Claude MCP:"
claude mcp list 2>$null | Select-String playwright
Write-Host "Browsers:"
$cache = "$env:USERPROFILE\AppData\Local\ms-playwright"
if (Test-Path $cache) { Get-ChildItem $cache -Directory | Where-Object { $_.Name -like 'chromium*' } | Select-Object -ExpandProperty Name } else { Write-Host "  X nenhum browser instalado" }
