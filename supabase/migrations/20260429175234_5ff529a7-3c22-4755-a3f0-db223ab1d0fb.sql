-- 1. Backfill em contact_phone existente (nullable -> NOT NULL DEFAULT '')
UPDATE public.tickets SET contact_phone = '' WHERE contact_phone IS NULL;
ALTER TABLE public.tickets ALTER COLUMN contact_phone SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN contact_phone SET DEFAULT '';

-- 2. Novas colunas
ALTER TABLE public.tickets
  ADD COLUMN contact_phone_is_whatsapp boolean NOT NULL DEFAULT false;

ALTER TABLE public.tickets
  ADD COLUMN monitored_device_id uuid
    REFERENCES public.monitored_devices(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN device_hostname_text text;

COMMENT ON COLUMN public.tickets.contact_phone IS
  'Telefone da pessoa que abriu o chamado (pode diferir do cadastro do cliente). Obrigatório no portal cliente. Tickets antigos preenchidos com string vazia.';
COMMENT ON COLUMN public.tickets.contact_phone_is_whatsapp IS
  'Se contact_phone tem WhatsApp ativo.';
COMMENT ON COLUMN public.tickets.monitored_device_id IS
  'Device monitorado vinculado ao chamado (dropdown estruturado). NULL se usuário escolheu hostname livre ou se não há device monitorado para o cliente.';
COMMENT ON COLUMN public.tickets.device_hostname_text IS
  'Hostname digitado livremente quando device não está no monitored_devices. Mutuamente exclusivo com monitored_device_id.';

-- 3. Constraint de coerência (XOR + ambos podem ser NULL)
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_device_xor_hostname
  CHECK (
    (monitored_device_id IS NULL OR device_hostname_text IS NULL)
  );

-- 4. Índice na FK
CREATE INDEX idx_tickets_monitored_device_id
  ON public.tickets(monitored_device_id) WHERE monitored_device_id IS NOT NULL;

-- 5. Policy RLS — portal cliente ler monitored_devices do próprio cliente
CREATE POLICY "Client read own monitored_devices"
  ON public.monitored_devices
  FOR SELECT
  USING (
    public.client_owns_record(auth.uid(), client_id)
  );