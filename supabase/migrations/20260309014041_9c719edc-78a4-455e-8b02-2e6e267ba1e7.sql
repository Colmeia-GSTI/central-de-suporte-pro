-- =====================================================
-- Knowledge Base Modernization Migration
-- =====================================================

-- 1. Add new columns to knowledge_articles
ALTER TABLE public.knowledge_articles 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS helpful_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS not_helpful_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS slug text,
ADD COLUMN IF NOT EXISTS excerpt text,
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS knowledge_category_id uuid;

-- 2. Create knowledge_categories table with hierarchy support
CREATE TABLE IF NOT EXISTS public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text,
  description text,
  icon text DEFAULT 'FolderOpen',
  parent_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  order_index integer DEFAULT 0,
  article_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create article_feedback table for voting
CREATE TABLE IF NOT EXISTS public.article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_helpful boolean NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (article_id, user_id)
);

-- 4. Add FK from knowledge_articles to knowledge_categories
ALTER TABLE public.knowledge_articles
ADD CONSTRAINT fk_knowledge_category 
FOREIGN KEY (knowledge_category_id) 
REFERENCES public.knowledge_categories(id) 
ON DELETE SET NULL;

-- 5. Function to generate slug from title
CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Trigger to auto-generate slug on insert/update
CREATE OR REPLACE FUNCTION set_article_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS article_slug_trigger ON public.knowledge_articles;
CREATE TRIGGER article_slug_trigger
BEFORE INSERT OR UPDATE ON public.knowledge_articles
FOR EACH ROW EXECUTE FUNCTION set_article_slug();

-- 7. Update existing articles with slugs
UPDATE public.knowledge_articles 
SET slug = generate_slug(title) || '-' || substring(id::text, 1, 8)
WHERE slug IS NULL;

-- 8. Trigger to update article_count in categories
CREATE OR REPLACE FUNCTION update_category_article_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrement old category count
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.knowledge_category_id IS DISTINCT FROM NEW.knowledge_category_id) THEN
    UPDATE public.knowledge_categories 
    SET article_count = GREATEST(0, article_count - 1)
    WHERE id = OLD.knowledge_category_id;
  END IF;
  
  -- Increment new category count
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS article_category_count_trigger ON public.knowledge_articles;
CREATE TRIGGER article_category_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_articles
FOR EACH ROW EXECUTE FUNCTION update_category_article_count();

-- 9. Function to update helpful counts
CREATE OR REPLACE FUNCTION update_article_helpful_counts()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feedback_count_trigger ON public.article_feedback;
CREATE TRIGGER feedback_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.article_feedback
FOR EACH ROW EXECUTE FUNCTION update_article_helpful_counts();

-- 10. Enable RLS
ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_feedback ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies for knowledge_categories
CREATE POLICY "Staff can manage categories" ON public.knowledge_categories
FOR ALL USING (is_staff(auth.uid()));

CREATE POLICY "Public can view active categories" ON public.knowledge_categories
FOR SELECT USING (is_active = true);

-- 12. RLS Policies for article_feedback
CREATE POLICY "Users can manage own feedback" ON public.article_feedback
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all feedback" ON public.article_feedback
FOR SELECT USING (is_staff(auth.uid()));

-- 13. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_slug ON public.knowledge_articles(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_is_pinned ON public.knowledge_articles(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON public.knowledge_articles(knowledge_category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags ON public.knowledge_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_parent ON public.knowledge_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_slug ON public.knowledge_categories(slug);
CREATE INDEX IF NOT EXISTS idx_article_feedback_article ON public.article_feedback(article_id);

-- 14. Full-text search index
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_fts ON public.knowledge_articles 
USING GIN(to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content, '')));

-- 15. Insert default categories
INSERT INTO public.knowledge_categories (name, slug, description, icon, order_index) VALUES
('Infraestrutura', 'infraestrutura', 'Servidores, storage, virtualização', 'Server', 1),
('Rede', 'rede', 'Switches, roteadores, firewall, VPN', 'Network', 2),
('E-mail', 'email', 'Configuração de clientes, problemas de envio/recebimento', 'Mail', 3),
('Segurança', 'seguranca', 'Antivírus, backup, políticas de acesso', 'Shield', 4),
('Software', 'software', 'Instalação, licenciamento, troubleshooting', 'AppWindow', 5),
('Hardware', 'hardware', 'Computadores, impressoras, periféricos', 'Monitor', 6),
('Geral', 'geral', 'Outros tópicos e procedimentos', 'BookOpen', 99)
ON CONFLICT DO NOTHING;