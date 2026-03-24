INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-images', 'knowledge-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload knowledge images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'knowledge-images');

CREATE POLICY "Public read access for knowledge images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'knowledge-images');

CREATE POLICY "Staff can delete knowledge images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'knowledge-images' AND public.is_staff(auth.uid()));