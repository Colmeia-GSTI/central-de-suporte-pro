-- Create email_settings table (singleton for global config)
CREATE TABLE public.email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#f59e0b',
  secondary_color TEXT DEFAULT '#1f2937',
  footer_text TEXT DEFAULT 'Este é um email automático. Em caso de dúvidas, entre em contato.',
  show_social_links BOOLEAN DEFAULT false,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create email_templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_settings
CREATE POLICY "Staff can view email settings"
  ON public.email_settings FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage email settings"
  ON public.email_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS policies for email_templates
CREATE POLICY "Staff can view email templates"
  ON public.email_templates FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create storage bucket for email assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for email-assets bucket
CREATE POLICY "Public can view email assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'email-assets');

CREATE POLICY "Admins can upload email assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update email assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete email assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'email-assets' AND has_role(auth.uid(), 'admin'));

-- Insert default email settings
INSERT INTO public.email_settings (id, footer_text)
VALUES (gen_random_uuid(), 'Este é um email automático do sistema Colmeia. Em caso de dúvidas, entre em contato.');

-- Insert default templates
INSERT INTO public.email_templates (template_type, name, subject_template, html_template) VALUES
('nfse', 'Compartilhamento de NFS-e', 'NFS-e #{{nfse_number}} - {{client_name}}', '<h2>Nota Fiscal de Serviço Eletrônica</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Segue em anexo a NFS-e nº <strong>{{nfse_number}}</strong> referente à competência <strong>{{competencia}}</strong>.</p><p><strong>Valor:</strong> {{valor}}</p><p>{{#pdf_url}}<a href="{{pdf_url}}">Clique aqui para baixar o PDF</a>{{/pdf_url}}</p><p>Atenciosamente,<br>Equipe Financeira</p>'),

('ticket_created', 'Chamado Criado', '[Chamado #{{ticket_number}}] {{title}}', '<h2>Novo Chamado Aberto</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Seu chamado foi registrado com sucesso!</p><p><strong>Número:</strong> #{{ticket_number}}<br><strong>Título:</strong> {{title}}<br><strong>Prioridade:</strong> {{priority}}<br><strong>Status:</strong> {{status}}</p><p>{{#portal_url}}<a href="{{portal_url}}">Acompanhe seu chamado aqui</a>{{/portal_url}}</p><p>Atenciosamente,<br>Equipe de Suporte</p>'),

('ticket_updated', 'Chamado Atualizado', '[Chamado #{{ticket_number}}] Atualização - {{title}}', '<h2>Atualização do Chamado</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Seu chamado foi atualizado.</p><p><strong>Número:</strong> #{{ticket_number}}<br><strong>Título:</strong> {{title}}<br><strong>Novo Status:</strong> {{status}}</p><p>{{#portal_url}}<a href="{{portal_url}}">Acompanhe seu chamado aqui</a>{{/portal_url}}</p><p>Atenciosamente,<br>Equipe de Suporte</p>'),

('ticket_commented', 'Novo Comentário no Chamado', '[Chamado #{{ticket_number}}] Novo comentário - {{title}}', '<h2>Novo Comentário</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Um novo comentário foi adicionado ao seu chamado:</p><p><strong>Número:</strong> #{{ticket_number}}<br><strong>Título:</strong> {{title}}</p><blockquote style="border-left: 3px solid #f59e0b; padding-left: 15px; margin: 15px 0;">{{comment}}</blockquote><p>{{#portal_url}}<a href="{{portal_url}}">Responda aqui</a>{{/portal_url}}</p><p>Atenciosamente,<br>Equipe de Suporte</p>'),

('ticket_resolved', 'Chamado Resolvido', '[Chamado #{{ticket_number}}] Resolvido - {{title}}', '<h2>Chamado Resolvido</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Seu chamado foi resolvido!</p><p><strong>Número:</strong> #{{ticket_number}}<br><strong>Título:</strong> {{title}}</p><p>Ficamos à disposição para qualquer dúvida.</p><p>{{#portal_url}}<a href="{{portal_url}}">Veja os detalhes aqui</a>{{/portal_url}}</p><p>Atenciosamente,<br>Equipe de Suporte</p>'),

('invoice_reminder', 'Lembrete de Fatura', 'Lembrete: Fatura #{{invoice_number}} vence em {{days_until_due}} dias', '<h2>Lembrete de Vencimento</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Este é um lembrete de que a fatura abaixo está próxima do vencimento:</p><p><strong>Fatura:</strong> #{{invoice_number}}<br><strong>Valor:</strong> {{amount}}<br><strong>Vencimento:</strong> {{due_date}}</p><p>Por favor, providencie o pagamento para evitar inconvenientes.</p><p>Atenciosamente,<br>Equipe Financeira</p>'),

('invoice_payment', 'Dados de Pagamento', 'Fatura #{{invoice_number}} - Dados para Pagamento', '<h2>Dados para Pagamento</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Segue os dados para pagamento da fatura:</p><p><strong>Fatura:</strong> #{{invoice_number}}<br><strong>Valor:</strong> {{amount}}<br><strong>Vencimento:</strong> {{due_date}}</p>{{#boleto_url}}<p><strong>Boleto:</strong> <a href="{{boleto_url}}">Clique aqui para acessar</a></p><p><strong>Código de barras:</strong><br><code>{{boleto_barcode}}</code></p>{{/boleto_url}}{{#pix_code}}<p><strong>PIX Copia e Cola:</strong><br><code style="word-break: break-all;">{{pix_code}}</code></p>{{/pix_code}}<p>Atenciosamente,<br>Equipe Financeira</p>'),

