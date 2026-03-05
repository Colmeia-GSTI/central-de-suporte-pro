-- Confirmar o email do usuário manualmente
UPDATE auth.users 
SET email_confirmed_at = now(), 
    updated_at = now()
WHERE id = '801fb04d-48b8-42be-8307-a9ac21672a52' 
  AND email_confirmed_at IS NULL;

-- Garantir que o perfil existe
INSERT INTO public.profiles (user_id, full_name, email)
VALUES (
  '801fb04d-48b8-42be-8307-a9ac21672a52',
  'JOVANE LUCIA MIGNONI',
  'jovane@capasemu.com.brjo'
)
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email;