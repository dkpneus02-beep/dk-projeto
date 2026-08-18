-- Fase 6: trilha de auditoria para ações sensíveis.
-- Os triggers registram a alteração sem exigir mudanças no fluxo existente.

CREATE TABLE IF NOT EXISTS public.audit_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabela text NOT NULL,
  registro_id uuid,
  acao text NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_eventos_created_at_idx ON public.audit_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_eventos_tabela_idx ON public.audit_eventos (tabela, created_at DESC);

GRANT SELECT ON public.audit_eventos TO authenticated;
GRANT ALL ON public.audit_eventos TO service_role;
ALTER TABLE public.audit_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_eventos_gerente_select" ON public.audit_eventos;
CREATE POLICY "audit_eventos_gerente_select" ON public.audit_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  registro uuid;
  anterior jsonb;
  novo jsonb;
  motivo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    registro := OLD.id;
    anterior := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    registro := NEW.id;
    anterior := to_jsonb(OLD);
    novo := to_jsonb(NEW);
  ELSE
    registro := NEW.id;
    novo := to_jsonb(NEW);
  END IF;

  motivo := NULLIF(current_setting('app.motivo', true), '');

  INSERT INTO public.audit_eventos
    (tabela, registro_id, acao, usuario_id, dados_anteriores, dados_novos, motivo)
  VALUES
    (TG_TABLE_NAME, registro, TG_OP, auth.uid(), anterior, novo, motivo);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_atendimentos ON public.atendimentos;
CREATE TRIGGER audit_atendimentos
AFTER INSERT OR UPDATE OR DELETE ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_atendimento_servicos ON public.atendimento_servicos;
CREATE TRIGGER audit_atendimento_servicos
AFTER INSERT OR UPDATE OR DELETE ON public.atendimento_servicos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_pagamentos ON public.pagamentos;
CREATE TRIGGER audit_pagamentos
AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_caixa_sessoes ON public.caixa_sessoes;
CREATE TRIGGER audit_caixa_sessoes
AFTER INSERT OR UPDATE OR DELETE ON public.caixa_sessoes
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_caixa_movimentos ON public.caixa_movimentos;
CREATE TRIGGER audit_caixa_movimentos
AFTER INSERT OR UPDATE OR DELETE ON public.caixa_movimentos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_pecas ON public.pecas;
CREATE TRIGGER audit_pecas
AFTER INSERT OR UPDATE OR DELETE ON public.pecas
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_atendimento_pecas_movimentos ON public.atendimento_pecas_movimentos;
CREATE TRIGGER audit_atendimento_pecas_movimentos
AFTER INSERT OR UPDATE OR DELETE ON public.atendimento_pecas_movimentos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_notificacoes_retorno ON public.notificacoes_retorno;
CREATE TRIGGER audit_notificacoes_retorno
AFTER INSERT OR UPDATE OR DELETE ON public.notificacoes_retorno
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS audit_mecanicos ON public.mecanicos;
CREATE TRIGGER audit_mecanicos
AFTER INSERT OR UPDATE OR DELETE ON public.mecanicos
FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();
