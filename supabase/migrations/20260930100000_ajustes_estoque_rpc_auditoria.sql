-- Fase 1 (aditiva): aplicar antes de publicar a nova interface.
-- Não bloqueia a interface atual, que ainda grava estoque diretamente.
-- Registro de auditoria para ajustes manuais, além dos saldos por lote em peca_lotes.
CREATE TABLE IF NOT EXISTS public.peca_ajustes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id uuid NOT NULL REFERENCES public.pecas(id),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade numeric(12,2) NOT NULL CHECK (quantidade > 0),
  estoque_anterior numeric(12,2) NOT NULL CHECK (estoque_anterior >= 0),
  estoque_novo numeric(12,2) NOT NULL CHECK (estoque_novo >= 0),
  custo_unitario numeric(12,2) NOT NULL CHECK (custo_unitario >= 0),
  custo_total numeric(12,2) NOT NULL CHECK (custo_total >= 0),
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),
  registrado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS peca_ajustes_estoque_peca_criado_idx
  ON public.peca_ajustes_estoque (peca_id, criado_em DESC);

ALTER TABLE public.peca_ajustes_estoque ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.peca_ajustes_estoque TO authenticated;
GRANT ALL ON public.peca_ajustes_estoque TO service_role;
DROP POLICY IF EXISTS "peca_ajustes_estoque_gerente" ON public.peca_ajustes_estoque;
CREATE POLICY "peca_ajustes_estoque_gerente"
  ON public.peca_ajustes_estoque
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

