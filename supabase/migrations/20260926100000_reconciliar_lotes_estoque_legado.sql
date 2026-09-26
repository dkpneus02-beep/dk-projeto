-- Corrige o estoque legado criado antes da implantação de peca_lotes.
-- Algumas entradas antigas atualizaram pecas.estoque sem criar um lote correspondente.
-- A diferença é registrada como lote de ajuste, preservando rastreabilidade.

DO $$
DECLARE
  item record;
  saldo_lotes numeric;
  diferenca numeric;
BEGIN
  FOR item IN
    SELECT p.id, p.estoque, ROUND(GREATEST(COALESCE(p.preco_custo, 0), 0), 2) AS custo
    FROM public.pecas p
    WHERE p.deleted_at IS NULL
      AND p.estoque > 0
  LOOP
    SELECT COALESCE(SUM(l.quantidade_saldo), 0)
    INTO saldo_lotes
    FROM public.peca_lotes l
    WHERE l.peca_id = item.id
      AND l.quantidade_saldo > 0;

    diferenca := ROUND(item.estoque - saldo_lotes, 2);
    IF diferenca > 0 THEN
      INSERT INTO public.peca_lotes (
        peca_id,
        quantidade_inicial,
        quantidade_saldo,
        custo_unitario,
        origem
      )
      VALUES (item.id, diferenca, diferenca, item.custo, 'ajuste_estoque_legado');
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_lotes_estoque(
  _peca_id uuid,
  _quantidade numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estoque numeric;
  v_saldo_lotes numeric;
  v_custo numeric;
  v_diferenca numeric;
  lote record;
  restante numeric := ROUND(COALESCE(_quantidade, 0), 2);
  retirar numeric;
BEGIN
  IF restante <= 0 THEN
    RAISE EXCEPTION 'A quantidade para baixa deve ser maior que zero.';
  END IF;

  SELECT p.estoque, ROUND(GREATEST(COALESCE(p.preco_custo, 0), 0), 2)
  INTO v_estoque, v_custo
  FROM public.pecas p
  WHERE p.id = _peca_id
    AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peça não encontrada para baixa de estoque.';
  END IF;
  IF v_estoque < restante THEN
    RAISE EXCEPTION 'Estoque insuficiente para a baixa de estoque.';
  END IF;

  SELECT COALESCE(SUM(l.quantidade_saldo), 0)
  INTO v_saldo_lotes
  FROM public.peca_lotes l
  WHERE l.peca_id = _peca_id
    AND l.quantidade_saldo > 0;

  -- Compatibilidade com entradas antigas que não tinham lote.
  v_diferenca := ROUND(v_estoque - v_saldo_lotes, 2);
  IF v_diferenca > 0 THEN
    INSERT INTO public.peca_lotes (
      peca_id,
      quantidade_inicial,
      quantidade_saldo,
      custo_unitario,
      origem
    )
    VALUES (_peca_id, v_diferenca, v_diferenca, v_custo, 'ajuste_estoque_legado');
  END IF;

  FOR lote IN
    SELECT id, quantidade_saldo
    FROM public.peca_lotes
    WHERE peca_id = _peca_id
      AND quantidade_saldo > 0
    ORDER BY criado_em, id
    FOR UPDATE
  LOOP
    EXIT WHEN restante <= 0;
    retirar := LEAST(lote.quantidade_saldo, restante);
    UPDATE public.peca_lotes
    SET quantidade_saldo = ROUND(quantidade_saldo - retirar, 2)
    WHERE id = lote.id;
    restante := ROUND(restante - retirar, 2);
  END LOOP;

  IF restante > 0 THEN
    RAISE EXCEPTION 'Lotes insuficientes para a baixa de estoque.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consumir_lotes_estoque(uuid, numeric) TO authenticated;
