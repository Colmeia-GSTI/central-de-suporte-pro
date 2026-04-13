

## Revisão: Configurações de Notificações Push e Melhorias

### Problemas Encontrados

1. **Componente órfão (`NotificationPreferencesForm`)**: O arquivo `src/components/settings/profile/NotificationPreferencesForm.tsx` (521 linhas) não é importado em nenhum lugar do projeto. O `ProfilePage.tsx` reimplementa toda a mesma lógica inline. Isso gera duplicação de ~300 linhas.

2. **Preferências de alerta não são consultadas no backend**: Os tipos de alerta (critical, warning, ticket_new, etc.) são salvos apenas no `localStorage`. As Edge Functions (`notify-sla-breach`, `send-alert-notification`, `check-no-contact-tickets`) enviam notificações sem consultar essas preferências, tornando os switches de "Tipos de Alerta" ineficazes.

3. **Botão "Salvar" global salva apenas a aba ativa**: O botão "Salvar Alterações" no rodapé do ProfilePage persiste dados pessoais e preferências de canais, mas não dá feedback claro de que as preferências locais (push, som, alertas) foram salvas junto.

4. **`PushPermissionBlockedCard` não aparece no `NotificationPreferencesForm`**: Apenas o ProfilePage mostra o card de permissão bloqueada. O componente de settings (que está órfão) não trata esse caso.

5. **Push "Testar" sem feedback de falha detalhada**: Se a Edge Function retorna `sent: 0` (assinatura existe no DB mas expirou no browser), o usuário vê "Nenhum dispositivo inscrito" sem orientação.

### Plano de Correção

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/settings/profile/NotificationPreferencesForm.tsx` | **Deletar** - componente órfão, nunca usado |
| 2 | `src/pages/profile/ProfilePage.tsx` | Extrair a seção de notificações para um componente reutilizável `NotificationSettings.tsx` para reduzir o tamanho do arquivo (711 linhas) |
| 3 | `src/components/profile/NotificationSettings.tsx` | **Criar** - componente extraído do ProfilePage com toda a lógica de canais + alertas + push |
| 4 | `src/pages/profile/ProfilePage.tsx` | Importar e usar `NotificationSettings` na aba de notificações, reduzindo o arquivo para ~400 linhas |
| 5 | `src/pages/profile/ProfilePage.tsx` | Melhorar feedback do "Testar Push" quando `sent: 0` - sugerir re-ativar assinatura |
| 6 | `src/pages/profile/ProfilePage.tsx` | Adicionar toast de confirmação específico ao salvar preferências locais (localStorage) |

### Melhorias Sugeridas (além das correções)

1. **Persistir preferências de alerta no banco** (futura): Migrar `alert_critical`, `alert_warning`, etc. do localStorage para a tabela `profiles`, permitindo que as Edge Functions respeitem as preferências do usuário.
2. **Indicador visual de dispositivos registrados**: Mostrar quantos dispositivos o usuário tem com push ativo (consulta `push_subscriptions`).
3. **Horário de silêncio (Do Not Disturb)**: Permitir configurar faixas horárias onde notificações push/som são suprimidas.
4. **Validação de WhatsApp/Telegram**: Validar formato do número de WhatsApp e Chat ID do Telegram antes de salvar.

### Resultado

- Código limpo sem duplicações
- Feedback de push mais claro para o usuário
- Componente de notificações reutilizável e testável
- Base preparada para futura integração backend das preferências de alerta

