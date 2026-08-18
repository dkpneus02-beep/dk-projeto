-- Integridade crítica: OS excluída não pode continuar existindo na central de notificações.
-- Também separa custo de peças e mão de obra para manter o total calculável.

-- Limpeza definitiva de notificações ligadas a OS já excluídas.
WITH os_excluidas AS (
  SELECT a.id, n.thread_id
  FROM public.atendimentos a
  JOIN public.notificacoes_internas n ON n.atendimento_id = a.id
  WHERE a.deleted_at IS NOT NULL
), servicos_excluidos AS (
  SELECT a.id, n.thread_id
  FROM public.atendimentos a
  JOIN public.atendimento_servicos s ON s.atendimento_id = a.id
  JOIN public.notificacoes_internas n ON n.atendimento_servico_id = s.id
  WHERE a.deleted_at IS NOT NULL
), threads AS (
  SELECT thread_id FROM os_excluidas WHERE thread_id IS NOT NULL
  UNION
  SELECT thread_id FROM servicos_excluidos WHERE thread_id IS NOT NULL
)
DELETE FROM public.notificacoes_internas n
WHERE n.atendimento_id IN (SELECT id FROM os_excluidas)
   OR n.atendimento_id IN (SELECT id FROM servicos_excluidos)
   OR n.atendimento_servico_id IN (
     SELECT s.id
     FROM public.atendimento_servicos s
     JOIN public.atendimentos a ON a.id = s.atendimento_id
     WHERE a.deleted_at IS NOT NULL
   )
   OR n.thread_id IN (SELECT thread_id FROM threads);

-- Toda notificação já existente e posteriormente ligada a uma OS excluída
-- deixa de ser selecionável por RLS. Mensagens gerais continuam normais.
DROP POLICY IF EXISTS "notificacoes_internas_select_conversa" ON public.notificacoes_internas;
DROP POLICY IF EXISTS "notificacoes_internas_select_proprias" ON public.notificacoes_internas;
CREATE POLICY "notificacoes_internas_select_ativas" ON public.notificacoes_internas
  FOR SELECT TO authenticated
  USING (
    (
      atendimento_id IS NULL
      AND atendimento_servico_id IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.atendimentos a
      WHERE a.id = notificacoes_internas.atendimento_id
        AND a.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.atendimento_servicos s
      JOIN public.atendimentos a ON a.id = s.atendimento_id
      WHERE s.id = notificacoes_internas.atendimento_servico_id
        AND a.deleted_at IS NULL
    )
  )
  AND (
    destinatario_user_id = auth.uid()
    OR criado_por = auth.uid()
    OR public.has_role(auth.uid(), 'gerente')
  );

-- OS excluída remove imediatamente todas as mensagens e suas conversas relacionadas.
CREATE OR REPLACE FUNCTION public.apagar_notificacoes_os_excluida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    WITH threads AS (
      SELECT DISTINCT n.thread_id
      FROM public.notificacoes_internas n
      WHERE n.atendimento_id = NEW.id
         OR n.atendimento_servico_id IN (
           SELECT s.id FROM public.atendimento_servicos s WHERE s.atendimento_id = NEW.id
         )
    )
    DELETE FROM public.notificacoes_internas n
    WHERE n.atendimento_id = NEW.id
       OR n.atendimento_servico_id IN (
         SELECT s.id FROM public.atendimento_servicos s WHERE s.atendimento_id = NEW.id
       )
       OR n.thread_id IN (SELECT thread_id FROM threads);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apagar_notificacoes_os_excluida ON public.atendimentos;
CREATE TRIGGER apagar_notificacoes_os_excluida
AFTER UPDATE OF deleted_at ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.apagar_notificacoes_os_excluida();

-- Não permite criar mensagem apontando para OS/serviço apagado ou inexistente.
CREATE OR REPLACE FUNCTION public.validar_referencia_notificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.atendimento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.atendimentos a
    WHERE a.id = NEW.atendimento_id AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A OS vinculada não existe ou foi excluída.';
  END IF;

  IF NEW.atendimento_servico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.atendimento_servicos s
    JOIN public.atendimentos a ON a.id = s.atendimento_id
    WHERE s.id = NEW.atendimento_servico_id AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'O serviço vinculado não existe ou pertence a uma OS excluída.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_referencia_notificacao ON public.notificacoes_internas;
