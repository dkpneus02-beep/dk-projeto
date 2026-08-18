ALTER TABLE private.webpush_config
  ADD COLUMN IF NOT EXISTS trigger_secret text;

ALTER TABLE private.webpush_config
  DROP CONSTRAINT IF EXISTS webpush_config_trigger_secret_nonempty;

ALTER TABLE private.webpush_config
  ADD CONSTRAINT webpush_config_trigger_secret_nonempty
  CHECK (trigger_secret IS NULL OR length(trigger_secret) >= 32);
