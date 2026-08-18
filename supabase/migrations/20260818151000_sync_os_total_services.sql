CREATE OR REPLACE FUNCTION public.sincronizar_total_atendimento_servicos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento_id uuid;
BEGIN
  v_atendimento_id := COALESCE(NEW.atendimento_id, OLD.atendimento_id);

  UPDATE public.atendimentos a
  SET total = COALESCE((
    SELECT SUM(s.valor)
    FROM public.atendimento_servicos s
    WHERE s.atendimento_id = v_atendimento_id
  ), 0),
  updated_at = now()
  WHERE a.id = v_atendimento_id
    AND a.status <> 'finalizado';

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_total_atendimento_servicos ON public.atendimento_servicos;
CREATE TRIGGER sincronizar_total_atendimento_servicos
  AFTER INSERT OR UPDATE OF valor, atendimento_id OR DELETE ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_total_atendimento_servicos();
