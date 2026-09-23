-- Sexta etapa financeira: histórico de CMV por consumo real de peças e pneus.
-- O preço de venda da OS permanece separado do custo de estoque.

CREATE TABLE IF NOT EXISTS public.atendimento_pecas_cmv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_servico_id uuid NOT NULL REFERENCES public.atendimento_servicos(id) ON DELETE CASCADE,
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  peca_id uuid NOT NULL REFERENCES public.pecas(id),
  quantidade numeric(12,2) NOT NULL CHECK (quantidade > 0),
  custo_unitario numeric(12,2) NOT NULL CHECK (custo_unitario >= 0),
  custo_total numeric(12,2) NOT NULL CHECK (custo_total >= 0),
  tipo text NOT NULL CHECK (tipo IN ('consumo', 'estorno')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atendimento_pecas_cmv_atendimento_idx
  ON public.atendimento_pecas_cmv (atendimento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS atendimento_pecas_cmv_servico_idx
  ON public.atendimento_pecas_cmv (atendimento_servico_id, criado_em DESC);

GRANT SELECT ON public.atendimento_pecas_cmv TO authenticated;
GRANT ALL ON public.atendimento_pecas_cmv TO service_role;
ALTER TABLE public.atendimento_pecas_cmv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atendimento_pecas_cmv_gerente" ON public.atendimento_pecas_cmv;
CREATE POLICY "atendimento_pecas_cmv_gerente" ON public.atendimento_pecas_cmv
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

-- Backfill conservador para consumos antigos: registra o custo conhecido hoje
-- e deixa explícito que os novos eventos passam a capturar o custo no momento do consumo.
INSERT INTO public.atendimento_pecas_cmv
  (atendimento_servico_id, atendimento_id, peca_id, quantidade, custo_unitario, custo_total, tipo)
SELECT m.atendimento_servico_id, m.atendimento_id, m.peca_id, m.quantidade,
       ROUND(COALESCE(p.preco_custo, 0), 2),
       ROUND(COALESCE(p.preco_custo, 0) * m.quantidade, 2),
       'consumo'
FROM public.atendimento_pecas_movimentos m
JOIN public.pecas p ON p.id = m.peca_id
WHERE m.tipo = 'consumo'
  AND NOT EXISTS (
    SELECT 1 FROM public.atendimento_pecas_cmv c
    WHERE c.atendimento_servico_id = m.atendimento_servico_id
      AND c.tipo = 'consumo'
  );

CREATE OR REPLACE FUNCTION public.baixar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
  custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode consumir peças ao finalizar uma OS.';
  END IF;

  FOR item IN
    SELECT s.id, s.peca_id, s.quantidade, s.nome, COALESCE(p.preco_custo, 0) AS preco_custo
    FROM public.atendimento_servicos s
    JOIN public.pecas p ON p.id = s.peca_id
    WHERE s.atendimento_id = _atendimento_id
      AND s.peca_id IS NOT NULL
      AND s.quantidade > 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.atendimento_pecas_movimentos m
      WHERE m.atendimento_servico_id = item.id AND m.tipo = 'consumo'
    ) THEN
      CONTINUE;
    END IF;

    custo := ROUND(GREATEST(COALESCE(item.preco_custo, 0), 0), 2);
    UPDATE public.pecas
    SET estoque = estoque - item.quantidade, updated_at = now()
    WHERE id = item.peca_id AND deleted_at IS NULL AND estoque >= item.quantidade;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para a peça do serviço: %.', item.nome;
    END IF;

    INSERT INTO public.atendimento_pecas_movimentos
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, tipo)
    VALUES (item.id, _atendimento_id, item.peca_id, item.quantidade, 'consumo');

    INSERT INTO public.atendimento_pecas_cmv
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, custo_unitario, custo_total, tipo)
    VALUES (item.id, _atendimento_id, item.peca_id, item.quantidade, custo,
            ROUND(custo * item.quantidade, 2), 'consumo');
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
  custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode reabrir uma OS e estornar peças.';
  END IF;

  FOR item IN
    SELECT m.id, m.atendimento_servico_id, m.peca_id, m.quantidade,
           COALESCE((SELECT c.custo_unitario FROM public.atendimento_pecas_cmv c
                     WHERE c.atendimento_servico_id = m.atendimento_servico_id AND c.tipo = 'consumo'
                     ORDER BY c.criado_em DESC LIMIT 1), p.preco_custo, 0) AS custo_unitario
    FROM public.atendimento_pecas_movimentos m
    JOIN public.pecas p ON p.id = m.peca_id
    WHERE m.atendimento_id = _atendimento_id AND m.tipo = 'consumo'
  LOOP
    UPDATE public.pecas SET estoque = estoque + item.quantidade, updated_at = now() WHERE id = item.peca_id;
    custo := ROUND(GREATEST(COALESCE(item.custo_unitario, 0), 0), 2);
    INSERT INTO public.atendimento_pecas_cmv
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, custo_unitario, custo_total, tipo)
    VALUES (item.atendimento_servico_id, _atendimento_id, item.peca_id, item.quantidade, custo,
            ROUND(custo * item.quantidade, 2), 'estorno');
  END LOOP;

  DELETE FROM public.atendimento_pecas_movimentos
  WHERE atendimento_id = _atendimento_id AND tipo = 'consumo';
END; $$;

REVOKE ALL ON FUNCTION public.baixar_pecas_atendimento(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estornar_pecas_atendimento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixar_pecas_atendimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pecas_atendimento(uuid) TO authenticated;
