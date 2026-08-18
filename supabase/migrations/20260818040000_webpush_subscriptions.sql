-- Subscriptions Web Push por usuário/dispositivo.
-- O endpoint é uma capability URL e deve ser tratado como dado sensível.

CREATE TABLE IF NOT EXISTS public.webpush_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_label text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_envio_at timestamptz,
  ultimo_erro_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webpush_subscriptions_endpoint_nonempty CHECK (length(endpoint) > 20),
  CONSTRAINT webpush_subscriptions_p256dh_nonempty CHECK (length(p256dh) > 10),
  CONSTRAINT webpush_subscriptions_auth_nonempty CHECK (length(auth) > 5)
);

CREATE INDEX IF NOT EXISTS webpush_subscriptions_user_idx
  ON public.webpush_subscriptions (user_id, ativo, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webpush_subscriptions TO authenticated;
GRANT ALL ON public.webpush_subscriptions TO service_role;
ALTER TABLE public.webpush_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webpush_select_proprias" ON public.webpush_subscriptions;
CREATE POLICY "webpush_select_proprias" ON public.webpush_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "webpush_insert_proprias" ON public.webpush_subscriptions;
CREATE POLICY "webpush_insert_proprias" ON public.webpush_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "webpush_update_proprias" ON public.webpush_subscriptions;
CREATE POLICY "webpush_update_proprias" ON public.webpush_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "webpush_delete_proprias" ON public.webpush_subscriptions;
CREATE POLICY "webpush_delete_proprias" ON public.webpush_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.webpush_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS webpush_subscriptions_touch_updated_at ON public.webpush_subscriptions;
CREATE TRIGGER webpush_subscriptions_touch_updated_at
BEFORE UPDATE ON public.webpush_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.webpush_touch_updated_at();