-- Define um saldo-alvo. Entrada cria lote e recalcula o custo médio ponderado;
-- saída consome FIFO e salva o custo FIFO, o motivo e o saldo anterior/posterior.
CREATE OR REPLACE FUNCTION public.ajustar_estoque_com_lotes(
  _peca_id uuid,
  _estoque_alvo numeric,
  _motivo text,
  _custo_unitario_entrada numeric DEFAULT NULL
)
RETURNS public.pecas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peca public.pecas;
  v_estoque_atual numeric(12,2);
  v_estoque_alvo numeric(12,2);
  v_diferenca numeric(12,2);
  v_saldo_lotes numeric(12,2);
  v_gap_legado numeric(12,2);
  v_quantidade numeric(12,2);
  v_restante numeric(12,2);
  v_retirar numeric(12,2);
  v_custo_unitario numeric(12,2);
  v_custo_total numeric(12,2) := 0;
  v_custo_medio_novo numeric(12,2);
  v_tipo text;
  lote record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode ajustar o estoque.';
  END IF;
  IF _peca_id IS NULL THEN
    RAISE EXCEPTION 'Informe a peça para ajustar o estoque.';
  END IF;
  IF _estoque_alvo IS NULL OR _estoque_alvo < 0 THEN
    RAISE EXCEPTION 'O estoque final deve ser zero ou maior.';
  END IF;
  IF NULLIF(BTRIM(_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do ajuste.';
  END IF;

  v_estoque_alvo := ROUND(_estoque_alvo, 2);
  SELECT *
  INTO v_peca
  FROM public.pecas
  WHERE id = _peca_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peça não encontrada ou excluída.';
  END IF;

  v_estoque_atual := ROUND(COALESCE(v_peca.estoque, 0), 2);
  v_diferenca := ROUND(v_estoque_alvo - v_estoque_atual, 2);
  IF ABS(v_diferenca) < 0.01 THEN
    RETURN v_peca;
  END IF;

  IF v_diferenca > 0 AND (
    _custo_unitario_entrada IS NULL OR _custo_unitario_entrada < 0
  ) THEN
    RAISE EXCEPTION 'Informe o custo unitário da quantidade que está entrando.';
  END IF;

  SELECT ROUND(COALESCE(SUM(quantidade_saldo), 0), 2)
  INTO v_saldo_lotes
  FROM public.peca_lotes
  WHERE peca_id = _peca_id
    AND quantidade_saldo > 0;

  -- Compatibilidade com saldo legado sem lote, igual à regra já usada na baixa da OS.
  v_gap_legado := ROUND(v_estoque_atual - v_saldo_lotes, 2);
  IF v_gap_legado > 0 THEN
    INSERT INTO public.peca_lotes (
      peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem
    )
    VALUES (
      _peca_id,
      v_gap_legado,
      v_gap_legado,
      ROUND(GREATEST(COALESCE(v_peca.preco_custo, 0), 0), 2),
      'ajuste_estoque_legado'
    );
  ELSIF v_gap_legado < 0 THEN
    RAISE EXCEPTION
      'A soma dos lotes excede o saldo atual. Confira os lotes antes de registrar este ajuste.';
  END IF;

  v_quantidade := ABS(v_diferenca);
  IF v_diferenca > 0 THEN
    v_tipo := 'entrada';
    v_custo_unitario := ROUND(_custo_unitario_entrada, 2);
    v_custo_total := ROUND(v_quantidade * v_custo_unitario, 2);
    v_custo_medio_novo := CASE
      WHEN v_estoque_atual + v_quantidade > 0 THEN
        ROUND(
          (
            v_estoque_atual * GREATEST(COALESCE(v_peca.preco_custo, 0), 0)
            + v_quantidade * v_custo_unitario
          ) / (v_estoque_atual + v_quantidade),
          2
        )
      ELSE v_custo_unitario
    END;

    INSERT INTO public.peca_lotes (
      peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem
    )
    VALUES (
      _peca_id, v_quantidade, v_quantidade, v_custo_unitario, 'ajuste_estoque'
    );

    UPDATE public.pecas
    SET estoque = v_estoque_alvo,
        preco_custo = v_custo_medio_novo,
        updated_at = now()
    WHERE id = _peca_id
    RETURNING * INTO v_peca;
  ELSE
    v_tipo := 'saida';
    v_restante := v_quantidade;
    FOR lote IN
      SELECT id, quantidade_saldo, custo_unitario
      FROM public.peca_lotes
      WHERE peca_id = _peca_id
        AND quantidade_saldo > 0
      ORDER BY criado_em, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_restante <= 0;
      v_retirar := LEAST(lote.quantidade_saldo, v_restante);
      UPDATE public.peca_lotes
      SET quantidade_saldo = ROUND(quantidade_saldo - v_retirar, 2)
      WHERE id = lote.id;
      v_custo_total := v_custo_total + (v_retirar * lote.custo_unitario);
      v_restante := ROUND(v_restante - v_retirar, 2);
    END LOOP;

    IF v_restante > 0 THEN
      RAISE EXCEPTION 'Lotes insuficientes para registrar a redução de estoque.';
    END IF;

    v_custo_total := ROUND(v_custo_total, 2);
    v_custo_unitario := CASE
      WHEN v_quantidade > 0 THEN ROUND(v_custo_total / v_quantidade, 2)
      ELSE 0
    END;

    UPDATE public.pecas
    SET estoque = v_estoque_alvo,
        updated_at = now()
    WHERE id = _peca_id
    RETURNING * INTO v_peca;
  END IF;

  SELECT ROUND(COALESCE(SUM(quantidade_saldo), 0), 2)
  INTO v_saldo_lotes
  FROM public.peca_lotes
  WHERE peca_id = _peca_id
    AND quantidade_saldo > 0;
  IF ABS(v_saldo_lotes - v_estoque_alvo) >= 0.01 THEN
    RAISE EXCEPTION 'O saldo final dos lotes não confere com o estoque do item.';
  END IF;

  INSERT INTO public.peca_ajustes_estoque (
    peca_id,
    tipo,
    quantidade,
    estoque_anterior,
    estoque_novo,
    custo_unitario,
    custo_total,
    motivo,
    registrado_por
  )
  VALUES (
    _peca_id,
    v_tipo,
    v_quantidade,
    v_estoque_atual,
    v_estoque_alvo,
    v_custo_unitario,
    v_custo_total,
    BTRIM(_motivo),
    auth.uid()
  );

  RETURN v_peca;
END;
$$;

COMMENT ON TABLE public.peca_ajustes_estoque IS
  'Histórico de ajustes manuais de saldo, com motivo e custo calculado a partir dos lotes.';
COMMENT ON FUNCTION public.ajustar_estoque_com_lotes(uuid, numeric, text, numeric) IS
  'Ajusta saldo somente para gerente, preservando os lotes e registrando entradas/saídas.';

REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_com_lotes(uuid, numeric, text, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_com_lotes(uuid, numeric, text, numeric)
  TO authenticated;
