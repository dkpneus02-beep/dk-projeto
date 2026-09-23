-- Quarta etapa financeira: gestão segura do ciclo de vida das despesas.

CREATE OR REPLACE FUNCTION public.editar_despesa_financeira(
  _despesa_id uuid,
  _descricao text,
  _categoria_id uuid,
  _tipo text,
  _fornecedor text,
  _competencia date,
  _data_vencimento date,
  _valor_total numeric,
  _recorrente boolean,
  _observacoes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despesa public.despesas_financeiras%ROWTYPE;
  v_parcelas integer;
  v_valor_base numeric(14,2);
  v_resto numeric(14,2);
  v_numero integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode editar despesas.';
  END IF;
  IF _descricao IS NULL OR btrim(_descricao) = '' THEN RAISE EXCEPTION 'Informe a descrição do gasto.'; END IF;
  IF _valor_total IS NULL OR _valor_total <= 0 THEN RAISE EXCEPTION 'O valor precisa ser maior que R$ 0,00.'; END IF;
  IF _tipo NOT IN ('fixo', 'variavel') THEN RAISE EXCEPTION 'Tipo de gasto inválido.'; END IF;

  SELECT * INTO v_despesa FROM public.despesas_financeiras WHERE id = _despesa_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF v_despesa.status = 'pago' THEN RAISE EXCEPTION 'Despesa paga não pode ser editada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.despesa_parcelas WHERE despesa_id = _despesa_id AND status = 'pago') THEN
    RAISE EXCEPTION 'Despesa com parcela paga não pode ser editada.';
  END IF;
  IF v_despesa.recorrente AND EXISTS (
    SELECT 1 FROM public.despesas_financeiras d
    WHERE d.recorrencia_origem_id = COALESCE(v_despesa.recorrencia_origem_id, v_despesa.id)
      AND d.id <> v_despesa.id AND d.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Série recorrente que já gerou outros meses não pode ser editada.';
  END IF;

  SELECT count(*)::integer INTO v_parcelas FROM public.despesa_parcelas WHERE despesa_id = _despesa_id;
  v_parcelas := GREATEST(v_parcelas, 1);
  v_valor_base := trunc((_valor_total / v_parcelas) * 100) / 100;
  v_resto := round((_valor_total - v_valor_base * v_parcelas) * 100) / 100;

  UPDATE public.despesas_financeiras
  SET descricao = btrim(_descricao), categoria_id = _categoria_id, tipo = _tipo,
      fornecedor = NULLIF(btrim(COALESCE(_fornecedor, '')), ''), competencia = _competencia,
      data_vencimento = _data_vencimento, valor_total = round(_valor_total, 2),
      recorrente = COALESCE(_recorrente, false), observacoes = NULLIF(btrim(COALESCE(_observacoes, '')), ''),
      updated_at = now(), status = 'pendente'
  WHERE id = _despesa_id;

  DELETE FROM public.despesa_parcelas WHERE despesa_id = _despesa_id;
  FOR v_numero IN 1..v_parcelas LOOP
    INSERT INTO public.despesa_parcelas (despesa_id, numero, valor, data_vencimento, status)
    VALUES (
      _despesa_id,
      v_numero,
      round(v_valor_base + CASE WHEN v_numero = v_parcelas THEN v_resto ELSE 0 END, 2),
      (_data_vencimento + make_interval(months => v_numero - 1))::date,
      'pendente'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_despesa_financeira(_despesa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode cancelar despesas.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.despesas_financeiras WHERE id = _despesa_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.despesa_parcelas WHERE despesa_id = _despesa_id AND status = 'pago') THEN RAISE EXCEPTION 'Despesa com parcela paga não pode ser cancelada.'; END IF;
  UPDATE public.despesas_financeiras SET status = 'cancelado', updated_at = now() WHERE id = _despesa_id;
  UPDATE public.despesa_parcelas SET status = 'cancelado', updated_at = now() WHERE despesa_id = _despesa_id AND status <> 'pago';
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_despesa_financeira(_despesa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode excluir despesas.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.despesas_financeiras WHERE id = _despesa_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.despesa_parcelas WHERE despesa_id = _despesa_id AND status = 'pago') THEN RAISE EXCEPTION 'Despesa com parcela paga não pode ser excluída.'; END IF;
  UPDATE public.despesas_financeiras SET deleted_at = now(), status = 'cancelado', updated_at = now() WHERE id = _despesa_id;
  UPDATE public.despesa_parcelas SET status = 'cancelado', updated_at = now() WHERE despesa_id = _despesa_id AND status <> 'pago';
END;
$$;

REVOKE ALL ON FUNCTION public.editar_despesa_financeira(uuid, text, uuid, text, text, date, date, numeric, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_despesa_financeira(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_despesa_financeira(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_despesa_financeira(uuid, text, uuid, text, text, date, date, numeric, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_despesa_financeira(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_despesa_financeira(uuid) TO authenticated;
