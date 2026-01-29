
# Plano: Unificar Perfil e Corrigir UX de Permissão Push

## Problemas Identificados

### 1. Erro "Permissão negada"
O toast vermelho aparece quando o navegador nega a permissão de notificação. Isso acontece quando:
- O usuário já negou permissão anteriormente no navegador
- O navegador está configurado para bloquear notificações
- O site não está em HTTPS (push requer conexão segura)

### 2. Duplicação de Interfaces de Perfil
Atualmente existem dois locais para edição de perfil:
- **`/profile`** - Página completa com dados pessoais, notificações e permissões
- **`/settings` > Meu Perfil** - Apenas preferências de notificação (mais completa que a página /profile para notificações)

### 3. Inconsistência de Funcionalidades
| Funcionalidade | /profile | /settings > Meu Perfil |
|----------------|----------|------------------------|
| Dados pessoais (nome, telefone) | Sim | Nao |
| Notificações Email/WhatsApp/Telegram | Sim (básico) | Sim (avançado) |
| Push Nativo do navegador | Nao | Sim |
| Push Toast em tempo real | Nao | Sim |
| Som de notificação | Nao | Sim |
| Tipos de alerta (crítico/aviso/info) | Nao | Sim |
| Visualização de permissões | Sim | Nao |

---

## Solução Proposta

### Abordagem: Unificar tudo na página `/profile`

Centralizar todas as configurações do usuário na página `/profile`, tornando-a a única fonte de verdade para:
- Dados pessoais
- Todas as preferências de notificação
- Visualização de permissões

A aba "Meu Perfil" em `/settings` será **removida** ou redirecionará para `/profile`.

---

## Etapas de Implementação

### Etapa 1: Melhorar UX de Permissão Push Negada
- Ao invés de apenas mostrar um toast vermelho, adicionar orientações claras
- Detectar se a permissão está bloqueada (`Notification.permission === "denied"`)
- Mostrar instruções específicas para reabilitar no navegador

### Etapa 2: Unificar ProfilePage
Reorganizar `/profile` em abas mais completas:
- **Dados Pessoais**: Nome, telefone, email, avatar
- **Notificações**: Todos os canais (incluindo Push Nativo, Som, tipos de alerta)
- **Segurança**: Alterar senha (futuro)
- **Permissões**: Visualização do que o usuário pode acessar

### Etapa 3: Remover Aba "Meu Perfil" de Settings
- Remover a aba "Meu Perfil" da página de Configurações
- A página de configurações fica apenas para administradores configurarem o sistema
- Adicionar link de acesso rápido ao perfil na sidebar (já existe)

### Etapa 4: Atualizar Sidebar e Navegação
- O link no footer da sidebar já leva para `/profile` (correto)
- Garantir que o perfil seja acessível a todos os usuários

---

## Detalhes Técnicos

### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/profile/ProfilePage.tsx` | Expandir com todas as preferências de notificação |
| `src/pages/settings/SettingsPage.tsx` | Remover aba "Meu Perfil" |
| `src/hooks/usePushNotifications.ts` | Melhorar feedback quando permissão negada |
| `src/components/settings/profile/NotificationPreferencesForm.tsx` | Mover lógica para ProfilePage |

### Novo Fluxo de Permissão Push

```text
Usuario clica "Ativar Push"
        |
        v
+-------------------+
| Verificar status  |
| da permissão      |
+--------+----------+
         |
    +----+----+----+
    |         |    |
"default" "granted" "denied"
    |         |       |
    v         v       v
Solicitar   Já está   Mostrar card
permissão   ativo!    de instrução
    |                 "Como reativar"
    v
+------------+
| Navegador  |
| pergunta   |
+-----+------+
      |
  +---+---+
  |       |
Permitir  Bloquear
  |          |
  v          v
Registrar   Mostrar
subscrição  instrução
```

### UX Melhorada para Permissão Negada

Ao invés do toast vermelho genérico, mostrar:
- Card informativo explicando que a permissão foi bloqueada
- Instruções passo-a-passo para o navegador específico
- Botão para verificar novamente

---

## Benefícios

1. **Experiência unificada**: Um único local para todas as configurações pessoais
2. **Menos confusão**: Usuário sabe exatamente onde ir para editar seu perfil
3. **Melhor feedback**: Instruções claras quando push não funciona
4. **Separação clara**: Settings = configurações do sistema | Profile = configurações pessoais
