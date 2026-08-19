-- Entrada rápida de estoque: operação atômica e restrita ao gerente.
CREATE OR REPLACE FUNCTION public.adicionar_entrada_estoque(
  _peca_id uuid,
  _quantidade numeric
)
RETURNS public.pecas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peca public.pecas;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode registrar entrada de estoque.';
  END IF;

  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
  END IF;

  UPDATE public.pecas
  SET estoque = estoque + _quantidade,
      updated_at = now()
  WHERE id = _peca_id
    AND deleted_at IS NULL
  RETURNING * INTO v_peca;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado ou excluído.';
  END IF;

  RETURN v_peca;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric) TO authenticated;
