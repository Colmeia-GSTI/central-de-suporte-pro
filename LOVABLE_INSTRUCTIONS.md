# Instruções para o Lovable - Revisão Completa do Sistema

## Contexto
Foi feita uma revisão completa dos sistemas de Chamados, Monitoramento, Base de Conhecimento e Inventário/Ativos. As mudanças já foram implementadas e estão na branch `claude/review-ticket-system-5C6xd`. Abaixo estão todas as alterações que precisam ser aplicadas, arquivo por arquivo.

---

## 1. `src/lib/sla-calculator.ts` - Correções no Calculador SLA

### 1.1 Validar formato de horário dos turnos
Na função `getWorkMinutesForDay`, substituir o destructuring de array por parsing seguro:

**Antes:**
```ts
const [startH, startM] = shift.start.split(":").map(Number);
const [endH, endM] = shift.end.split(":").map(Number);
```

**Depois:**
```ts
const parts = shift.start.split(":");
const endParts = shift.end.split(":");
const startH = parseInt(parts[0], 10);
const startM = parseInt(parts[1], 10);
const endH = parseInt(endParts[0], 10);
const endM = parseInt(endParts[1], 10);

// Validar valores parseados
if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
  continue; // Pular definições de turno inválidas
}
```

### 1.2 Proteger contra tempo de pausa negativo
Nos dois locais onde pausas são descontadas (funções `calculateRemainingMinutes` e `getSLAStatus`), substituir o loop de pausas por versão segura:

**Antes:**
```ts
if (pauses?.length) {
  for (const pause of pauses) {
    const pauseStart = new Date(pause.paused_at);
    const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : now;
    const pauseMinutes = calculateElapsedBusinessMinutes(pauseStart, pauseEnd, businessHours);
    elapsedMinutes -= pauseMinutes;
  }
}
return Math.max(0, slaMinutes - elapsedMinutes);
```

**Depois:**
```ts
if (pauses?.length) {
  let totalPauseMinutes = 0;
  for (const pause of pauses) {
    const pauseStart = new Date(pause.paused_at);
    const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : now;
    if (pauseStart >= pauseEnd) continue; // Validar que início é antes do fim
    const pauseMinutes = calculateElapsedBusinessMinutes(pauseStart, pauseEnd, businessHours);
    totalPauseMinutes += pauseMinutes;
  }
  elapsedMinutes = Math.max(0, elapsedMinutes - totalPauseMinutes);
}
return Math.max(0, slaMinutes - elapsedMinutes);
```

Aplicar o mesmo padrão na função `getSLAStatus` onde `resolutionElapsed` é calculado.

---

## 2. `src/components/tickets/TicketForm.tsx` - Validação do Formulário

### 2.1 Adicionar limites de tamanho

**Antes:**
```ts
const ticketSchema = z.object({
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres"),
  description: z.string().optional(),
  // ...
});
```

**Depois:**
```ts
const ticketSchema = z.object({
  title: z.string()
    .min(5, "Título deve ter pelo menos 5 caracteres")
    .max(255, "Título deve ter no máximo 255 caracteres"),
  description: z.string()
    .max(10000, "Descrição deve ter no máximo 10.000 caracteres")
    .optional(),
  // ...resto igual
});
```

---

## 3. `src/components/tickets/TicketDetailsTab.tsx` - Transições de Status + Type Safety

### 3.1 Adicionar validação de transições de status
Antes do `handleStatusChange`, adicionar o mapa de transições válidas:

```ts
const validTransitions: Record<string, string[]> = {
  open: ["in_progress", "waiting", "paused", "waiting_third_party", "no_contact", "closed"],
  in_progress: ["waiting", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
  waiting: ["in_progress", "paused", "waiting_third_party", "no_contact", "resolved", "closed"],
  paused: ["in_progress", "waiting", "waiting_third_party", "no_contact"],
  waiting_third_party: ["in_progress", "waiting", "paused", "no_contact"],
  no_contact: ["in_progress", "waiting", "paused", "waiting_third_party", "closed"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};
```

