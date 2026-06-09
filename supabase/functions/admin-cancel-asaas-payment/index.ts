import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { payment_ids, reason } = await req.json()
    if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'payment_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const API_KEY = Deno.env.get('ASAAS_API_KEY')!
    const BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3'
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const results: any[] = []
    for (const id of payment_ids) {
      const r = await fetch(`${BASE}/payments/${id}`, {
        method: 'DELETE',
        headers: { access_token: API_KEY, 'Content-Type': 'application/json' },
      })
      const body = await r.text().catch(() => '')
      results.push({ id, status: r.status, body })

      await supabase.from('audit_logs').insert({
        action: 'asaas_payment_reconciliation_cancelled',
        entity_type: 'asaas_payment',
        entity_id: id,
        metadata: { reason: reason ?? 'manual-reconciliation', http_status: r.status, response: body.slice(0, 500) },
      })
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
