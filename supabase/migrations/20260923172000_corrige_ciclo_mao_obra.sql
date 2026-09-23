-- Correção da revisão: o ciclo consumo -> estorno -> novo consumo deve ser repetível.
-- O último evento do serviço determina se existe custo ativo.

CREATE OR REPLACE FUNCTION public.registrar_custo_mao_obra_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
  percentual numeric;
  custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode registrar o custo de mão de obra na finalização.';
  END IF;

  SELECT COALESCE(custo_mao_obra_percentual, 0) INTO percentual
  FROM public.financeiro_parametros WHERE id = true;
  percentual := ROUND(GREATEST(COALESCE(percentual, 0), 0), 2);

  FOR item IN
    SELECT s.id, s.mecanico_id, GREATEST(COALESCE(s.mao_de_obra, 0), 0) AS base_mao_obra
    FROM public.atendimento_servicos s
    WHERE s.atendimento_id = _atendimento_id AND COALESCE(s.mao_de_obra, 0) > 0
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.atendimento_mao_obra_custos c
      WHERE c.atendimento_servico_id = item.id
        AND c.tipo = 'consumo'
        AND NOT EXISTS (
          SELECT 1
          FROM public.atendimento_mao_obra_custos estorno
          WHERE estorno.atendimento_servico_id = c.atendimento_servico_id
            AND estorno.tipo = 'estorno'
            AND estorno.criado_em > c.criado_em
        )
    ) THEN
      CONTINUE;
    END IF;

    custo := ROUND(item.base_mao_obra * percentual / 100, 2);
    INSERT INTO public.atendimento_mao_obra_custos
      (atendimento_servico_id, atendimento_id, mecanico_id, base_mao_obra, percentual, custo_total, tipo)
    VALUES (item.id, _atendimento_id, item.mecanico_id, ROUND(item.base_mao_obra, 2), percentual, custo, 'consumo');
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_custo_mao_obra_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode estornar o custo de mão de obra.';
  END IF;

  FOR item IN
    SELECT c.atendimento_servico_id, c.mecanico_id, c.base_mao_obra, c.percentual, c.custo_total
    FROM public.atendimento_mao_obra_custos c
    WHERE c.atendimento_id = _atendimento_id
      AND c.tipo = 'consumo'
      AND NOT EXISTS (
        SELECT 1
        FROM public.atendimento_mao_obra_custos estorno
        WHERE estorno.atendimento_servico_id = c.atendimento_servico_id
          AND estorno.tipo = 'estorno'
          AND estorno.criado_em > c.criado_em
      )
  LOOP
    INSERT INTO public.atendimento_mao_obra_custos
      (atendimento_servico_id, atendimento_id, mecanico_id, base_mao_obra, percentual, custo_total, tipo)
    VALUES (item.atendimento_servico_id, _atendimento_id, item.mecanico_id, item.base_mao_obra,
            item.percentual, item.custo_total, 'estorno');
  END LOOP;
END; $$;
