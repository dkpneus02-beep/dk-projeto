-- Configuração privada do Web Push.
-- Não há GRANT para authenticated/anon; somente a Edge Function via service role deve ler.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.webpush_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  public_key text NOT NULL,
  private_key text NOT NULL,
  subject text NOT NULL DEFAULT 'mailto:dkpneus02@gmail.com',
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.webpush_config FROM PUBLIC;
REVOKE ALL ON private.webpush_config FROM anon;
REVOKE ALL ON private.webpush_config FROM authenticated;
GRANT ALL ON private.webpush_config TO service_role;
