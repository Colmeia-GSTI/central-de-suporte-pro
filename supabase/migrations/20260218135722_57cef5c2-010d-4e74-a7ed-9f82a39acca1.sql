
-- 1. Add 'suspended' to contract_status enum
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'suspended';

-- 2. Add 'lost' and 'renegotiated' to invoice_status enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'renegotiated';

-- 3. Create contract state machine trigger
CREATE OR REPLACE FUNCTION public.validate_contract_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if status is actually changing
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Define allowed transitions
  -- active -> expired, cancelled, suspended
  -- suspended -> active, cancelled
  -- pending -> active, cancelled
  -- expired -> (no transitions allowed)
  -- cancelled -> (no transitions allowed)
  
  IF OLD.status = 'active' AND NEW.status IN ('expired', 'cancelled', 'suspended') THEN
    RETURN NEW;
  ELSIF OLD.status = 'suspended' AND NEW.status IN ('active', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('active', 'cancelled') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Transição de status inválida para contrato: % -> %', OLD.status, NEW.status;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_contract_status_change
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_contract_status_transition();

-- 4. Update existing invoice state machine to include new states
-- Drop and recreate the invoice trigger to handle 'lost' and 'renegotiated'
CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transitions:
  -- pending -> paid, overdue, cancelled, renegotiated, lost
  -- overdue -> paid, cancelled, renegotiated, lost
  -- paid -> cancelled
  -- cancelled -> (none)
  -- renegotiated -> (none)
  -- lost -> (none)
  
  IF OLD.status = 'pending' AND NEW.status IN ('paid', 'overdue', 'cancelled', 'renegotiated', 'lost') THEN
    RETURN NEW;
  ELSIF OLD.status = 'overdue' AND NEW.status IN ('paid', 'cancelled', 'renegotiated', 'lost') THEN
    RETURN NEW;
  ELSIF OLD.status = 'paid' AND NEW.status = 'cancelled' THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Transição de status inválida para fatura: % -> %', OLD.status, NEW.status;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;
