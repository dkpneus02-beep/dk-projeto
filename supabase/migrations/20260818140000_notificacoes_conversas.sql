-- Conversas internas entre gerente e mecânico.
-- Preserva os registros existentes e adiciona apenas metadados de conversa.

ALTER TABLE public.notificacoes_internas
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.notificacoes_internas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS editado_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_at timestamptz,
  ADD COLUMN IF NOT EXISTS mes_referencia date NOT NULL DEFAULT date_trunc('month', now())::date;

UPDATE public.notificacoes_internas
SET thread_id = id
WHERE thread_id IS NULL;

CREATE INDEX IF NOT EXISTS notificacoes_internas_thread_idx
  ON public.notificacoes_internas (thread_id, created_at);
CREATE INDEX IF NOT EXISTS notificacoes_internas_mes_idx
  ON public.notificacoes_internas (mes_referencia, created_at DESC);

DROP POLICY IF EXISTS "notificacoes_internas_select_proprias" ON public.notificacoes_internas;
CREATE POLICY "notificacoes_internas_select_conversa" ON public.notificacoes_internas
  FOR SELECT TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR criado_por = auth.uid()
    OR public.has_role(auth.uid(), 'gerente')
  );

DROP POLICY IF EXISTS "notificacoes_internas_update_proprias" ON public.notificacoes_internas;
CREATE POLICY "notificacoes_internas_update_conversa" ON public.notificacoes_internas
  FOR UPDATE TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR criado_por = auth.uid()
    OR public.has_role(auth.uid(), 'gerente')
  )
  WITH CHECK (
    destinatario_user_id = auth.uid()
    OR criado_por = auth.uid()
    OR public.has_role(auth.uid(), 'gerente')
  );

CREATE OR REPLACE FUNCTION public.proteger_notificacao_interna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'gerente') THEN
    RETURN NEW;
  END IF;

  IF OLD.destinatario_user_id = auth.uid() THEN
    IF NEW.destinatario_user_id IS DISTINCT FROM OLD.destinatario_user_id
      OR NEW.destinatario_mecanico_id IS DISTINCT FROM OLD.destinatario_mecanico_id
      OR NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id
      OR NEW.atendimento_servico_id IS DISTINCT FROM OLD.atendimento_servico_id
      OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
      OR NEW.criado_por_nome IS DISTINCT FROM OLD.criado_por_nome
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.titulo IS DISTINCT FROM OLD.titulo
      OR NEW.mensagem IS DISTINCT FROM OLD.mensagem
      OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
      OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.metadata IS DISTINCT FROM OLD.metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.editado_at IS DISTINCT FROM OLD.editado_at
      OR NEW.mes_referencia IS DISTINCT FROM OLD.mes_referencia
    THEN
      RAISE EXCEPTION 'O destinatário só pode marcar, arquivar ou excluir logicamente a própria mensagem.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.criado_por = auth.uid() THEN
    IF NEW.destinatario_user_id IS DISTINCT FROM OLD.destinatario_user_id
      OR NEW.destinatario_mecanico_id IS DISTINCT FROM OLD.destinatario_mecanico_id
      OR NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id
      OR NEW.atendimento_servico_id IS DISTINCT FROM OLD.atendimento_servico_id
      OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
      OR NEW.criado_por_nome IS DISTINCT FROM OLD.criado_por_nome
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
      OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.lido_at IS DISTINCT FROM OLD.lido_at
      OR NEW.arquivado_at IS DISTINCT FROM OLD.arquivado_at
      OR NEW.mes_referencia IS DISTINCT FROM OLD.mes_referencia
    THEN
      RAISE EXCEPTION 'Você só pode editar ou excluir logicamente as mensagens que enviou.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Você não pode alterar esta notificação.';
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_notificacao_manual(
  _destinatario_user_id uuid,
  _titulo text,
  _mensagem text,
  _tipo text DEFAULT 'mensagem',
  _atendimento_id uuid DEFAULT NULL,
  _atendimento_servico_id uuid DEFAULT NULL,
  _thread_id uuid DEFAULT NULL,
  _reply_to_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  novo_id uuid := gen_random_uuid();
  remetente_nome text;
  destinatario_mecanico uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _destinatario_user_id) THEN
    RAISE EXCEPTION 'Destinatário inválido.';
  END IF;

  IF NOT public.has_role(auth.uid(), 'gerente')
    AND NOT public.has_role(_destinatario_user_id, 'gerente')
  THEN
    RAISE EXCEPTION 'Mecânico só pode enviar mensagens para a gerência.';
  END IF;

  IF COALESCE(trim(_titulo), '') = '' OR COALESCE(trim(_mensagem), '') = '' THEN
    RAISE EXCEPTION 'Título e mensagem são obrigatórios.';
  END IF;

  SELECT p.nome INTO remetente_nome FROM public.profiles p WHERE p.id = auth.uid();
  SELECT m.id INTO destinatario_mecanico FROM public.mecanicos m WHERE m.user_id = _destinatario_user_id AND m.deleted_at IS NULL LIMIT 1;

  INSERT INTO public.notificacoes_internas (
    id, tipo, titulo, mensagem, destinatario_user_id, destinatario_mecanico_id,
    atendimento_id, atendimento_servico_id, criado_por, criado_por_nome,
    thread_id, reply_to_id, mes_referencia
  ) VALUES (
    novo_id, COALESCE(NULLIF(trim(_tipo), ''), 'mensagem'), trim(_titulo), trim(_mensagem),
    _destinatario_user_id, destinatario_mecanico, _atendimento_id, _atendimento_servico_id,
    auth.uid(), COALESCE(remetente_nome, 'Usuário'), COALESCE(_thread_id, novo_id),
    _reply_to_id, date_trunc('month', now())::date
  );

  RETURN novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_notificacao_manual(uuid, text, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_notificacao_manual(uuid, text, text, text, uuid, uuid, uuid, uuid) TO authenticated;
