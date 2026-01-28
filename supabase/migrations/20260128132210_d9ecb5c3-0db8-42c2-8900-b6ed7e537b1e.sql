-- Create table for NFS-e event logs (granular activity timeline)
CREATE TABLE public.nfse_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfse_history_id UUID NOT NULL REFERENCES public.nfse_history(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'created', 'api_call', 'api_response', 'webhook', 'status_change', 'error', 'file_download', 'retry', 'cancelled'
  event_level TEXT NOT NULL DEFAULT 'info',  -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  details JSONB,  -- payload, response, error details
  correlation_id TEXT,  -- for tracing complete flow
  source TEXT,  -- 'frontend', 'asaas-nfse', 'webhook-asaas-nfse', 'poll-asaas-nfse-status'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_nfse_event_logs_nfse_id ON public.nfse_event_logs(nfse_history_id);
CREATE INDEX idx_nfse_event_logs_created ON public.nfse_event_logs(created_at DESC);
CREATE INDEX idx_nfse_event_logs_type ON public.nfse_event_logs(event_type);

-- Enable RLS
ALTER TABLE public.nfse_event_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Staff can view logs, system can insert
CREATE POLICY "Staff can view nfse event logs"
ON public.nfse_event_logs
FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Financial can manage nfse event logs"
ON public.nfse_event_logs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financial'::app_role));

-- Allow service role and system to insert logs (no auth for edge functions)
CREATE POLICY "System can insert event logs"
ON public.nfse_event_logs
FOR INSERT
WITH CHECK (auth.uid() IS NULL OR is_staff(auth.uid()));