-- Terceira etapa financeira: geração idempotente de despesas recorrentes.

ALTER TABLE public.despesas_financeiras
  ADD COLUMN IF NOT EXISTS recorrencia_origem_id uuid REFERENCES public.despesas_financeiras(id);

CREATE INDEX IF NOT EXISTS despesas_financeiras_recorrencia_origem_idx
  ON public.despesas_financeiras (recorrencia_origem_id);

CREATE UNIQUE INDEX IF NOT EXISTS despesas_financeiras_recorrencia_competencia_uq
  ON public.despesas_financeiras (recorrencia_origem_id, competencia);

UPDATE public.despesas_financeiras
SET recorrencia_origem_id = id
WHERE recorrente = true
  AND recorrencia_origem_id IS NULL
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.gerar_despesas_recorrentes(
  _competencia date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes date := date_trunc('month', _competencia)::date;
  v_origem public.despesas_financeiras%ROWTYPE;
  v_parcela public.despesa_parcelas%ROWTYPE;
  v_nova_id uuid;
  v_offset integer;
  v_criadas integer := 0;
  v_meses_desde_origem integer;
  v_competencia_nova date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode gerar despesas recorrentes.';
  END IF;

  IF _competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a competência para gerar recorrências.';
  END IF;

  FOR v_origem IN
    SELECT d.*
    FROM public.despesas_financeiras d
    WHERE d.recorrente = true
      AND d.deleted_at IS NULL
      AND d.status <> 'cancelado'
      AND d.competencia <= v_mes
      AND (d.recorrencia_origem_id IS NULL OR d.recorrencia_origem_id = d.id)
  LOOP
    IF v_origem.recorrencia_origem_id IS NULL THEN
      UPDATE public.despesas_financeiras
      SET recorrencia_origem_id = id
      WHERE id = v_origem.id;
      v_origem.recorrencia_origem_id := v_origem.id;
    END IF;

    v_meses_desde_origem := ((EXTRACT(YEAR FROM v_mes) - EXTRACT(YEAR FROM v_origem.competencia)) * 12 + EXTRACT(MONTH FROM v_mes) - EXTRACT(MONTH FROM v_origem.competencia))::integer;
    IF v_meses_desde_origem < v_origem.recorrencia_meses THEN
      CONTINUE;
    END IF;

    v_offset := v_origem.recorrencia_meses;
    WHILE v_offset <= v_meses_desde_origem LOOP
      v_competencia_nova := (v_origem.competencia + make_interval(months => v_offset))::date;

      INSERT INTO public.despesas_financeiras (
        descricao, categoria_id, tipo, fornecedor, competencia, data_emissao,
        data_vencimento, valor_total, status, recorrente, recorrencia_meses,
        codigo_barras, observacoes, comprovante_path, criado_por, recorrencia_origem_id
      )
      VALUES (
        v_origem.descricao, v_origem.categoria_id, v_origem.tipo, v_origem.fornecedor,
        v_competencia_nova, v_origem.data_emissao,
        (v_origem.data_vencimento + make_interval(months => v_offset))::date,
        v_origem.valor_total, 'pendente', true, v_origem.recorrencia_meses,
        v_origem.codigo_barras, v_origem.observacoes, v_origem.comprovante_path,
        v_origem.criado_por, v_origem.id
      )
      ON CONFLICT (recorrencia_origem_id, competencia) DO NOTHING
      RETURNING id INTO v_nova_id;

      IF v_nova_id IS NOT NULL THEN
        FOR v_parcela IN
          SELECT p.* FROM public.despesa_parcelas p WHERE p.despesa_id = v_origem.id ORDER BY p.numero
        LOOP
          INSERT INTO public.despesa_parcelas (
            despesa_id, numero, valor, data_vencimento, status
          )
          VALUES (
            v_nova_id, v_parcela.numero, v_parcela.valor,
            (v_parcela.data_vencimento + make_interval(months => v_offset))::date,
            'pendente'
          );
        END LOOP;
        v_criadas := v_criadas + 1;
      END IF;

      v_offset := v_offset + v_origem.recorrencia_meses;
    END LOOP;
  END LOOP;

  RETURN v_criadas;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_despesas_recorrentes(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_despesas_recorrentes(date) TO authenticated;

COMMENT ON FUNCTION public.gerar_despesas_recorrentes(date) IS
  'Gera ocorrências futuras de despesas recorrentes até a competência informada sem duplicar séries já criadas.';
