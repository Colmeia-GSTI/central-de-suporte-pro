-- Table for client notification rules
CREATE TABLE public.client_notification_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    notify_on_critical boolean NOT NULL DEFAULT true,
    notify_on_warning boolean NOT NULL DEFAULT true,
    notify_on_info boolean NOT NULL DEFAULT false,
    notify_email boolean NOT NULL DEFAULT true,
    notify_push boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(client_id, user_id)
);

-- Table for uptime history
CREATE TABLE public.uptime_history (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id uuid NOT NULL REFERENCES public.monitored_devices(id) ON DELETE CASCADE,
    is_online boolean NOT NULL,
    uptime_percent numeric,
    checked_at timestamp with time zone NOT NULL DEFAULT now(),
    response_time_ms integer
);

-- Create index for faster queries
CREATE INDEX idx_uptime_history_device_checked ON public.uptime_history(device_id, checked_at DESC);
CREATE INDEX idx_uptime_history_checked ON public.uptime_history(checked_at DESC);

-- Table for escalation settings
CREATE TABLE public.alert_escalation_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
    escalation_minutes integer NOT NULL DEFAULT 30,
    escalate_to_role text NOT NULL DEFAULT 'manager',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add escalation tracking to alerts
ALTER TABLE public.monitoring_alerts 
ADD COLUMN escalated_at timestamp with time zone,
ADD COLUMN escalated_to uuid;

-- Enable RLS
ALTER TABLE public.client_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_escalation_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_notification_rules
CREATE POLICY "Staff can view notification rules"
ON public.client_notification_rules FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert notification rules"
ON public.client_notification_rules FOR INSERT
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update notification rules"
ON public.client_notification_rules FOR UPDATE
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can delete notification rules"
ON public.client_notification_rules FOR DELETE
USING (is_staff(auth.uid()));

-- RLS policies for uptime_history
CREATE POLICY "Staff can view uptime history"
ON public.uptime_history FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert uptime history"
ON public.uptime_history FOR INSERT
WITH CHECK (is_staff(auth.uid()));

-- RLS policies for alert_escalation_settings
CREATE POLICY "Admins can manage escalation settings"
ON public.alert_escalation_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view escalation settings"
ON public.alert_escalation_settings FOR SELECT
USING (is_staff(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_client_notification_rules_updated_at
    BEFORE UPDATE ON public.client_notification_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_alert_escalation_settings_updated_at
    BEFORE UPDATE ON public.alert_escalation_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();