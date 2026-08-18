-- Notificar conclusão somente quando a alteração vier de um mecânico.
-- Mudanças feitas pelo gerente são administrativas e não geram aviso interno.

CREATE OR REPLACE FUNCTION public.notificar_mudanca_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mecanico_user uuid;
  mecanico_nome text;
  gerente_user uuid;
  placa_text text;
  cliente_text text;
BEGIN
  SELECT m.user_id, m.nome INTO mecanico_user, mecanico_nome
  FROM public.mecanicos m
  WHERE m.id = NEW.mecanico_id AND m.deleted_at IS NULL;

  SELECT a.placa, a.cliente_nome INTO placa_text, cliente_text
  FROM public.atendimentos a
  WHERE a.id = NEW.atendimento_id;

  IF TG_OP = 'INSERT' AND NEW.mecanico_id IS NOT NULL AND mecanico_user IS NOT NULL
     AND mecanico_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.criar_notificacao_interna(
      'servico_atribuido',
      'Novo serviço atribuído',
      COALESCE(NEW.nome, 'Serviço') || ' foi atribuído a você' || COALESCE(' — ' || placa_text, '') || '.',
      mecanico_user,
      NEW.mecanico_id,
      NEW.atendimento_id,
      NEW.id,
      NULL,
      jsonb_build_object('placa', placa_text, 'cliente', cliente_text)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id
     AND NEW.mecanico_id IS NOT NULL AND mecanico_user IS NOT NULL
     AND mecanico_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.criar_notificacao_interna(
      'responsavel_alterado',
      'Você recebeu um serviço',
      COALESCE(NEW.nome, 'Serviço') || ' agora está atribuído a você' || COALESCE(' — ' || placa_text, '') || '.',
      mecanico_user,
      NEW.mecanico_id,
      NEW.atendimento_id,
      NEW.id,
      NULL,
      jsonb_build_object('placa', placa_text, 'cliente', cliente_text)
    );
  END IF;

  -- Só a conta do mecânico pode disparar a conclusão para o gerente.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'concluido'
     AND OLD.status IS DISTINCT FROM 'concluido'
     AND NOT public.has_role(auth.uid(), 'gerente') THEN
    FOR gerente_user IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'gerente'
    LOOP
      PERFORM public.criar_notificacao_interna(
        'servico_concluido',
        'Serviço concluído',
        COALESCE(NEW.nome, 'Serviço') || ' foi concluído e aguarda conferência' || COALESCE(' — ' || placa_text, '') || '.',
        gerente_user,
        NULL,
        NEW.atendimento_id,
        NEW.id,
        NULL,
        jsonb_build_object('placa', placa_text, 'cliente', cliente_text, 'mecanico', mecanico_nome)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
