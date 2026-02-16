-- Migration: Invoice Numbering System
-- Description: Create sequential numbering system for invoices with customizable patterns

-- CREATE TABLE FOR INVOICE NUMBERING CONFIG
CREATE TABLE IF NOT EXISTS public.invoice_number_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,

  -- Numbering pattern: YYYY-XXXXX (year-sequence), XXXXXX (pure sequence), custom
  numbering_pattern TEXT DEFAULT 'YYYY-XXXXX',

  -- Current sequence counter
  current_sequence INTEGER DEFAULT 1,

  -- Optional prefix (ex: "FAT", "INV", "NF")
  prefix TEXT,

  -- Reset sequence at year boundary?
  year_reset BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Unique constraint: one config per client/contract combination
  UNIQUE(client_id, contract_id)
);

-- CREATE INDEXES
CREATE INDEX idx_invoice_number_config_client_id ON public.invoice_number_config(client_id);
CREATE INDEX idx_invoice_number_config_contract_id ON public.invoice_number_config(contract_id);

-- ENABLE RLS
ALTER TABLE public.invoice_number_config ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Financial can view numbering config" ON public.invoice_number_config
  FOR SELECT USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Financial can create numbering config" ON public.invoice_number_config
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Financial can update numbering config" ON public.invoice_number_config
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'financial') OR
    has_role(auth.uid(), 'manager')
  );

-- FUNCTION: Generate next invoice number with exponential backoff for concurrent calls
CREATE OR REPLACE FUNCTION public.generate_next_invoice_number(
  p_client_id UUID,
  p_contract_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_config RECORD;
  v_next_number INTEGER;
  v_current_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 3;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;

    -- Try to acquire lock and get config
    BEGIN
      SELECT *
      INTO v_config
      FROM public.invoice_number_config
      WHERE client_id = p_client_id
        AND (contract_id IS NULL OR contract_id = p_contract_id)
      FOR UPDATE NOWAIT;

      IF v_config IS NULL THEN
        -- Create default config if doesn't exist
        INSERT INTO public.invoice_number_config (
          client_id,
          contract_id,
          numbering_pattern,
          current_sequence,
          prefix,
          year_reset
        )
        VALUES (
          p_client_id,
          p_contract_id,
          'YYYY-XXXXX',
          1,
          NULL,
          false
        )
        ON CONFLICT DO NOTHING
        RETURNING *
        INTO v_config;

        -- If conflict on INSERT, retry to fetch
        IF v_config IS NULL THEN
          CONTINUE;
        END IF;

        v_next_number := 1;
      ELSE
        -- Check if should reset sequence (year_reset = true)
        IF v_config.year_reset THEN
          IF EXTRACT(YEAR FROM v_config.updated_at)::INTEGER < v_current_year THEN
            v_next_number := 1;
          ELSE
            v_next_number := v_config.current_sequence + 1;
          END IF;
        ELSE
          v_next_number := v_config.current_sequence + 1;
        END IF;

        -- Update sequence
        UPDATE public.invoice_number_config
        SET
          current_sequence = v_next_number,
          updated_at = NOW()
        WHERE id = v_config.id;
      END IF;

      RETURN v_next_number;

    EXCEPTION WHEN lock_not_available THEN
      -- Lock conflict - exponential backoff
      IF v_attempts >= v_max_attempts THEN
        RAISE EXCEPTION 'Could not acquire lock on invoice_number_config after % attempts', v_max_attempts;
      END IF;

      -- Wait with exponential backoff: 10ms, 20ms, 40ms
      PERFORM pg_sleep(0.01 * POWER(2, v_attempts - 1));
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- FUNCTION: Format invoice number based on pattern
CREATE OR REPLACE FUNCTION public.format_invoice_number(
  p_sequence INTEGER,
  p_pattern TEXT DEFAULT 'YYYY-XXXXX',
  p_prefix TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
  v_year TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  v_sequence_padded TEXT := LPAD(p_sequence::TEXT, 5, '0');
BEGIN
  -- Replace placeholders in pattern
  v_result := p_pattern;
  v_result := REPLACE(v_result, 'YYYY', v_year);
  v_result := REPLACE(v_result, 'XXXXX', v_sequence_padded);
  v_result := REPLACE(v_result, 'XXX', SUBSTRING(v_sequence_padded, 3, 5));

  -- Add prefix if provided
  IF p_prefix IS NOT NULL AND LENGTH(p_prefix) > 0 THEN
    v_result := p_prefix || '-' || v_result;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- FUNCTION: Validate invoice number uniqueness per client
CREATE OR REPLACE FUNCTION public.validate_invoice_number_uniqueness(
  p_client_id UUID,
  p_invoice_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.invoices
  WHERE client_id = p_client_id
    AND invoice_number = p_invoice_number
    AND status != 'cancelled';

  RETURN v_count = 0;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Auto-generate invoice number on insert
CREATE OR REPLACE FUNCTION public.trigger_auto_generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_next_number INTEGER;
  v_formatted_number TEXT;
BEGIN
  IF NEW.invoice_number IS NULL THEN
    v_next_number := public.generate_next_invoice_number(NEW.client_id, NEW.contract_id);
    NEW.invoice_number := v_next_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE TRIGGER
DROP TRIGGER IF EXISTS auto_generate_invoice_number_trigger ON public.invoices;
CREATE TRIGGER auto_generate_invoice_number_trigger
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_auto_generate_invoice_number();

-- GRANT PERMISSIONS
GRANT SELECT ON public.invoice_number_config TO authenticated;
GRANT INSERT ON public.invoice_number_config TO authenticated;
GRANT UPDATE ON public.invoice_number_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_next_invoice_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_invoice_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invoice_number_uniqueness TO authenticated;
