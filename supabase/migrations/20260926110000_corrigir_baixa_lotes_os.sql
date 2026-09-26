-- Corrige a ordem da baixa de estoque na finalização da OS.
-- Antes, baixar_pecas_atendimento diminuía pecas.estoque antes de
-- consumir_lotes_estoque. Quando a OS consumia todo o saldo, a função de
-- lotes recebia estoque zero e lançava falso "estoque insuficiente".
-- Agora a função de lotes valida/baixa lotes e o saldo da peça na mesma
-- transação; qualquer erro desfaz tudo.

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

  -- Compatibilidade com saldo legado sem lote.
  v_diferenca := ROUND(v_estoque - v_saldo_lotes, 2);
  IF v_diferenca > 0 THEN
    INSERT INTO public.peca_lotes (
      peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem
    )
    VALUES (
      _peca_id, v_diferenca, v_diferenca, v_custo, 'ajuste_estoque_legado'
    );
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

  UPDATE public.pecas
  SET estoque = estoque - _quantidade,
      updated_at = now()
  WHERE id = _peca_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_pecas_atendimento(_atendimento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode consumir peças ao finalizar uma OS.';
  END IF;

  FOR item IN
    SELECT s.id, s.peca_id, s.quantidade, s.nome,
           COALESCE(p.preco_custo, 0) AS preco_custo
    FROM public.atendimento_servicos s
    JOIN public.pecas p ON p.id = s.peca_id
    WHERE s.atendimento_id = _atendimento_id
      AND s.peca_id IS NOT NULL
      AND s.quantidade > 0
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.atendimento_pecas_movimentos m
      WHERE m.atendimento_servico_id = item.id
        AND m.tipo = 'consumo'
    ) THEN
      CONTINUE;
    END IF;

    custo := ROUND(GREATEST(COALESCE(item.preco_custo, 0), 0), 2);
    PERFORM public.consumir_lotes_estoque(item.peca_id, item.quantidade);

    INSERT INTO public.atendimento_pecas_movimentos
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, tipo)
    VALUES
      (item.id, _atendimento_id, item.peca_id, item.quantidade, 'consumo');

    INSERT INTO public.atendimento_pecas_cmv
      (atendimento_servico_id, atendimento_id, peca_id, quantidade,
       custo_unitario, custo_total, tipo)
    VALUES
      (item.id, _atendimento_id, item.peca_id, item.quantidade,
       custo, ROUND(custo * item.quantidade, 2), 'consumo');
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consumir_lotes_estoque(uuid, numeric) TO authenticated;
