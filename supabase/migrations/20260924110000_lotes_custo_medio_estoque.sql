-- Oitava etapa financeira: lotes e custo médio ponderado de estoque.

CREATE TABLE IF NOT EXISTS public.peca_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id uuid NOT NULL REFERENCES public.pecas(id),
  quantidade_inicial numeric(12,2) NOT NULL CHECK (quantidade_inicial > 0),
  quantidade_saldo numeric(12,2) NOT NULL CHECK (quantidade_saldo >= 0),
  custo_unitario numeric(12,2) NOT NULL CHECK (custo_unitario >= 0),
  origem text NOT NULL DEFAULT 'entrada',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS peca_lotes_saldo_idx ON public.peca_lotes (peca_id, criado_em) WHERE quantidade_saldo > 0;
GRANT SELECT ON public.peca_lotes TO authenticated;
GRANT ALL ON public.peca_lotes TO service_role;
ALTER TABLE public.peca_lotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "peca_lotes_gerente" ON public.peca_lotes;
CREATE POLICY "peca_lotes_gerente" ON public.peca_lotes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

INSERT INTO public.peca_lotes (peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem)
SELECT p.id, p.estoque, p.estoque, ROUND(GREATEST(COALESCE(p.preco_custo, 0), 0), 2), 'saldo_inicial'
FROM public.pecas p
WHERE p.estoque > 0
  AND NOT EXISTS (SELECT 1 FROM public.peca_lotes l WHERE l.peca_id = p.id);

CREATE OR REPLACE FUNCTION public.adicionar_entrada_estoque_com_custo(
  _peca_id uuid,
  _quantidade numeric,
  _preco_custo numeric
)
RETURNS public.pecas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_peca public.pecas;
  v_novo_custo numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode registrar entrada de estoque.';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
  END IF;
  IF _preco_custo IS NULL OR _preco_custo < 0 THEN
    RAISE EXCEPTION 'O custo unitário não pode ser negativo.';
  END IF;

  SELECT * INTO v_peca FROM public.pecas WHERE id = _peca_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item de estoque não encontrado ou excluído.'; END IF;

  v_novo_custo := CASE WHEN v_peca.estoque + _quantidade > 0
    THEN ROUND(((v_peca.estoque * COALESCE(v_peca.preco_custo, 0)) + (_quantidade * _preco_custo)) / (v_peca.estoque + _quantidade), 2)
    ELSE ROUND(_preco_custo, 2) END;

  UPDATE public.pecas
  SET estoque = estoque + _quantidade, preco_custo = v_novo_custo, updated_at = now()
  WHERE id = _peca_id
  RETURNING * INTO v_peca;

  INSERT INTO public.peca_lotes (peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem)
  VALUES (_peca_id, ROUND(_quantidade, 2), ROUND(_quantidade, 2), ROUND(_preco_custo, 2), 'entrada');
  RETURN v_peca;
END; $$;

CREATE OR REPLACE FUNCTION public.adicionar_entrada_estoque(_peca_id uuid, _quantidade numeric)
RETURNS public.pecas LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_custo numeric;
BEGIN
  SELECT preco_custo INTO v_custo FROM public.pecas WHERE id = _peca_id;
  RETURN public.adicionar_entrada_estoque_com_custo(_peca_id, _quantidade, COALESCE(v_custo, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.consumir_lotes_estoque(_peca_id uuid, _quantidade numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lote record; restante numeric := _quantidade; retirar numeric;
BEGIN
  FOR lote IN SELECT id, quantidade_saldo FROM public.peca_lotes WHERE peca_id = _peca_id AND quantidade_saldo > 0 ORDER BY criado_em, id FOR UPDATE LOOP
    EXIT WHEN restante <= 0;
    retirar := LEAST(lote.quantidade_saldo, restante);
    UPDATE public.peca_lotes SET quantidade_saldo = quantidade_saldo - retirar WHERE id = lote.id;
    restante := restante - retirar;
  END LOOP;
  IF restante > 0.001 THEN RAISE EXCEPTION 'Lotes insuficientes para a baixa de estoque.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.repor_estoque_com_custo(_peca_id uuid, _quantidade numeric, _custo numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.pecas; novo_custo numeric;
BEGIN
  SELECT * INTO p FROM public.pecas WHERE id = _peca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada para estorno.'; END IF;
  novo_custo := CASE WHEN p.estoque + _quantidade > 0
    THEN ROUND(((p.estoque * COALESCE(p.preco_custo, 0)) + (_quantidade * _custo)) / (p.estoque + _quantidade), 2)
    ELSE ROUND(_custo, 2) END;
  UPDATE public.pecas SET estoque = estoque + _quantidade, preco_custo = novo_custo, updated_at = now() WHERE id = _peca_id;
  INSERT INTO public.peca_lotes (peca_id, quantidade_inicial, quantidade_saldo, custo_unitario, origem)
  VALUES (_peca_id, _quantidade, _quantidade, ROUND(_custo, 2), 'estorno');
END; $$;

GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque_com_custo(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_lotes_estoque(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repor_estoque_com_custo(uuid, numeric, numeric) TO authenticated;
