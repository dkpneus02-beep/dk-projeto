CREATE OR REPLACE FUNCTION public.webpush_config_for_service()
RETURNS TABLE (public_key text, private_key text, subject text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT c.public_key, c.private_key, c.subject
  FROM private.webpush_config AS c
  WHERE c.id = true AND c.ativo = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.webpush_config_for_service() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.webpush_config_for_service() FROM anon;
REVOKE ALL ON FUNCTION public.webpush_config_for_service() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.webpush_config_for_service() TO service_role;
