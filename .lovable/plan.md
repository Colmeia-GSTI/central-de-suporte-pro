## Problema

Ao enviar convite para `qualidade@blendpf.com.br`, a função `invite-user` retornou **HTTP 409** com a mensagem "Já existe um usuário com esse email." O email já está registrado em `auth.users`, então o sistema bloqueia (comportamento correto para evitar duplicidade).

Além disso, encontrei um **bug** na mesma verificação: ela só lê o primeiro usuário do banco, deixando passar duplicatas na maioria dos casos.

## O que fazer

### 1. Corrigir o bug de verificação de usuário existente (`supabase/functions/invite-user/index.ts`)

Trocar a checagem quebrada:
```ts
const { data: existingUser } = await admin.auth.admin.listUsers({ perPage: 1 });
const userExists = existingUser?.users?.some((u) => u.email?.toLowerCase() === normalizedEmail);
```

Por uma paginação real (mesmo padrão já usado em `activate-invite-manually/index.ts`, linhas 47–53): iterar páginas de 200 usuários até encontrar o email ou esgotar. Isso garante que a proteção contra duplicidade funciona sempre.

### 2. Fazer deploy da função corrigida

`supabase--deploy_edge_functions` com `invite-user`.

### 3. Resolver o caso concreto do `qualidade@blendpf.com.br`

O email já existe como usuário. Para prosseguir, escolher uma destas ações **na tela de Usuários**:

- **Se é a mesma pessoa e ela só precisa entrar:** usar "Redefinir senha" no usuário existente (o email de reset chegará).
- **Se a pessoa perdeu acesso ao email de convite anterior:** usar "Ativar manualmente" (permite gerar uma senha na hora e entregar as credenciais).
- **Se é outra pessoa/foi cadastro errado:** excluir/anonimizar o usuário antigo e então reenviar o convite.

Não vou alterar nada do usuário existente sem seu OK — só a correção do bug da função.

## Fora do escopo

- Não altero frontend, banco de dados nem outros fluxos.
- Não removo/edito o usuário `qualidade@blendpf.com.br` sem confirmação.
