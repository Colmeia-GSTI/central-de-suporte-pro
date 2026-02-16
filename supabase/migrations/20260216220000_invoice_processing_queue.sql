-- Migration: Invoice Processing Queue System
-- Description: Automatic retry queue with exponential backoff for failed invoice processing

-- CREATE TABLE FOR PROCESSING QUEUE
CREATE TABLE IF NOT EXISTS public.invoice_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- Queue status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Retry configuration
  attempt_number INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,

  -- Processing type
  process_type TEXT NOT NULL DEFAULT 'full'
    CHECK (process_type IN ('full', 'boleto', 'nfse', 'email')),

  -- Next retry timing
  next_retry_at TIMESTAMPTZ,
  base_delay_seconds INTEGER DEFAULT 2,
  backoff_multiplier DECIMAL(3,2) DEFAULT 2.0,

  -- Error tracking
  last_error TEXT,
  error_code TEXT,

  -- Processing options (JSON)
  processing_options JSONB DEFAULT '{}',

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- CREATE INDEXES FOR PERFORMANCE
CREATE INDEX idx_invoice_processing_queue_status
  ON public.invoice_processing_queue(status);

CREATE INDEX idx_invoice_processing_queue_next_retry
  ON public.invoice_processing_queue(next_retry_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX idx_invoice_processing_queue_invoice_id
  ON public.invoice_processing_queue(invoice_id);

CREATE INDEX idx_invoice_processing_queue_created_at
  ON public.invoice_processing_queue(created_at DESC);

-- ENABLE RLS
ALTER TABLE public.invoice_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Financial can view queue" ON public.invoice_processing_queue
  FOR SELECT USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Financial can manage queue" ON public.invoice_processing_queue
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

-- FUNCTION: Calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION public.calculate_next_retry_time(
  p_attempt_number INTEGER,
  p_base_delay_seconds INTEGER DEFAULT 2,
  p_backoff_multiplier DECIMAL DEFAULT 2.0
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_delay_seconds INTEGER;
BEGIN
  -- Calculate delay: base * (multiplier ^ attempt)
  v_delay_seconds := ROUND(
    p_base_delay_seconds * POWER(p_backoff_multiplier, p_attempt_number)
  )::INTEGER;

  -- Cap maximum delay at 10 minutes (600 seconds)
  v_delay_seconds := LEAST(v_delay_seconds, 600);

  RETURN now() + (v_delay_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- FUNCTION: Enqueue invoice for processing
CREATE OR REPLACE FUNCTION public.enqueue_invoice_for_processing(
  p_invoice_id UUID,
  p_process_type TEXT DEFAULT 'full',
  p_processing_options JSONB DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 5
)
RETURNS void AS $$
DECLARE
  v_next_retry TIMESTAMPTZ;
BEGIN
  v_next_retry := now(); -- First retry immediate

  INSERT INTO public.invoice_processing_queue (
    invoice_id,
    process_type,
    processing_options,
    max_attempts,
    next_retry_at,
    status,
    attempt_number
  )
  VALUES (
    p_invoice_id,
    p_process_type,
    COALESCE(p_processing_options, '{}'),
    p_max_attempts,
    v_next_retry,
    'pending',
    0
  )
  ON CONFLICT (invoice_id) DO UPDATE SET
    status = 'pending',
    next_retry_at = v_next_retry,
    attempt_number = 0,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FUNCTION: Handle processing failure with retry scheduling
CREATE OR REPLACE FUNCTION public.handle_processing_failure(
  p_queue_id UUID,
  p_error_message TEXT,
  p_error_code TEXT
)
RETURNS void AS $$
DECLARE
  v_queue RECORD;
  v_next_retry TIMESTAMPTZ;
  v_new_status TEXT;
BEGIN
  -- Get queue record
  SELECT * INTO v_queue FROM public.invoice_processing_queue
  WHERE id = p_queue_id;

  IF v_queue IS NULL THEN
    RETURN;
  END IF;

  -- Check if should retry
  IF v_queue.attempt_number < v_queue.max_attempts THEN
    -- Calculate next retry time
    v_next_retry := public.calculate_next_retry_time(
      v_queue.attempt_number,
      v_queue.base_delay_seconds,
      v_queue.backoff_multiplier
    );
    v_new_status := 'pending';
  ELSE
    -- Max attempts reached
    v_next_retry := NULL;
    v_new_status := 'failed';
  END IF;

  -- Update queue
  UPDATE public.invoice_processing_queue
  SET
    status = v_new_status,
    attempt_number = attempt_number + 1,
    next_retry_at = v_next_retry,
    last_error = p_error_message,
    error_code = p_error_code,
    updated_at = now()
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT PERMISSIONS
GRANT SELECT ON public.invoice_processing_queue TO authenticated;
GRANT INSERT ON public.invoice_processing_queue TO authenticated;
GRANT UPDATE ON public.invoice_processing_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_retry_time TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_invoice_for_processing TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_processing_failure TO authenticated;
