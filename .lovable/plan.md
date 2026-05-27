## Mover botão "Configurar Hermes Bot" para local fácil de achar no celular

### O que muda
- **Remover** o card temporário da página `/settings/users` (onde está hoje, escondido no meio da lista).
- **Adicionar** o mesmo card temporário no **topo da página principal de Configurações** (`/settings`, arquivo `src/pages/settings/SettingsPage.tsx`).
- Assim, ao tocar em **Configurações** no menu, o botão amarelo "Configurar Hermes Bot (temporário)" aparece já como o primeiro item da tela — 1 toque a menos.

### Comportamento
- Card visível **apenas para admin** (mesma verificação `isAdmin` já usada).
- Botão "Executar setup" chama a edge function `setup-hermes-bot`.
- Toast de sucesso: "Hermes Bot configurado: role technician, senha no Vault".
- Toast de erro: mostra a mensagem retornada.
- Comentário no código: `BOTÃO TEMPORÁRIO — REMOVER APÓS SETUP DO HERMES BOT`.

### Arquivos
- `src/pages/settings/SettingsPage.tsx` — adicionar o card no topo.
- `src/pages/settings/UsersPage.tsx` — remover o card (e imports/handler temporários).

### O que NÃO muda
- Edge function `setup-hermes-bot` permanece igual.
- RPCs do Hermes, RLS, migrations: nada é tocado.
- Nenhum componente novo é criado — reuso de Button, Card, toast (sonner).

### Como você vai usar
1. Abrir menu → **Configurações**
2. Card amarelo já aparece no topo → toque em **"Executar setup"**
3. Aguardar o toast verde de sucesso
4. Me avisar para eu remover tudo (botão + edge function + RPC do vault)