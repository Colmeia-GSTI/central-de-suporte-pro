DELETE FROM public.doc_devices
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%';

DELETE FROM public.assets
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%';

DELETE FROM public.client_branches
WHERE client_id = 'c9bab9b7-4d68-438e-aaea-459ae4fa7e85'
  AND name ILIKE '%teste%'
  AND is_main = false;