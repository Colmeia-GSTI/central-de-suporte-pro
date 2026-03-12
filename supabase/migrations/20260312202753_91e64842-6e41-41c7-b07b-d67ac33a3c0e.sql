-- Fix missing profiles for existing auth users
INSERT INTO public.profiles (user_id, full_name, email)
SELECT au.id, COALESCE(au.raw_user_meta_data->>'full_name', au.email), au.email
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Safety net: auto-create profile before push subscription insert
CREATE OR REPLACE FUNCTION public.ensure_profile_before_push_sub()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.user_id) THEN
        INSERT INTO public.profiles (user_id, full_name, email)
        SELECT NEW.user_id, COALESCE(au.raw_user_meta_data->>'full_name', au.email), au.email
        FROM auth.users au
        WHERE au.id = NEW.user_id
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_profile_before_push ON public.push_subscriptions;
CREATE TRIGGER ensure_profile_before_push
    BEFORE INSERT ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_profile_before_push_sub();