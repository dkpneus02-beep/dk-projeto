CREATE OR REPLACE FUNCTION public.marcar_atendimento_pago_com_formas(
  _atendimento_id uuid,
  _formas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_sessao_id uuid;
  v_item jsonb;
  v_pagamento public.pagamentos%ROWTYPE;
  v_pagamento_id uuid;
  v_forma text;
  v_pendentes integer := 0;
  v_itens integer := 0;
  v_ids_unicos integer := 0;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode confirmar o recebimento.';
  END IF;
  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'Informe a OS para marcar o pagamento.';
  END IF;
  IF _formas IS NULL OR jsonb_typeof(_formas) <> 'array' THEN
    RAISE EXCEPTION 'Informe a forma de cada pagamento pendente.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_atendimento.status <> 'finalizado' THEN
    RAISE EXCEPTION 'Somente uma OS finalizada pode ser marcada como paga.';
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE aberto = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Abra o caixa antes de registrar o recebimento da OS.';
  END IF;

  PERFORM id
  FROM public.pagamentos
  WHERE atendimento_id = _atendimento_id AND pago = false
  ORDER BY created_at, id
  FOR UPDATE;

  SELECT COUNT(*)::integer INTO v_pendentes
  FROM public.pagamentos
  WHERE atendimento_id = _atendimento_id AND pago = false;
  IF v_pendentes = 0 THEN
    RAISE EXCEPTION 'Esta OS não possui pagamentos pendentes.';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE jsonb_typeof(value) = 'object')::integer,
    COUNT(DISTINCT NULLIF(BTRIM(value->>'id'), ''))::integer
  INTO v_itens, v_ids_unicos
  FROM jsonb_array_elements(_formas);
  IF v_itens <> jsonb_array_length(_formas) OR v_ids_unicos <> v_itens THEN
    RAISE EXCEPTION 'A lista de pagamentos contém dados inválidos ou repetidos.';
  END IF;
  IF v_itens <> v_pendentes THEN
    RAISE EXCEPTION 'A lista de pagamentos pendentes mudou. Atualize a tela e tente novamente.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_formas) LOOP
    BEGIN
      v_pagamento_id := NULLIF(BTRIM(v_item->>'id'), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Um dos pagamentos informados não é válido.';
    END;
    v_forma := NULLIF(BTRIM(v_item->>'forma'), '');
    IF v_pagamento_id IS NULL OR v_forma IS NULL OR v_forma NOT IN (
      'Dinheiro',
      'PIX',
      'Cartão de débito',
      'Cartão de crédito',
      'Outros'
    ) THEN
      RAISE EXCEPTION 'Selecione uma forma válida para cada pagamento pendente.';
    END IF;

    SELECT * INTO v_pagamento
    FROM public.pagamentos
    WHERE id = v_pagamento_id
      AND atendimento_id = _atendimento_id
      AND pago = false
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um pagamento não pertence a esta OS ou já foi confirmado.';
    END IF;

    UPDATE public.pagamentos
    SET forma = v_forma, pago = true
    WHERE id = v_pagamento.id AND pago = false;
    INSERT INTO public.caixa_movimentos
      (sessao_id, tipo, descricao, valor, forma, atendimento_id)
    VALUES
      (v_sessao_id, 'entrada',
       FORMAT('OS #%s — %s', v_atendimento.numero, v_atendimento.cliente_nome),
       ROUND(v_pagamento.valor, 2), v_forma, _atendimento_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'pagamentos_marcados', v_count,
    'pago', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_atendimento_pago_com_formas(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atendimento_pago_com_formas(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.marcar_atendimento_pago_com_formas(uuid, jsonb) IS
  'Atualiza as formas dos pagamentos pendentes e confirma recebimento/lancamentos de caixa atomicamente; gerente only.';