('invoice_collection_reminder', 'Cobrança - Lembrete', 'Lembrete de Fatura Pendente #{{invoice_number}}', '<h2>Lembrete de Fatura Pendente</h2><p>Olá <strong>{{client_name}}</strong>,</p><p>Identificamos que a fatura abaixo encontra-se pendente:</p><p><strong>Fatura:</strong> #{{invoice_number}}<br><strong>Valor:</strong> {{amount}}<br><strong>Vencimento:</strong> {{due_date}}</p><p>Por favor, regularize o pagamento para evitar interrupções nos serviços.</p><p>Em caso de dúvidas, entre em contato conosco.</p><p>Atenciosamente,<br>Equipe Financeira</p>'),

('invoice_collection_urgent', 'Cobrança - Urgente', 'URGENTE: Fatura Vencida #{{invoice_number}}', '<h2 style="color: #dc2626;">⚠️ Fatura Vencida</h2><p>Prezado(a) <strong>{{client_name}}</strong>,</p><p>Sua fatura abaixo está vencida e ainda não foi paga:</p><p><strong>Fatura:</strong> #{{invoice_number}}<br><strong>Valor:</strong> {{amount}}<br><strong>Vencimento:</strong> {{due_date}}</p><p><strong>Solicitamos a regularização imediata para evitar a suspensão dos serviços.</strong></p><p>Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.</p><p>Atenciosamente,<br>Equipe Financeira</p>'),

('invoice_collection_final', 'Cobrança - Aviso Final', 'AVISO FINAL: Fatura em Atraso #{{invoice_number}}', '<h2 style="color: #dc2626;">🚨 Aviso Final</h2><p>Prezado(a) <strong>{{client_name}}</strong>,</p><p>Este é o <strong>último aviso</strong> referente à fatura abaixo:</p><p><strong>Fatura:</strong> #{{invoice_number}}<br><strong>Valor:</strong> {{amount}}<br><strong>Vencimento:</strong> {{due_date}}</p><p><strong style="color: #dc2626;">Caso o pagamento não seja regularizado em até 48 horas, seremos obrigados a tomar medidas administrativas.</strong></p><p>Entre em contato conosco para negociar.</p><p>Atenciosamente,<br>Equipe Financeira</p>'),

('certificate_expiry_warning', 'Certificado Expirando - 30 dias', '📅 Certificado Digital expira em {{days_remaining}} dias', '<h2>Certificado Digital Expirando</h2><p>O certificado digital da empresa <strong>{{company_name}}</strong> expira em <strong>{{days_remaining}} dias</strong>.</p><p><strong>CNPJ:</strong> {{cnpj}}<br><strong>Validade:</strong> {{expiry_date}}</p><p>Planeje a renovação com antecedência para evitar interrupções na emissão de NFS-e.</p><p>Atenciosamente,<br>Sistema Colmeia</p>'),

('certificate_expiry_critical', 'Certificado Expirando - 7 dias', '⚠️ URGENTE: Certificado Digital expira em {{days_remaining}} dias', '<h2 style="color: #dc2626;">⚠️ Certificado Expirando</h2><p>O certificado digital da empresa <strong>{{company_name}}</strong> expira em <strong>{{days_remaining}} dia(s)</strong>.</p><p><strong>CNPJ:</strong> {{cnpj}}<br><strong>Validade:</strong> {{expiry_date}}</p><p><strong style="color: #dc2626;">Renove imediatamente para evitar interrupção na emissão de NFS-e!</strong></p><p>Atenciosamente,<br>Sistema Colmeia</p>'),

('certificate_expiry_expired', 'Certificado Expirado', '🚨 CERTIFICADO EXPIRADO - Ação Imediata Necessária', '<h2 style="color: #dc2626;">🚨 Certificado Digital Expirado</h2><p>O certificado digital da empresa <strong>{{company_name}}</strong> <strong style="color: #dc2626;">EXPIROU!</strong></p><p><strong>CNPJ:</strong> {{cnpj}}<br><strong>Validade:</strong> {{expiry_date}}</p><p><strong style="color: #dc2626;">A emissão de NFS-e está comprometida. Providencie a renovação imediatamente.</strong></p><p>Atenciosamente,<br>Sistema Colmeia</p>'),

('alert', 'Alerta de Monitoramento', '{{level}}: {{title}}', '<h2>Alerta de Monitoramento</h2><p><strong>Nível:</strong> {{level}}<br><strong>Título:</strong> {{title}}</p><p><strong>Mensagem:</strong></p><p>{{message}}</p><p><strong>Dispositivo:</strong> {{device_name}}<br><strong>Cliente:</strong> {{client_name}}</p><p>Atenciosamente,<br>Sistema Colmeia</p>');

-- Create trigger for updated_at
CREATE TRIGGER update_email_settings_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();