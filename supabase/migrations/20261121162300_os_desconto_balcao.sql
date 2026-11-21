-- DK Auto Center V.0.0.1 — desconto adicional do balcão na OS.
-- Preparada localmente para revisão; NÃO aplicar sem homologação/autorização.
-- A função nova mantém a RPC existente durante o cutover e grava o desconto
-- separadamente para que recibos antigos continuem distinguíveis.

ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS desconto_balcao numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.atendimentos'::regclass
      AND conname = 'atendimentos_desconto_balcao_nao_negativo'
  ) THEN
    ALTER TABLE public.atendimentos
      ADD CONSTRAINT atendimentos_desconto_balcao_nao_negativo
      CHECK (desconto_balcao IS NULL OR desconto_balcao >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_atendimento_transacional_v2(
  _atendimento_id uuid,
  _pagamentos jsonb,
  _necessita_retorno boolean DEFAULT false,
  _data_retorno_manual date DEFAULT NULL,
  _descontos jsonb DEFAULT NULL,
  _desconto_balcao numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_cfg public.configuracoes%ROWTYPE;
  v_bruto numeric(12,2);
  v_desconto_pecas numeric(12,2) := 0;
  v_desconto_balcao numeric(12,2) := ROUND(COALESCE(_desconto_balcao, 0), 2);
  v_desconto_total numeric(12,2) := 0;
  v_total numeric(12,2);
  v_garantia_ate date;
  v_garantia_km integer;
  v_finalizado_at timestamptz := now();
  v_item jsonb;
  v_servico_id uuid;
  v_percentual numeric(5,2);
  v_aceita_desconto boolean;
  v_pagamento_total numeric(12,2) := 0;
  v_pagamento_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode finalizar uma OS.';
  END IF;
  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'A OS precisa ser informada.';
  END IF;
  IF _pagamentos IS NULL OR jsonb_typeof(_pagamentos) <> 'array' THEN
    RAISE EXCEPTION 'Informe os pagamentos em uma lista válida.';
  END IF;
  IF _descontos IS NOT NULL AND jsonb_typeof(_descontos) <> 'array' THEN
    RAISE EXCEPTION 'Os descontos por peça estão em formato inválido.';
  END IF;
  IF _desconto_balcao IS NOT NULL AND _desconto_balcao < 0 THEN
    RAISE EXCEPTION 'O desconto do balcão não pode ser negativo.';
  END IF;
  IF _descontos IS NOT NULL AND EXISTS (
    SELECT value->>'servico_id'
    FROM jsonb_array_elements(_descontos)
    GROUP BY value->>'servico_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há desconto duplicado para a mesma peça.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada ou já excluída.';
  END IF;
  IF v_atendimento.status = 'finalizado' THEN
    RAISE EXCEPTION 'Esta OS já está finalizada.';
  END IF;

  IF _descontos IS NOT NULL THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(_descontos)
    LOOP
      IF NULLIF(v_item->>'servico_id', '') IS NULL
         OR NULLIF(v_item->>'percentual', '') IS NULL THEN
        RAISE EXCEPTION 'Cada desconto precisa informar peça e percentual.';
      END IF;
      v_servico_id := (v_item->>'servico_id')::uuid;
      v_percentual := ROUND((v_item->>'percentual')::numeric, 2);
      IF v_percentual < 0 OR v_percentual > 100 THEN
        RAISE EXCEPTION 'O desconto de cada peça deve ficar entre 0%% e 100%%.';
      END IF;

      BEGIN
        SELECT p.aceita_desconto_pix INTO v_aceita_desconto
        FROM public.atendimento_servicos s
        JOIN public.pecas p ON p.id = s.peca_id
        WHERE s.id = v_servico_id
          AND s.atendimento_id = _atendimento_id
          AND s.peca_id IS NOT NULL
        FOR UPDATE OF s NOWAIT;
      EXCEPTION
        WHEN lock_not_available THEN
          RAISE EXCEPTION 'Esta peça está sendo alterada por outro usuário. Tente finalizar a OS novamente.';
      END;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A peça selecionada não pertence a esta OS.';
      END IF;
      IF v_percentual > 0 AND NOT COALESCE(v_aceita_desconto, false) THEN
        RAISE EXCEPTION 'Esta peça está marcada como não elegível a desconto.';
      END IF;

      UPDATE public.atendimento_servicos
      SET desconto_percentual = v_percentual
      WHERE id = v_servico_id AND atendimento_id = _atendimento_id;
    END LOOP;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(s.valor, 0)), 0)::numeric(12,2),
    COALESCE(SUM(
      CASE WHEN s.peca_id IS NOT NULL AND COALESCE(p.aceita_desconto_pix, false) THEN
        ROUND(COALESCE(s.preco_peca, 0) * LEAST(GREATEST(COALESCE(s.desconto_percentual, 0), 0), 100) / 100, 2)
      ELSE 0 END
    ), 0)::numeric(12,2),
    MIN(NULLIF(s.garantia_km, 0))
  INTO v_bruto, v_desconto_pecas, v_garantia_km
  FROM public.atendimento_servicos s
  LEFT JOIN public.pecas p ON p.id = s.peca_id
  WHERE s.atendimento_id = _atendimento_id;

  v_desconto_pecas := LEAST(GREATEST(ROUND(COALESCE(v_desconto_pecas, 0), 2), 0), v_bruto);
  IF v_desconto_balcao > GREATEST(v_bruto - v_desconto_pecas, 0) THEN
    RAISE EXCEPTION 'O desconto do balcão não pode superar o saldo após o desconto das peças.';
  END IF;
  v_desconto_total := ROUND(v_desconto_pecas + v_desconto_balcao, 2);
  v_total := ROUND(GREATEST(v_bruto - v_desconto_total, 0), 2);

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    IF NULLIF(BTRIM(v_item->>'forma'), '') IS NULL THEN
      RAISE EXCEPTION 'Todo pagamento precisa informar a forma.';
    END IF;
    IF COALESCE((v_item->>'valor')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'O valor de pagamento não pode ser negativo.';
    END IF;
    IF COALESCE((v_item->>'parcelas')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'O número de parcelas precisa ser maior que zero.';
    END IF;
    v_pagamento_total := v_pagamento_total + ROUND(COALESCE((v_item->>'valor')::numeric, 0), 2);
    v_pagamento_count := v_pagamento_count + 1;
  END LOOP;

  IF v_pagamento_count = 0 OR ABS(v_pagamento_total - v_total) >= 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos deve ser igual ao total da OS.';
  END IF;

  SELECT * INTO v_cfg FROM public.configuracoes LIMIT 1;
  v_garantia_ate := (CURRENT_DATE + COALESCE(v_cfg.garantia_dias, 90))::date;
  IF v_garantia_km IS NOT NULL THEN
    v_garantia_km := COALESCE(v_atendimento.km, 0) + v_garantia_km;
  END IF;

  UPDATE public.atendimentos
  SET status = 'finalizado',
      desconto = v_desconto_total,
      desconto_balcao = v_desconto_balcao,
      total = v_total,
      finalizado_at = v_finalizado_at,
      garantia_ate = v_garantia_ate,
      garantia_km = v_garantia_km,
      necessita_retorno = COALESCE(_necessita_retorno, false),
      data_retorno_manual = CASE
        WHEN COALESCE(_necessita_retorno, false) THEN _data_retorno_manual
        ELSE NULL
      END
  WHERE id = _atendimento_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    INSERT INTO public.pagamentos (atendimento_id, forma, valor, parcelas, pago)
    VALUES (
      _atendimento_id,
      BTRIM(v_item->>'forma'),
      ROUND((v_item->>'valor')::numeric, 2),
      (v_item->>'parcelas')::integer,
      false
    );
  END LOOP;

  IF COALESCE(_necessita_retorno, false) AND _data_retorno_manual IS NOT NULL THEN
    INSERT INTO public.notificacoes_retorno
      (atendimento_id, cliente_nome, telefone, veiculo, servico, vencimento)
    SELECT
      _atendimento_id,
      v_atendimento.cliente_nome,
      v_atendimento.cliente_telefone,
      BTRIM(COALESCE(v_atendimento.modelo, '') || ' ' || v_atendimento.placa),
      COALESCE(string_agg(COALESCE(s.nome_peca_snapshot, s.nome), ', ' ORDER BY COALESCE(s.nome_peca_snapshot, s.nome)), 'Serviço realizado'),
      _data_retorno_manual
    FROM public.atendimento_servicos s
    WHERE s.atendimento_id = _atendimento_id;
  END IF;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'total', v_total,
    'desconto', v_desconto_total,
    'desconto_pecas', v_desconto_pecas,
    'desconto_balcao', v_desconto_balcao,
    'garantia_ate', v_garantia_ate,
    'garantia_km', v_garantia_km,
    'finalizado_at', v_finalizado_at,
    'pago', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_atendimento_transacional_v2(uuid, jsonb, boolean, date, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_transacional_v2(uuid, jsonb, boolean, date, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_transacional_v2(uuid, jsonb, boolean, date, jsonb, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.limpar_desconto_balcao_ao_reabrir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'finalizado' AND NEW.status IS DISTINCT FROM 'finalizado' THEN
    NEW.desconto_balcao := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atendimentos_limpar_desconto_balcao_ao_reabrir ON public.atendimentos;
CREATE TRIGGER atendimentos_limpar_desconto_balcao_ao_reabrir
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.limpar_desconto_balcao_ao_reabrir();

COMMENT ON COLUMN public.atendimentos.desconto_balcao IS
  'Valor adicional concedido no balcão após os descontos das peças; NULL identifica OS legadas sem essa discriminação.';

NOTIFY pgrst, 'reload schema';
