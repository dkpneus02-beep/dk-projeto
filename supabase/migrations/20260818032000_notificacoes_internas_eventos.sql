-- Integração do primeiro corte com eventos reais da OS.
-- A central persistida vira fonte de verdade; os toasts atuais continuam como feedback imediato.

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

  IF TG_OP = 'UPDATE' AND NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM 'concluido' THEN
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

DROP TRIGGER IF EXISTS notificacoes_internas_servico_eventos ON public.atendimento_servicos;
CREATE TRIGGER notificacoes_internas_servico_eventos
AFTER INSERT OR UPDATE ON public.atendimento_servicos
FOR EACH ROW EXECUTE FUNCTION public.notificar_mudanca_servico();

CREATE OR REPLACE FUNCTION public.notificar_mudanca_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gerente_user uuid;
  mecanico_user uuid;
  mecanico_nome text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'aguardando_gerente' AND OLD.status IS DISTINCT FROM 'aguardando_gerente' THEN
    FOR gerente_user IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'gerente'
    LOOP
      PERFORM public.criar_notificacao_interna(
        'os_aguardando_conferencia',
        'OS aguardando conferência',
        'A OS #' || NEW.numero || ' de ' || NEW.cliente_nome || ' está pronta para conferência e finalização.',
        gerente_user,
        NULL,
        NEW.id,
        NULL,
        NULL,
        jsonb_build_object('placa', NEW.placa, 'numero', NEW.numero)
      );
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'aberto' AND OLD.status = 'aguardando_gerente' THEN
    FOR mecanico_user, mecanico_nome IN
      SELECT DISTINCT m.user_id, m.nome
      FROM public.atendimento_servicos s
      JOIN public.mecanicos m ON m.id = s.mecanico_id
      WHERE s.atendimento_id = NEW.id AND m.user_id IS NOT NULL AND m.deleted_at IS NULL
    LOOP
      PERFORM public.criar_notificacao_interna(
        'servico_devolvido',
        'OS devolvida para revisão',
        'A OS #' || NEW.numero || ' de ' || NEW.cliente_nome || ' voltou para revisão.',
        mecanico_user,
        NULL,
        NEW.id,
        NULL,
        NULL,
        jsonb_build_object('placa', NEW.placa, 'numero', NEW.numero, 'mecanico', mecanico_nome)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificacoes_internas_atendimento_eventos ON public.atendimentos;
CREATE TRIGGER notificacoes_internas_atendimento_eventos
AFTER UPDATE ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.notificar_mudanca_atendimento();