No `handleStatusChange`, validar antes de aplicar:
```ts
const handleStatusChange = async (newStatus: string) => {
  const oldStatus = formData.status;
  const allowed = validTransitions[oldStatus] || [];
  if (!allowed.includes(newStatus)) {
    toast({
      title: "Transição inválida",
      description: `Não é possível mudar de "${statusLabels[oldStatus]}" para "${statusLabels[newStatus]}"`,
      variant: "destructive",
    });
    return;
  }
  // ...resto do código original continua aqui
};
```

### 3.2 Remover casts `as any`
No tipo `TicketWithRelations`, adicionar campos:
```ts
type TicketWithRelations = Tables<"tickets"> & {
  clients: Tables<"clients"> | null;
  ticket_categories: Tables<"ticket_categories"> | null;
  ticket_subcategories?: { id: string; name: string } | null;
  requester_contact?: RequesterContactType | null;
  subcategory_id?: string | null;       // NOVO
  asset_description?: string | null;    // NOVO
};
```

Substituir todas as ocorrências:
- `(ticket as any).subcategory_id` → `ticket.subcategory_id`
- `(ticket as any).asset_description` → `ticket.asset_description`
- `(assignment.ticket_tags as any)?.` → `(assignment.ticket_tags as { name: string; color: string | null } | null)?.`

---

## 4. `src/components/tickets/TicketResolveDialog.tsx` - Notas Mínimas

### 4.1 Aumentar mínimo de caracteres de resolução

**Antes:**
```ts
const canSubmit = resolutionNotes.trim().length > 0;
```

**Depois:**
```ts
const canSubmit = resolutionNotes.trim().length >= 10;
```

### 4.2 Adicionar hint visual
No label:
```tsx
<Label htmlFor="resolution-notes">
  Descreva a solução aplicada <span className="text-destructive">*</span>
  <span className="text-xs text-muted-foreground ml-2">
    (mínimo 10 caracteres)
  </span>
</Label>
```

---

## 5. `src/components/tickets/TicketPauseDialog.tsx` - Validação do Botão

### 5.1 Desabilitar botão quando motivo vazio

**Antes:**
```tsx
<Button onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
```

**Depois:**
```tsx
<Button
  onClick={() => pauseMutation.mutate()}
  disabled={pauseMutation.isPending || !reason.trim() || (pauseType === "third_party" && !thirdPartyName.trim())}
>
```

---

## 6. `src/pages/monitoring/MonitoringPage.tsx` - Debounce + Correções

### 6.1 Adicionar import do useDebounce
```ts
import { useDebounce } from "@/hooks/useDebounce";
```

### 6.2 Adicionar debounce na busca
Após a declaração do state `search`:
```ts
const debouncedSearch = useDebounce(search, 300);
```

Trocar `search` por `debouncedSearch` em:
- `queryKey: ["devices", debouncedSearch]`
- No filtro `.or()` usar `debouncedSearch`

### 6.3 Corrigir cálculo de uptime médio

**Antes:**
```ts
const uptimeAverage = devices.length > 0
  ? devices.reduce((acc, d) => acc + (d.uptime_percent || 0), 0) / devices.length
  : 0;
```

**Depois:**
```ts
const devicesWithUptime = devices.filter((d) => d.uptime_percent != null);
const uptimeAverage = devicesWithUptime.length > 0
  ? devicesWithUptime.reduce((acc, d) => acc + (d.uptime_percent || 0), 0) / devicesWithUptime.length
  : 0;
```

### 6.4 Corrigir race condition no toast de múltiplos alertas
Na mutation `acknowledgeMultipleMutation`:
- Retornar `alertIds.length` do `mutationFn`
- No `onSuccess`, usar o valor retornado: `onSuccess: (count) => { toast.success(\`${count} alerta(s) reconhecido(s)\`); }`
- Mover `setSelectedAlerts([])` para DEPOIS do toast

