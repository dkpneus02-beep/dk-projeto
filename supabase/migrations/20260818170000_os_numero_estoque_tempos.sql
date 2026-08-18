-- Correção cirúrgica: numeração reutilizável, estoque e tempos de serviço.
-- Não altera o Realtime e mantém a exclusão lógica das OS.

-- A próxima OS usa o menor número positivo livre entre as OS não excluídas.
-- O advisory lock evita colisão em aberturas simultâneas.
CREATE OR REPLACE FUNCTION public.proximo_numero_atendimento()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidato integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(741002, 1);
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.atendimentos
      WHERE deleted_at IS NULL
        AND numero = candidato
    ) THEN
      RETURN candidato;
    END IF;
    candidato := candidato + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.proximo_numero_atendimento() TO authenticated;

ALTER TABLE public.atendimentos
  ALTER COLUMN numero SET DEFAULT public.proximo_numero_atendimento();

-- Registros excluídos podem conservar o número antigo; OS ativas nunca repetem número.
CREATE UNIQUE INDEX IF NOT EXISTS atendimentos_numero_ativo_unique
  ON public.atendimentos (numero)
  WHERE deleted_at IS NULL;

-- Horários de execução por serviço.
ALTER TABLE public.atendimento_servicos
  ADD COLUMN IF NOT EXISTS iniciado_at timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_at timestamptz;

-- Backfill conservador: só preenche o que pode ser inferido sem inventar horário de fim.
UPDATE public.atendimento_servicos s
   SET iniciado_at = COALESCE(s.iniciado_at, s.created_at),
       concluido_at = COALESCE(s.concluido_at, a.finalizado_at)
  FROM public.atendimentos a
 WHERE a.id = s.atendimento_id
   AND (s.iniciado_at IS NULL OR (s.status = 'concluido' AND s.concluido_at IS NULL));

CREATE OR REPLACE FUNCTION public.registrar_tempos_atendimento_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('em_execucao', 'concluido') THEN
      NEW.iniciado_at := COALESCE(NEW.iniciado_at, now());
    END IF;
    IF NEW.status = 'concluido' THEN
      NEW.concluido_at := COALESCE(NEW.concluido_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'em_execucao' AND OLD.status IS DISTINCT FROM 'em_execucao' THEN
    NEW.iniciado_at := COALESCE(OLD.iniciado_at, now());
    NEW.concluido_at := NULL;
  ELSIF NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM 'concluido' THEN
    NEW.iniciado_at := COALESCE(OLD.iniciado_at, now());
    NEW.concluido_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrar_tempos_atendimento_servico ON public.atendimento_servicos;
CREATE TRIGGER registrar_tempos_atendimento_servico
  BEFORE INSERT OR UPDATE OF status ON public.atendimento_servicos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_tempos_atendimento_servico();

-- Serviço que já consumiu uma peça: ao ser excluído, devolve a quantidade antes
-- de o ON DELETE CASCADE remover o movimento de consumo.
CREATE OR REPLACE FUNCTION public.devolver_peca_ao_excluir_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  movimento record;
BEGIN
  SELECT m.peca_id, m.quantidade
    INTO movimento
    FROM public.atendimento_pecas_movimentos m
   WHERE m.atendimento_servico_id = OLD.id
     AND m.tipo = 'consumo'
   FOR UPDATE;

  IF FOUND THEN
    IF NOT public.has_role(auth.uid(), 'gerente') THEN
      RAISE EXCEPTION 'Apenas o gerente pode excluir um serviço que já consumiu estoque.';
    END IF;

    UPDATE public.pecas
       SET estoque = estoque + movimento.quantidade,
           updated_at = now()
     WHERE id = movimento.peca_id;

    DELETE FROM public.atendimento_pecas_movimentos
     WHERE atendimento_servico_id = OLD.id
       AND tipo = 'consumo';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS devolver_peca_ao_excluir_servico ON public.atendimento_servicos;
CREATE TRIGGER devolver_peca_ao_excluir_servico
  BEFORE DELETE ON public.atendimento_servicos
  FOR EACH ROW
  EXECUTE FUNCTION public.devolver_peca_ao_excluir_servico();

-- Exclusão lógica de OS finalizada também estorna as peças consumidas.
CREATE OR REPLACE FUNCTION public.estornar_pecas_ao_excluir_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.status = 'finalizado' THEN
    PERFORM public.estornar_pecas_atendimento(OLD.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estornar_pecas_ao_excluir_atendimento ON public.atendimentos;
CREATE TRIGGER estornar_pecas_ao_excluir_atendimento
  BEFORE UPDATE OF deleted_at ON public.atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.estornar_pecas_ao_excluir_atendimento();

GRANT EXECUTE ON FUNCTION public.registrar_tempos_atendimento_servico() TO authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_peca_ao_excluir_servico() TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pecas_ao_excluir_atendimento() TO authenticated;
