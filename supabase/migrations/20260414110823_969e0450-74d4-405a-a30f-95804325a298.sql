
-- ==========================================
-- 1. Fix storage_config: restrict ALL policy to authenticated role
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage storage config" ON public.storage_config;
CREATE POLICY "Admins can manage storage config"
  ON public.storage_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ==========================================
-- 2. Fix nfse_cancellation_log: replace public INSERT/UPDATE with service_role
-- ==========================================
DROP POLICY IF EXISTS "Service can insert cancellation logs" ON public.nfse_cancellation_log;
CREATE POLICY "Service can insert cancellation logs"
  ON public.nfse_cancellation_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service can update cancellation logs" ON public.nfse_cancellation_log;
CREATE POLICY "Service can update cancellation logs"
  ON public.nfse_cancellation_log
  FOR UPDATE
  TO service_role
  USING (true);

-- ==========================================
-- 3. Fix function search_path on 4 functions
-- ==========================================
CREATE OR REPLACE FUNCTION public.generate_slug(title text)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path = public
AS $function$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          unaccent(title),
          '[^a-zA-Z0-9\s-]', '', 'g'
        ),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_article_slug()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_article_helpful_counts()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_helpful THEN
      UPDATE public.knowledge_articles SET helpful_count = helpful_count + 1 WHERE id = NEW.article_id;
    ELSE
      UPDATE public.knowledge_articles SET not_helpful_count = not_helpful_count + 1 WHERE id = NEW.article_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_helpful IS DISTINCT FROM NEW.is_helpful THEN
    IF NEW.is_helpful THEN
      UPDATE public.knowledge_articles SET helpful_count = helpful_count + 1, not_helpful_count = GREATEST(0, not_helpful_count - 1) WHERE id = NEW.article_id;
    ELSE
      UPDATE public.knowledge_articles SET helpful_count = GREATEST(0, helpful_count - 1), not_helpful_count = not_helpful_count + 1 WHERE id = NEW.article_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_helpful THEN
      UPDATE public.knowledge_articles SET helpful_count = GREATEST(0, helpful_count - 1) WHERE id = OLD.article_id;
    ELSE
      UPDATE public.knowledge_articles SET not_helpful_count = GREATEST(0, not_helpful_count - 1) WHERE id = OLD.article_id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_category_article_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.knowledge_category_id IS DISTINCT FROM NEW.knowledge_category_id) THEN
    UPDATE public.knowledge_categories 
    SET article_count = GREATEST(0, article_count - 1)
    WHERE id = OLD.knowledge_category_id;
  END IF;
  
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.knowledge_category_id IS DISTINCT FROM NEW.knowledge_category_id) THEN
    UPDATE public.knowledge_categories 
    SET article_count = article_count + 1
    WHERE id = NEW.knowledge_category_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