---

## 7. `src/pages/knowledge/KnowledgePage.tsx` - Debounce + Correções

### 7.1 Adicionar import e debounce
```ts
import { useDebounce } from "@/hooks/useDebounce";
// ...
const debouncedSearch = useDebounce(search, 300);
```

Trocar `search` por `debouncedSearch` na queryKey e no filtro `.or()`.

### 7.2 Adicionar onError na delete mutation
```ts
onError: (error) => {
  toast({
    title: "Erro ao excluir artigo",
    description: error.message,
    variant: "destructive",
  });
},
```

### 7.3 Corrigir preview de conteúdo HTML
Substituir regex `article.content.replace(/<[^>]*>/g, "")` por DOMParser:
```tsx
{(() => {
  try {
    const doc = new DOMParser().parseFromString(article.content, "text/html");
    return (doc.body.textContent || "").slice(0, 150);
  } catch {
    return article.content.replace(/<[^>]*>/g, "").slice(0, 150);
  }
})()}
{article.content.length > 150 ? "..." : ""}
```

### 7.4 Adicionar try/catch na formatação de data
```tsx
{(() => {
  try {
    return `Atualizado ${formatDistanceToNow(new Date(article.updated_at), { addSuffix: true, locale: ptBR })}`;
  } catch {
    return "Data indisponível";
  }
})()}
```

---

## 8. `src/components/knowledge/ArticleViewer.tsx` - Reescrever Completamente

