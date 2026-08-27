ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS pagamento_pix boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.salvar_orcamento(
  _orcamento_id uuid,
  _dados jsonb,
  _itens jsonb
)
RETURNS public.orcamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento public.orcamentos%ROWTYPE;
  v_item jsonb;
  v_tipo text;
  v_descricao text;
  v_quantidade numeric;
  v_valor_unitario numeric;
  v_pecas numeric := 0;
  v_mao_de_obra numeric := 0;
  v_pagamento_pix boolean := COALESCE((_dados->>'pagamento_pix')::boolean, false);
  v_desconto numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode salvar orçamentos.';
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos uma peça ou serviço ao orçamento.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_itens)
  LOOP
    v_tipo := v_item->>'tipo';
    v_descricao := NULLIF(trim(v_item->>'descricao'), '');
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_valor_unitario := (v_item->>'valor_unitario')::numeric;
    IF v_tipo NOT IN ('peca', 'mao_de_obra') OR v_descricao IS NULL OR v_quantidade <= 0 OR v_valor_unitario < 0 THEN
      RAISE EXCEPTION 'Item inválido no orçamento.';
    END IF;
    IF v_tipo = 'peca' THEN v_pecas := v_pecas + v_quantidade * v_valor_unitario;
    ELSE v_mao_de_obra := v_mao_de_obra + v_quantidade * v_valor_unitario;
    END IF;
  END LOOP;

  IF v_pagamento_pix THEN
    v_desconto := ROUND(v_pecas * 0.25, 2);
  END IF;

  IF _orcamento_id IS NULL THEN
    INSERT INTO public.orcamentos (
      criado_por, cliente_nome, cliente_telefone, cliente_cpf, placa, fabricante,
      modelo, cor, observacao, pagamento_pix, desconto, subtotal_pecas, subtotal_mao_de_obra, total
    ) VALUES (
      auth.uid(), NULLIF(trim(_dados->>'cliente_nome'), ''), NULLIF(trim(_dados->>'cliente_telefone'), ''),
      NULLIF(trim(_dados->>'cliente_cpf'), ''), NULLIF(trim(_dados->>'placa'), ''),
      NULLIF(trim(_dados->>'fabricante'), ''), NULLIF(trim(_dados->>'modelo'), ''),
      NULLIF(trim(_dados->>'cor'), ''), NULLIF(trim(_dados->>'observacao'), ''),
      v_pagamento_pix, v_desconto, v_pecas, v_mao_de_obra, GREATEST(v_pecas + v_mao_de_obra - v_desconto, 0)
    ) RETURNING * INTO v_orcamento;
  ELSE
    UPDATE public.orcamentos
    SET cliente_nome = NULLIF(trim(_dados->>'cliente_nome'), ''),
        cliente_telefone = NULLIF(trim(_dados->>'cliente_telefone'), ''),
        cliente_cpf = NULLIF(trim(_dados->>'cliente_cpf'), ''),
        placa = NULLIF(trim(_dados->>'placa'), ''),
        fabricante = NULLIF(trim(_dados->>'fabricante'), ''),
        modelo = NULLIF(trim(_dados->>'modelo'), ''),
        cor = NULLIF(trim(_dados->>'cor'), ''),
        observacao = NULLIF(trim(_dados->>'observacao'), ''),
        pagamento_pix = v_pagamento_pix,
        desconto = v_desconto,
        subtotal_pecas = v_pecas,
        subtotal_mao_de_obra = v_mao_de_obra,
        total = GREATEST(v_pecas + v_mao_de_obra - v_desconto, 0)
    WHERE id = _orcamento_id AND status = 'aberto' AND expires_at > now()
    RETURNING * INTO v_orcamento;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado, expirado ou já convertido.'; END IF;
    DELETE FROM public.orcamento_itens WHERE orcamento_id = _orcamento_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_itens)
  LOOP
    INSERT INTO public.orcamento_itens (
      orcamento_id, tipo, peca_id, servico_id, descricao, quantidade,
      valor_unitario, valor_total, ordem
    ) VALUES (
      v_orcamento.id, v_item->>'tipo', NULLIF(v_item->>'peca_id', '')::uuid,
      NULLIF(v_item->>'servico_id', '')::uuid, trim(v_item->>'descricao'),
      (v_item->>'quantidade')::numeric, (v_item->>'valor_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'valor_unitario')::numeric,
      COALESCE((v_item->>'ordem')::integer, 0)
    );
  END LOOP;
  RETURN v_orcamento;
END;
$$;
