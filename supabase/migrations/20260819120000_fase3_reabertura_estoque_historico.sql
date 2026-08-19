-- Fase 3 — reabertura transacional e consistência de estoque/histórico.
-- A reabertura precisa desfazer caixa, pagamentos e status em uma única transação.

CREATE OR REPLACE FUNCTION public.reabrir_atendimento_transacional(_atendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_movimentos integer;
  v_pagamentos integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode reabrir uma OS.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada ou já excluída.';
  END IF;

  IF v_atendimento.status IS DISTINCT FROM 'finalizado' THEN
    RAISE EXCEPTION 'Apenas uma OS finalizada pode ser reaberta.';
  END IF;

  DELETE FROM public.caixa_movimentos
  WHERE atendimento_id = _atendimento_id;
  GET DIAGNOSTICS v_movimentos = ROW_COUNT;

  DELETE FROM public.pagamentos
  WHERE atendimento_id = _atendimento_id;
  GET DIAGNOSTICS v_pagamentos = ROW_COUNT;

  -- A transição dispara estornar_pecas_atendimento pelo trigger existente.
  -- Se o estorno ou a atualização falhar, os deletes acima também são revertidos.
  UPDATE public.atendimentos
  SET status = 'aberto',
      finalizado_at = NULL,
      pronto_at = NULL,
      pronto_por = NULL
  WHERE id = _atendimento_id;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'caixa_movimentos_removidos', v_movimentos,
    'pagamentos_removidos', v_pagamentos,
    'status', 'aberto'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reabrir_atendimento_transacional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_atendimento_transacional(uuid) TO authenticated;
