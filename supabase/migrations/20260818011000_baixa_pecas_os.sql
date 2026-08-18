-- Fase 3: vínculo de peças à OS com baixa e estorno protegidos no banco.
-- A baixa acontece somente na transição para finalizado e apenas uma vez por serviço.

CREATE TABLE IF NOT EXISTS public.atendimento_pecas_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_servico_id uuid NOT NULL UNIQUE REFERENCES public.atendimento_servicos(id) ON DELETE CASCADE,
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  peca_id uuid NOT NULL REFERENCES public.pecas(id),
  quantidade numeric(12,2) NOT NULL CHECK (quantidade > 0),
  tipo text NOT NULL DEFAULT 'consumo' CHECK (tipo IN ('consumo', 'estorno')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_pecas_movimentos TO authenticated;
GRANT ALL ON public.atendimento_pecas_movimentos TO service_role;
ALTER TABLE public.atendimento_pecas_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_pecas_movimentos_gerente" ON public.atendimento_pecas_movimentos;
CREATE POLICY "atendimento_pecas_movimentos_gerente"
  ON public.atendimento_pecas_movimentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.baixar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode consumir peças ao finalizar uma OS.';
  END IF;

  FOR item IN
    SELECT s.id, s.peca_id, s.quantidade, s.nome
    FROM public.atendimento_servicos s
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

    UPDATE public.pecas
    SET estoque = estoque - item.quantidade,
        updated_at = now()
    WHERE id = item.peca_id
      AND deleted_at IS NULL
      AND estoque >= item.quantidade;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para a peça do serviço: %.', item.nome;
    END IF;

    INSERT INTO public.atendimento_pecas_movimentos
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, tipo)
    VALUES
      (item.id, _atendimento_id, item.peca_id, item.quantidade, 'consumo');
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode reabrir uma OS e estornar peças.';
  END IF;

  FOR item IN
    SELECT id, peca_id, quantidade
    FROM public.atendimento_pecas_movimentos
    WHERE atendimento_id = _atendimento_id AND tipo = 'consumo'
  LOOP
    UPDATE public.pecas
    SET estoque = estoque + item.quantidade,
        updated_at = now()
    WHERE id = item.peca_id;
  END LOOP;

  DELETE FROM public.atendimento_pecas_movimentos
  WHERE atendimento_id = _atendimento_id AND tipo = 'consumo';
END; $$;

GRANT EXECUTE ON FUNCTION public.baixar_pecas_atendimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pecas_atendimento(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.atendimentos_movimentar_pecas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' THEN
    PERFORM public.baixar_pecas_atendimento(NEW.id);
  ELSIF OLD.status = 'finalizado' AND NEW.status IS DISTINCT FROM 'finalizado' THEN
    PERFORM public.estornar_pecas_atendimento(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimentos_movimentar_pecas ON public.atendimentos;
CREATE TRIGGER atendimentos_movimentar_pecas
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.atendimentos_movimentar_pecas();
