ALTER TABLE public.pecas
  ADD COLUMN IF NOT EXISTS aceita_desconto_pix boolean NOT NULL DEFAULT true;

UPDATE public.pecas
SET aceita_desconto_pix = false
WHERE tipo = 'pneu';

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
  v_pecas_descontaveis numeric := 0;
  v_aceita_desconto boolean;
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

    IF v_tipo = 'peca' THEN
      v_pecas := v_pecas + v_quantidade * v_valor_unitario;
      v_aceita_desconto := false;
      IF NULLIF(v_item->>'peca_id', '') IS NOT NULL THEN
        SELECT p.aceita_desconto_pix INTO v_aceita_desconto
        FROM public.pecas p
        WHERE p.id = NULLIF(v_item->>'peca_id', '')::uuid;
      END IF;
      IF COALESCE(v_aceita_desconto, false) THEN
        v_pecas_descontaveis := v_pecas_descontaveis + v_quantidade * v_valor_unitario;
      END IF;
    ELSE
      v_mao_de_obra := v_mao_de_obra + v_quantidade * v_valor_unitario;
    END IF;
  END LOOP;

  IF v_pagamento_pix THEN
    v_desconto := ROUND(v_pecas_descontaveis * 0.25, 2);
  END IF;

  IF _orcamento_id IS NULL THEN
    INSERT INTO public.orcamentos (
      criado_por, cliente_nome, cliente_telefone, cliente_cpf, cliente_endereco,
      cliente_bairro_cidade, cliente_email, placa, placa_anterior, fabricante, modelo,
      veiculo_especie_tipo, ano_fabricacao_modelo, cilindrada, cor, chassi, observacao,
      pagamento_pix, desconto, subtotal_pecas, subtotal_mao_de_obra, total
    ) VALUES (
      auth.uid(), NULLIF(trim(_dados->>'cliente_nome'), ''), NULLIF(trim(_dados->>'cliente_telefone'), ''),
      NULLIF(trim(_dados->>'cliente_cpf'), ''), NULLIF(trim(_dados->>'cliente_endereco'), ''),
      NULLIF(trim(_dados->>'cliente_bairro_cidade'), ''), NULLIF(trim(_dados->>'cliente_email'), ''),
      NULLIF(trim(_dados->>'placa'), ''), NULLIF(trim(_dados->>'placa_anterior'), ''),
      NULLIF(trim(_dados->>'fabricante'), ''), NULLIF(trim(_dados->>'modelo'), ''),
      NULLIF(trim(_dados->>'veiculo_especie_tipo'), ''), NULLIF(trim(_dados->>'ano_fabricacao_modelo'), ''),
      NULLIF(trim(_dados->>'cilindrada'), ''), NULLIF(trim(_dados->>'cor'), ''),
      NULLIF(trim(_dados->>'chassi'), ''), NULLIF(trim(_dados->>'observacao'), ''),
      v_pagamento_pix, v_desconto, v_pecas, v_mao_de_obra,
      GREATEST(v_pecas + v_mao_de_obra - v_desconto, 0)
    ) RETURNING * INTO v_orcamento;
  ELSE
    UPDATE public.orcamentos
    SET cliente_nome = NULLIF(trim(_dados->>'cliente_nome'), ''),
        cliente_telefone = NULLIF(trim(_dados->>'cliente_telefone'), ''),
        cliente_cpf = NULLIF(trim(_dados->>'cliente_cpf'), ''),
        cliente_endereco = NULLIF(trim(_dados->>'cliente_endereco'), ''),
        cliente_bairro_cidade = NULLIF(trim(_dados->>'cliente_bairro_cidade'), ''),
        cliente_email = NULLIF(trim(_dados->>'cliente_email'), ''),
        placa = NULLIF(trim(_dados->>'placa'), ''),
        placa_anterior = NULLIF(trim(_dados->>'placa_anterior'), ''),
        fabricante = NULLIF(trim(_dados->>'fabricante'), ''),
        modelo = NULLIF(trim(_dados->>'modelo'), ''),
        veiculo_especie_tipo = NULLIF(trim(_dados->>'veiculo_especie_tipo'), ''),
        ano_fabricacao_modelo = NULLIF(trim(_dados->>'ano_fabricacao_modelo'), ''),
        cilindrada = NULLIF(trim(_dados->>'cilindrada'), ''),
        cor = NULLIF(trim(_dados->>'cor'), ''),
        chassi = NULLIF(trim(_dados->>'chassi'), ''),
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
