-- Mecânicos responsáveis podem editar apenas dados operacionais e valores do serviço.
-- Dados do cliente/veículo, responsável, nome, garantia e retorno continuam protegidos.
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_edicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF OLD.mecanico_id IS NULL OR NOT public.mecanico_id_permitido(OLD.mecanico_id) THEN
      RAISE EXCEPTION 'Apenas o mecânico responsável pode editar este serviço.';
    END IF;

    IF NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id
       OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.retorno_meses IS DISTINCT FROM OLD.retorno_meses
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
    THEN
      RAISE EXCEPTION 'Mecânico não pode alterar responsável, nome ou garantia do serviço.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimento_servicos_edicao_restrita ON public.atendimento_servicos;
CREATE TRIGGER atendimento_servicos_edicao_restrita
  BEFORE UPDATE ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_servico_edicao();
