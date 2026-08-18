CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.enqueue_webpush_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  config_row private.webpush_config%ROWTYPE;
BEGIN
  SELECT * INTO config_row
  FROM private.webpush_config
  WHERE id = true AND ativo = true
  LIMIT 1;

  IF config_row.trigger_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://fkkplzwefhjohpfjwcwn.supabase.co/functions/v1/send-webpush',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webpush-secret', config_row.trigger_secret
      ),
      body := jsonb_build_object('notification_id', NEW.id),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_webpush_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS notificacoes_internas_enqueue_webpush ON public.notificacoes_internas;
CREATE TRIGGER notificacoes_internas_enqueue_webpush
AFTER INSERT ON public.notificacoes_internas
FOR EACH ROW EXECUTE FUNCTION public.enqueue_webpush_notification();