CREATE TRIGGER validar_referencia_notificacao
BEFORE INSERT OR UPDATE OF atendimento_id, atendimento_servico_id ON public.notificacoes_internas
FOR EACH ROW EXECUTE FUNCTION public.validar_referencia_notificacao();

-- Fortalece a RPC usada pela central de notificações.
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _destinatario_user_id) THEN RAISE EXCEPTION 'Destinatário inválido.'; END IF;
  IF NOT public.has_role(auth.uid(), 'gerente') AND NOT public.has_role(_destinatario_user_id, 'gerente') THEN
    RAISE EXCEPTION 'Mecânico só pode enviar mensagens para a gerência.';
  END IF;
  IF COALESCE(trim(_titulo), '') = '' OR COALESCE(trim(_mensagem), '') = '' THEN
    RAISE EXCEPTION 'Título e mensagem são obrigatórios.';
  END IF;
  IF _atendimento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.atendimentos a WHERE a.id = _atendimento_id AND a.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'A OS vinculada não existe ou foi excluída.'; END IF;
  IF _atendimento_servico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.atendimento_servicos s JOIN public.atendimentos a ON a.id = s.atendimento_id
    WHERE s.id = _atendimento_servico_id AND a.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'O serviço vinculado não existe ou pertence a uma OS excluída.'; END IF;

  SELECT p.nome INTO remetente_nome FROM public.profiles p WHERE p.id = auth.uid();
  SELECT m.id INTO destinatario_mecanico FROM public.mecanicos m
  WHERE m.user_id = _destinatario_user_id AND m.deleted_at IS NULL LIMIT 1;

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

-- Campos separados para custo de estoque e mão de obra.
ALTER TABLE public.atendimento_servicos
  ADD COLUMN IF NOT EXISTS preco_peca numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mao_de_obra numeric NOT NULL DEFAULT 0;

UPDATE public.atendimento_servicos s
SET preco_peca = CASE WHEN s.peca_id IS NOT NULL THEN COALESCE(s.valor, 0) ELSE 0 END,
    mao_de_obra = CASE WHEN s.peca_id IS NULL THEN COALESCE(s.valor, 0) ELSE 0 END
WHERE s.preco_peca = 0 AND s.mao_de_obra = 0;

CREATE OR REPLACE FUNCTION public.recalcular_valor_servico()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  preco_unitario numeric := 0;
BEGIN
  IF NEW.peca_id IS NOT NULL THEN
    SELECT COALESCE(p.preco_venda, 0) INTO preco_unitario FROM public.pecas p WHERE p.id = NEW.peca_id;
    IF TG_OP = 'INSERT' OR NEW.peca_id IS DISTINCT FROM OLD.peca_id OR NEW.quantidade IS DISTINCT FROM OLD.quantidade THEN
      NEW.preco_peca := preco_unitario * GREATEST(COALESCE(NEW.quantidade, 1), 0.01);
    END IF;
  ELSE
    -- Compatibilidade com serviços antigos: o valor inicial do catálogo vira mão de obra.
    IF TG_OP = 'INSERT' AND COALESCE(NEW.mao_de_obra, 0) = 0 AND COALESCE(NEW.valor, 0) > 0 THEN
      NEW.mao_de_obra := NEW.valor;
    END IF;
    NEW.preco_peca := 0;
  END IF;
  NEW.mao_de_obra := GREATEST(COALESCE(NEW.mao_de_obra, 0), 0);
  NEW.valor := ROUND(COALESCE(NEW.preco_peca, 0) + NEW.mao_de_obra, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalcular_valor_servico ON public.atendimento_servicos;
CREATE TRIGGER recalcular_valor_servico
BEFORE INSERT OR UPDATE OF peca_id, quantidade, preco_peca, mao_de_obra ON public.atendimento_servicos
FOR EACH ROW EXECUTE FUNCTION public.recalcular_valor_servico();
