

## Plano: Criar Primeiro Usuário Administrador

### Contexto do Problema
O sistema está vazio porque é um projeto remixado. Existe um "problema do ovo e da galinha":
- A edge function `create-user` só pode ser usada por **admins existentes**
- O formulário de registro (`/register`) cria usuários com role `technician` por padrão (via trigger `handle_new_user`)
- Sem um admin, não há como criar outros admins pelo sistema

### Solução Proposta

#### 1. Criar Edge Function Especial para Bootstrap
Criar uma função `bootstrap-admin` que:
- Só funciona quando **NÃO existem usuários admin** no sistema
- Cria o primeiro administrador de forma segura
- Se auto-desativa após o primeiro uso (verificação na própria função)

**Segurança garantida:**
- Verifica se já existe algum admin antes de executar
- Retorna erro 403 se já houver admins cadastrados
- Valida entrada com mesmos padrões do `create-user`

#### 2. Criar Página de Setup Inicial
Uma página `/setup` que:
- Verifica se o sistema precisa de configuração inicial
- Exibe formulário para criar o primeiro admin
- Redireciona para login após criação bem-sucedida
- Fica inacessível após existir um admin

#### 3. Fluxo do Usuário
1. Acessar a URL `/setup`
2. Preencher: Nome completo, Email e Senha (mínimo 8 caracteres)
3. Clicar em "Criar Administrador"
4. Sistema cria usuário com role `admin`
5. Redirecionado para `/login`
6. Fazer login normalmente

### Vantagens desta Abordagem
- ✅ **Seguro**: Não expõe nenhuma credencial hardcoded
- ✅ **Auditável**: Logs registram a criação
- ✅ **Self-service**: Você controla seus próprios dados
- ✅ **Único uso**: Não pode ser explorado depois

### O que será criado
| Componente | Descrição |
|------------|-----------|
| `supabase/functions/bootstrap-admin/index.ts` | Edge function segura para primeiro admin |
| `src/pages/Setup.tsx` | Página de configuração inicial |
| Rota `/setup` no App.tsx | Acesso à página de setup |