### 8.1 Implementar renderização Markdown
Adicionar funções `renderContent()` e `formatInline()` para renderizar:
- Headings (# ## ###)
- Bold (**texto**)
- Italic (*texto*)
- Code blocks (```)
- Inline code (\`code\`)
- Links ([texto](url))
- Listas (- item, * item, 1. item)

### 8.2 Corrigir contador de views
Usar `useRef` para prevenir dupla contagem em re-renders:
```ts
const hasIncrementedRef = useRef<string | null>(null);
useEffect(() => {
  if (hasIncrementedRef.current !== article.id) {
    hasIncrementedRef.current = article.id;
    incrementViewsMutation.mutate();
  }
}, [article.id]);
```

Tentar usar RPC atômico com fallback:
```ts
try {
  await supabase.rpc("increment_article_views", { article_id: article.id });
} catch {
  await supabase.from("knowledge_articles").update({ views: (article.views || 0) + 1 }).eq("id", article.id);
}
```

### 8.3 Adicionar try/catch na data
```ts
const formattedDate = (() => {
  try {
    return format(new Date(article.updated_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return "Data indisponível";
  }
})();
```

---

## 9. `src/components/knowledge/ArticleForm.tsx` - Validações

### 9.1 Adicionar max length
```ts
const articleSchema = z.object({
  title: z.string()
    .min(5, "Título deve ter pelo menos 5 caracteres")
    .max(255, "Título deve ter no máximo 255 caracteres"),
  content: z.string()
    .min(20, "Conteúdo deve ter pelo menos 20 caracteres")
    .max(50000, "Conteúdo deve ter no máximo 50.000 caracteres"),
  // ...
});
```

### 9.2 Grid responsivo
Trocar `grid-cols-2` por `grid-cols-1 md:grid-cols-2`.

### 9.3 Validar autenticação
```ts
mutationFn: async (data) => {
  if (!user?.id) {
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }
  const payload = {
    title: data.title.trim(),
    // ...
    author_id: user.id,  // não mais user?.id
  };
```

---

## 10. `src/pages/inventory/InventoryPage.tsx` - Debounce + Error Handlers

### 10.1 Adicionar debounce
```ts
import { useDebounce } from "@/hooks/useDebounce";
// ...
const debouncedSearch = useDebounce(search, 300);
```
Usar `debouncedSearch` nas queryKeys e filtros.

### 10.2 Adicionar onError nos delete mutations
Para `deleteAssetMutation` e `deleteLicenseMutation`:
```ts
onError: (error) => {
  toast({ title: "Erro ao excluir ...", description: error.message, variant: "destructive" });
},
```

---

## 11. `src/components/inventory/LicenseForm.tsx` - Validação de Negócio

### 11.1 Adicionar validações cross-field
```ts
const licenseSchema = z.object({
  name: z.string().min(2).max(255),
  vendor: z.string().max(255).optional(),
  license_key: z.string().max(1000).optional(),
  notes: z.string().max(5000).optional(),
  // ...resto igual
}).refine(
  (data) => data.used_licenses <= data.total_licenses,
  { message: "Licenças em uso não podem exceder o total", path: ["used_licenses"] }
).refine(
  (data) => {
    if (data.purchase_date && data.expire_date) {
      return new Date(data.expire_date) >= new Date(data.purchase_date);
    }
    return true;
  },
  { message: "Data de expiração deve ser posterior à data de compra", path: ["expire_date"] }
);
```

### 11.2 Corrigir tipos
- `catch (error: any)` → `catch (error: unknown)` com `error instanceof Error ? error.message : "Erro desconhecido"`
- `Record<string, any>` → `Record<string, string | number | null>`

---

## 12. `src/components/inventory/DeviceDetailsPanel.tsx` - Empty Check + Date Safety

### 12.1 Corrigir verificação de dados vazios

**Antes:**
```ts
if (!serviceData || Object.keys(serviceData).length === 0) {
```

**Depois:**
```ts
const hasAnyData = serviceData && Object.values(serviceData).some(v => v != null);
if (!hasAnyData) {
```

### 12.2 Adicionar try/catch na data de boot
```tsx
{(() => {
  try {
    const d = new Date(serviceData.boot_time);
    return isNaN(d.getTime()) ? "Data inválida" : d.toLocaleString("pt-BR");
  } catch {
    return "Data inválida";
  }
})()}
```

---

## 13. `src/components/inventory/MetricGauge.tsx` - NaN Guard

**Antes:**
```ts
const displayValue = Math.min(Math.max(value, 0), 100);
```

**Depois:**
```ts
const safeValue = Number.isFinite(value) ? value : 0;
const displayValue = Math.min(Math.max(safeValue, 0), 100);
```

---

## 14. `src/hooks/useUnifiedRealtime.tsx` - Cleanup

### 14.1 Corrigir tipo do payload de ticket
```ts
const handleTicketEvent = useCallback((payload: { eventType: string; new: TicketPayload; old: TicketPayload | null }) => {
  const ticket = payload.new;
  const oldTicket = payload.eventType === "UPDATE" ? payload.old : null;
```

### 14.2 Remover dependências mortas do useEffect
Remover `handleAlertEvent` e `handleDeviceEvent` do array de dependências:
```ts
}, [user, isStaff, handleTicketEvent, handleNotificationEvent]);
```

---

## Resumo das Prioridades

| Prioridade | Arquivo | Correção |
|------------|---------|----------|
| ALTA | sla-calculator.ts | Validação de turnos e pausas negativas |
| ALTA | TicketDetailsTab.tsx | Validação de transições de status |
| ALTA | LicenseForm.tsx | used_licenses <= total_licenses |
| ALTA | DeviceDetailsPanel.tsx | Empty check com Object.values |
| MÉDIA | Todas as páginas com busca | Debounce de 300ms |
| MÉDIA | ArticleViewer.tsx | Markdown rendering + view counter atômico |
| MÉDIA | Todos os delete mutations | Adicionar onError handler |
| MÉDIA | Todas as datas | try/catch na formatação |
| BAIXA | Todos os formulários | Max length nos campos |
| BAIXA | MetricGauge.tsx | Guard para NaN |
| BAIXA | useUnifiedRealtime.tsx | Remover dead code |
