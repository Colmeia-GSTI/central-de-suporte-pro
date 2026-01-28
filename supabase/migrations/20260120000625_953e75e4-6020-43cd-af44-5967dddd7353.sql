-- Create storage bucket for digital certificates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates', 
  'certificates', 
  false, 
  10485760, -- 10MB limit
  ARRAY['application/x-pkcs12', 'application/octet-stream']
);

-- RLS Policies for certificates bucket - Admin only
CREATE POLICY "Admin can view certificates"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'certificates' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admin can upload certificates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'certificates' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admin can delete certificates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'certificates' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Add certificate fields to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS certificado_arquivo_url text,
ADD COLUMN IF NOT EXISTS certificado_senha_hash text,
ADD COLUMN IF NOT EXISTS certificado_uploaded_at timestamptz;