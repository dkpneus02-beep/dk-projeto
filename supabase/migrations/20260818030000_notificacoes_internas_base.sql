-- Primeiro bloco de notificações internas.
-- Não substitui avisos manuais nem retornos de clientes.

CREATE TABLE IF NOT EXISTS public.notificacoes_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  destinatario_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_mecanico_id uuid REFERENCES public.mecanicos(id) ON DELETE SET NULL,
  atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  atendimento_servico_id uuid REFERENCES public.atendimento_servicos(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome text,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  lido_at timestamptz,
  arquivado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_internas_dedupe_idx
  ON public.notificacoes_internas (destinatario_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notificacoes_internas_destinatario_idx
  ON public.notificacoes_internas (destinatario_user_id, lido_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notificacoes_internas_atendimento_idx
  ON public.notificacoes_internas (atendimento_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notificacoes_internas TO authenticated;
GRANT ALL ON public.notificacoes_internas TO service_role;
ALTER TABLE public.notificacoes_internas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_internas_select_proprias" ON public.notificacoes_internas;
CREATE POLICY "notificacoes_internas_select_proprias" ON public.notificacoes_internas
  FOR SELECT TO authenticated
  USING (destinatario_user_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "notificacoes_internas_update_proprias" ON public.notificacoes_internas;
CREATE POLICY "notificacoes_internas_update_proprias" ON public.notificacoes_internas
  FOR UPDATE TO authenticated
  USING (destinatario_user_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (destinatario_user_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.proteger_notificacao_interna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gerente')) THEN
    IF NEW.destinatario_user_id IS DISTINCT FROM OLD.destinatario_user_id
      OR NEW.destinatario_mecanico_id IS DISTINCT FROM OLD.destinatario_mecanico_id
      OR NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id
      OR NEW.atendimento_servico_id IS DISTINCT FROM OLD.atendimento_servico_id
      OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
      OR NEW.titulo IS DISTINCT FROM OLD.titulo
      OR NEW.mensagem IS DISTINCT FROM OLD.mensagem
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.metadata IS DISTINCT FROM OLD.metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Você só pode marcar ou arquivar suas próprias notificações.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificacoes_internas_update_restrito ON public.notificacoes_internas;
CREATE TRIGGER notificacoes_internas_update_restrito
BEFORE UPDATE ON public.notificacoes_internas
FOR EACH ROW EXECUTE FUNCTION public.proteger_notificacao_interna();

CREATE OR REPLACE FUNCTION public.criar_notificacao_interna(
  _tipo text,
  _titulo text,
  _mensagem text,
  _destinatario_user_id uuid,
  _destinatario_mecanico_id uuid DEFAULT NULL,
  _atendimento_id uuid DEFAULT NULL,
  _atendimento_servico_id uuid DEFAULT NULL,
  _dedupe_key text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  novo_id uuid;
  nome_criador text;
BEGIN
  SELECT p.nome INTO nome_criador FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.notificacoes_internas (
    tipo, titulo, mensagem, destinatario_user_id, destinatario_mecanico_id,
    atendimento_id, atendimento_servico_id, criado_por, criado_por_nome,
    dedupe_key, metadata
  ) VALUES (
    _tipo, _titulo, _mensagem, _destinatario_user_id, _destinatario_mecanico_id,
    _atendimento_id, _atendimento_servico_id, auth.uid(), nome_criador,
    _dedupe_key, COALESCE(_metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO novo_id;

  IF novo_id IS NULL AND _dedupe_key IS NOT NULL THEN
    SELECT n.id INTO novo_id
    FROM public.notificacoes_internas n
    WHERE n.destinatario_user_id = _destinatario_user_id
      AND n.dedupe_key = _dedupe_key
    ORDER BY n.created_at DESC
    LIMIT 1;
  END IF;

  RETURN novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_notificacao_interna(text, text, text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_notificacao_interna(text, text, text, uuid, uuid, uuid, uuid, text, jsonb) TO service_role;
