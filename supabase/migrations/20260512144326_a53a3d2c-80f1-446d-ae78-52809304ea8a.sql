-- Confirm email
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'e5f1264f-a374-4ca6-87b7-459ba4d7be4e';

-- Ensure profile exists (handle_new_user trigger may have run; upsert just in case)
INSERT INTO public.profiles (user_id, full_name, email)
VALUES ('e5f1264f-a374-4ca6-87b7-459ba4d7be4e', '[E2E] Usuario Teste 2', 'e2e-test-2@colmeiagsti.com.br')
ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

-- Replace any default role with 'client'
DELETE FROM public.user_roles WHERE user_id = 'e5f1264f-a374-4ca6-87b7-459ba4d7be4e';
INSERT INTO public.user_roles (user_id, role) VALUES ('e5f1264f-a374-4ca6-87b7-459ba4d7be4e', 'client');

-- Link contact to isolated client
INSERT INTO public.client_contacts (client_id, user_id, name, email, is_primary, is_active)
VALUES ('7709d726-9f3d-40bb-b384-a4eea168b621', 'e5f1264f-a374-4ca6-87b7-459ba4d7be4e', '[E2E] Usuario Teste 2', 'e2e-test-2@colmeiagsti.com.br', true, true);