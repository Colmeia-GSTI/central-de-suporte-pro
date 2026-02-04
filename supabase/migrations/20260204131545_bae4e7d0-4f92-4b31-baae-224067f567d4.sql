-- ================================================================
-- Security: Protect license keys from direct access
-- Only allow access via masked view for listing
-- Admins can use get_license_key() function for full access
-- ================================================================

-- Drop existing view and recreate with security_invoker
DROP VIEW IF EXISTS public.software_licenses_safe;

-- Create view with security_invoker to respect RLS
CREATE VIEW public.software_licenses_safe
WITH (security_invoker = on)
AS SELECT 
    sl.id,
    sl.client_id,
    sl.name,
    sl.vendor,
    sl.total_licenses,
    sl.used_licenses,
    sl.purchase_date,
    sl.expire_date,
    sl.purchase_value,
    sl.notes,
    sl.created_at,
    sl.updated_at,
    CASE
        WHEN sl.license_key IS NOT NULL THEN '****' || RIGHT(sl.license_key, 4)
        ELSE NULL
    END AS license_key_masked
FROM public.software_licenses sl;

-- Grant access to authenticated users
GRANT SELECT ON public.software_licenses_safe TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.software_licenses_safe IS 
  'Safe view of software licenses with masked license keys. Use get_license_key() for full access (admin only).';