-- Fase 2 — finalização transacional de OS.
-- Toda a operação ocorre na mesma transação do PostgreSQL.

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_transacional(
  _atendimento_id uuid,
  _desconto numeric,
  _pagamentos jsonb,
  _necessita_retorno boolean DEFAULT false,
  _data_retorno_manual date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_cfg public.configuracoes%ROWTYPE;
  v_bruto numeric(12,2);
  v_desconto numeric(12,2);
  v_total numeric(12,2);
  v_garantia_ate date;
  v_garantia_km integer;
  v_finalizado_at timestamptz := now();
  v_sessao_id uuid;
  v_item jsonb;
  v_pagamento_total numeric(12,2) := 0;
  v_pagamento_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode finalizar uma OS.';
  END IF;

  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'A OS precisa ser informada.';
  END IF;

  IF _pagamentos IS NULL OR jsonb_typeof(_pagamentos) <> 'array' THEN
    RAISE EXCEPTION 'Informe os pagamentos em uma lista válida.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada ou já excluída.';
  END IF;

  IF v_atendimento.status = 'finalizado' THEN
    RAISE EXCEPTION 'Esta OS já está finalizada.';
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.valor, 0)), 0)::numeric(12,2),
         MIN(NULLIF(s.garantia_km, 0))
    INTO v_bruto, v_garantia_km
  FROM public.atendimento_servicos s
  WHERE s.atendimento_id = _atendimento_id;

  v_desconto := ROUND(GREATEST(COALESCE(_desconto, 0), 0), 2);
  IF v_desconto > v_bruto THEN
    v_desconto := v_bruto;
  END IF;
  v_total := ROUND(GREATEST(v_bruto - v_desconto, 0), 2);

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    IF NULLIF(trim(v_item->>'forma'), '') IS NULL THEN
      RAISE EXCEPTION 'Todo pagamento precisa informar a forma.';
    END IF;
    IF COALESCE((v_item->>'valor')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'O valor de pagamento não pode ser negativo.';
    END IF;
    IF COALESCE((v_item->>'parcelas')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'O número de parcelas precisa ser maior que zero.';
    END IF;
    v_pagamento_total := v_pagamento_total + ROUND(COALESCE((v_item->>'valor')::numeric, 0), 2);
    v_pagamento_count := v_pagamento_count + 1;
  END LOOP;

  IF v_pagamento_count = 0 OR ABS(v_pagamento_total - v_total) >= 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos deve ser igual ao total da OS.';
  END IF;

  SELECT * INTO v_cfg
  FROM public.configuracoes
  LIMIT 1;

  v_garantia_ate := (CURRENT_DATE + COALESCE(v_cfg.garantia_dias, 90))::date;
  IF v_garantia_km IS NOT NULL THEN
    v_garantia_km := COALESCE(v_atendimento.km, 0) + v_garantia_km;
  END IF;

  -- A mudança de status dispara a baixa de estoque já existente. Como esta
  -- função está na mesma transação, qualquer falta de estoque faz rollback.
  UPDATE public.atendimentos
  SET status = 'finalizado',
      desconto = v_desconto,
      total = v_total,
      finalizado_at = v_finalizado_at,
      garantia_ate = v_garantia_ate,
      garantia_km = v_garantia_km,
      necessita_retorno = COALESCE(_necessita_retorno, false),
      data_retorno_manual = CASE
        WHEN COALESCE(_necessita_retorno, false) THEN _data_retorno_manual
        ELSE NULL
      END
  WHERE id = _atendimento_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    INSERT INTO public.pagamentos (atendimento_id, forma, valor, parcelas)
    VALUES (
      _atendimento_id,
      trim(v_item->>'forma'),
      ROUND((v_item->>'valor')::numeric, 2),
      (v_item->>'parcelas')::integer
    );
  END LOOP;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE aberto = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sessao_id IS NOT NULL THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
    LOOP
      INSERT INTO public.caixa_movimentos
        (sessao_id, tipo, descricao, valor, forma, atendimento_id)
      VALUES
        (v_sessao_id, 'entrada',
         format('OS #%s — %s', v_atendimento.numero, v_atendimento.cliente_nome),
         ROUND((v_item->>'valor')::numeric, 2),
         trim(v_item->>'forma'), _atendimento_id);
    END LOOP;
  END IF;

  IF COALESCE(_necessita_retorno, false) AND _data_retorno_manual IS NOT NULL THEN
    INSERT INTO public.notificacoes_retorno
      (atendimento_id, cliente_nome, telefone, veiculo, servico, vencimento)
    SELECT
      _atendimento_id,
      v_atendimento.cliente_nome,
      v_atendimento.cliente_telefone,
      trim(COALESCE(v_atendimento.modelo, '') || ' ' || v_atendimento.placa),
      COALESCE(string_agg(s.nome, ', ' ORDER BY s.nome), 'Serviço realizado'),
      _data_retorno_manual
    FROM public.atendimento_servicos s
    WHERE s.atendimento_id = _atendimento_id;
  END IF;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'total', v_total,
    'desconto', v_desconto,
    'garantia_ate', v_garantia_ate,
    'garantia_km', v_garantia_km,
    'finalizado_at', v_finalizado_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_atendimento_transacional(uuid, numeric, jsonb, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_transacional(uuid, numeric, jsonb, boolean, date) TO authenticated;
