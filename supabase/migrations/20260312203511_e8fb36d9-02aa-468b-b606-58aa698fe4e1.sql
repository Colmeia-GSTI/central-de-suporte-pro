-- Update handle_new_user to also assign default 'client' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Create profile
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 
      NEW.email
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Assign default 'client' role if no role exists yet
    -- Edge functions (create-user, create-client-user) will override this with the correct role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;