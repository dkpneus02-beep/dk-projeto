-- Sétima etapa financeira: custo direto e histórico da mão de obra.
-- O percentual é configurável pelo gerente e é congelado na finalização da OS.

CREATE TABLE IF NOT EXISTS public.financeiro_parametros (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  custo_mao_obra_percentual numeric(6,2) NOT NULL DEFAULT 0 CHECK (custo_mao_obra_percentual >= 0 AND custo_mao_obra_percentual <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.financeiro_parametros (id, custo_mao_obra_percentual)
VALUES (true, 0)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.financeiro_parametros TO authenticated;
GRANT ALL ON public.financeiro_parametros TO service_role;
ALTER TABLE public.financeiro_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financeiro_parametros_gerente" ON public.financeiro_parametros;
CREATE POLICY "financeiro_parametros_gerente" ON public.financeiro_parametros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE TABLE IF NOT EXISTS public.atendimento_mao_obra_custos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_servico_id uuid NOT NULL REFERENCES public.atendimento_servicos(id) ON DELETE CASCADE,
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  mecanico_id uuid REFERENCES public.mecanicos(id),
  base_mao_obra numeric(12,2) NOT NULL CHECK (base_mao_obra >= 0),
  percentual numeric(6,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  custo_total numeric(12,2) NOT NULL CHECK (custo_total >= 0),
  tipo text NOT NULL CHECK (tipo IN ('consumo', 'estorno')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atendimento_mao_obra_custos_atendimento_idx
  ON public.atendimento_mao_obra_custos (atendimento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS atendimento_mao_obra_custos_servico_idx
  ON public.atendimento_mao_obra_custos (atendimento_servico_id, criado_em DESC);

GRANT SELECT ON public.atendimento_mao_obra_custos TO authenticated;
GRANT ALL ON public.atendimento_mao_obra_custos TO service_role;
ALTER TABLE public.atendimento_mao_obra_custos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atendimento_mao_obra_custos_gerente" ON public.atendimento_mao_obra_custos;
CREATE POLICY "atendimento_mao_obra_custos_gerente" ON public.atendimento_mao_obra_custos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.salvar_percentual_custo_mao_obra(_percentual numeric)
RETURNS public.financeiro_parametros
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resultado public.financeiro_parametros;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode alterar o custo de mão de obra.';
  END IF;
  IF _percentual IS NULL OR _percentual < 0 OR _percentual > 100 THEN
    RAISE EXCEPTION 'O percentual de custo de mão de obra deve estar entre 0 e 100.';
  END IF;

  UPDATE public.financeiro_parametros
  SET custo_mao_obra_percentual = ROUND(_percentual, 2), updated_at = now(), updated_by = auth.uid()
  WHERE id = true
  RETURNING * INTO resultado;
  RETURN resultado;
END; $$;

REVOKE ALL ON FUNCTION public.salvar_percentual_custo_mao_obra(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_percentual_custo_mao_obra(numeric) TO authenticated;

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
      SELECT 1 FROM public.atendimento_mao_obra_custos c
      WHERE c.atendimento_servico_id = item.id AND c.tipo = 'consumo'
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
    WHERE c.atendimento_id = _atendimento_id AND c.tipo = 'consumo'
  LOOP
    INSERT INTO public.atendimento_mao_obra_custos
      (atendimento_servico_id, atendimento_id, mecanico_id, base_mao_obra, percentual, custo_total, tipo)
    VALUES (item.atendimento_servico_id, _atendimento_id, item.mecanico_id, item.base_mao_obra,
            item.percentual, item.custo_total, 'estorno');
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.registrar_custo_mao_obra_atendimento(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estornar_custo_mao_obra_atendimento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_custo_mao_obra_atendimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_custo_mao_obra_atendimento(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.atendimentos_movimentar_pecas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' THEN
    PERFORM public.baixar_pecas_atendimento(NEW.id);
    PERFORM public.registrar_custo_mao_obra_atendimento(NEW.id);
  ELSIF OLD.status = 'finalizado' AND NEW.status IS DISTINCT FROM 'finalizado' THEN
    PERFORM public.estornar_pecas_atendimento(NEW.id);
    PERFORM public.estornar_custo_mao_obra_atendimento(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
