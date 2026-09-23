-- Segunda etapa financeira: pagamento transacional de parcelas integrado ao Caixa.
-- O pagamento só é concluído quando existe um Caixa aberto e o movimento de saída
-- é criado na mesma transação da baixa da parcela.

CREATE OR REPLACE FUNCTION public.pagar_despesa_parcela(
  _parcela_id uuid,
  _forma_pagamento text,
  _valor_pago numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcela public.despesa_parcelas%ROWTYPE;
  v_despesa public.despesas_financeiras%ROWTYPE;
  v_sessao_id uuid;
  v_movimento_id uuid;
  v_valor numeric(14,2);
  v_status text;
  v_data_pagamento timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode pagar uma despesa.';
  END IF;

  IF NULLIF(trim(_forma_pagamento), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.';
  END IF;

  SELECT * INTO v_parcela
  FROM public.despesa_parcelas
  WHERE id = _parcela_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF v_parcela.status = 'pago' THEN
    RAISE EXCEPTION 'Esta parcela já está paga.';
  END IF;

  IF v_parcela.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível pagar uma parcela cancelada.';
  END IF;

  SELECT d.*
    INTO v_despesa
  FROM public.despesas_financeiras d
  WHERE d.id = v_parcela.despesa_id
    AND d.deleted_at IS NULL
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada ou excluída.';
  END IF;

  v_valor := ROUND(COALESCE(_valor_pago, v_parcela.valor), 2);
  IF v_valor <= 0 OR v_valor > v_parcela.valor THEN
    RAISE EXCEPTION 'O valor pago deve ser maior que zero e não pode exceder o valor da parcela.';
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE aberto = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Abra o Caixa antes de registrar o pagamento.';
  END IF;

  INSERT INTO public.caixa_movimentos
    (sessao_id, tipo, descricao, valor, forma, responsavel)
  VALUES
    (
      v_sessao_id,
      'saida',
      format('Pagamento despesa: %s — parcela %s/%s', v_despesa.descricao, v_parcela.numero, (SELECT COUNT(*) FROM public.despesa_parcelas WHERE despesa_id = v_despesa.id)),
      v_valor,
      trim(_forma_pagamento),
      COALESCE((SELECT nome FROM public.profiles WHERE id = auth.uid()), 'Gerente')
    )
  RETURNING id INTO v_movimento_id;

  v_status := CASE WHEN v_valor >= v_parcela.valor THEN 'pago' ELSE 'parcial' END;

  UPDATE public.despesa_parcelas
  SET valor_pago = v_valor,
      data_pagamento = v_data_pagamento,
      forma_pagamento = trim(_forma_pagamento),
      status = v_status,
      caixa_movimento_id = v_movimento_id,
      updated_at = now()
  WHERE id = v_parcela.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.despesa_parcelas
    WHERE despesa_id = v_despesa.id
      AND status NOT IN ('pago', 'cancelado')
  ) THEN
    UPDATE public.despesas_financeiras
    SET status = 'pago', updated_at = now()
    WHERE id = v_despesa.id;
  ELSIF EXISTS (
    SELECT 1 FROM public.despesa_parcelas
    WHERE despesa_id = v_despesa.id AND status = 'pago'
  ) THEN
    UPDATE public.despesas_financeiras
    SET status = 'parcial', updated_at = now()
    WHERE id = v_despesa.id;
  END IF;

  RETURN jsonb_build_object(
    'parcela_id', v_parcela.id,
    'despesa_id', v_despesa.id,
    'valor_pago', v_valor,
    'status', v_status,
    'caixa_movimento_id', v_movimento_id,
    'data_pagamento', v_data_pagamento
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pagar_despesa_parcela(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagar_despesa_parcela(uuid, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.pagar_despesa_parcela(uuid, text, numeric) IS
  'Baixa uma parcela e cria a saída correspondente no Caixa aberto dentro da mesma transação.';
