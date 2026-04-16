ALTER TABLE public.assets ADD COLUMN doc_device_id uuid REFERENCES public.doc_devices(id) ON DELETE SET NULL;
CREATE INDEX idx_assets_doc_device_id ON public.assets(doc_device_id);