INSERT INTO email_templates (template_type, name, subject_template, html_template, is_active)
VALUES (
  'ticket_no_contact',
  'Chamado Sem Contato (48h+)',
  '⚠️ Chamado #{{ticket_number}} sem contato há 48h+',
  '<h2>Atenção: Chamado requer ação urgente</h2>
<p>O chamado <strong>#{{ticket_number}} - {{title}}</strong> está sem contato com o cliente há mais de 48 horas.</p>
<p><strong>Cliente:</strong> {{client_name}}</p>
<p><strong>Status atual:</strong> {{status}}</p>
<p>Por favor, verifique a situação e tente contato ou atualize o status do chamado.</p>',
  true
)
ON CONFLICT (template_type) DO NOTHING;