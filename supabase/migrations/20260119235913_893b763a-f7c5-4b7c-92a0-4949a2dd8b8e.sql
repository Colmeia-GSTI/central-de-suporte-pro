-- Create storage bucket for NFS-e files (XMLs and PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nfse-files', 
  'nfse-files', 
  false, 
  5242880, -- 5MB limit
  ARRAY['application/xml', 'text/xml', 'application/pdf']
);

-- RLS Policies for nfse-files bucket
-- Staff can view all NFS-e files
CREATE POLICY "Staff can view nfse files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'nfse-files' 
  AND public.is_staff(auth.uid())
);

-- Admin and financial can upload NFS-e files
CREATE POLICY "Admin and financial can upload nfse files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'nfse-files' 
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'financial')
  )
);

-- Admin and financial can update NFS-e files
CREATE POLICY "Admin and financial can update nfse files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'nfse-files' 
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'financial')
  )
);

-- Only admin can delete NFS-e files
CREATE POLICY "Only admin can delete nfse files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'nfse-files' 
  AND public.has_role(auth.uid(), 'admin')
);