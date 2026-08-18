ALTER TABLE public.notificacoes_retorno
  ADD COLUMN IF NOT EXISTS excluido_at timestamptz;

CREATE INDEX IF NOT EXISTS notificacoes_retorno_excluido_idx
  ON public.notificacoes_retorno (excluido_at, vencimento);

CREATE TABLE IF NOT EXISTS public.notificacoes_retorno_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retorno_id uuid NOT NULL REFERENCES public.notificacoes_retorno(id) ON DELETE CASCADE,
  resultado text NOT NULL CHECK (resultado IN ('contatado_agendou', 'contatado_nao_quis', 'nao_atendeu', 'numero_invalido', 'sem_contato', 'outro')),
  observacao text,
  contatado_em timestamptz NOT NULL DEFAULT now(),
  contatado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contatado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificacoes_retorno_contatos_retorno_idx
  ON public.notificacoes_retorno_contatos (retorno_id, contatado_em DESC);

ALTER TABLE public.notificacoes_retorno_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retorno_contatos_select_gerente" ON public.notificacoes_retorno_contatos;
CREATE POLICY "retorno_contatos_select_gerente" ON public.notificacoes_retorno_contatos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "retorno_contatos_insert_gerente" ON public.notificacoes_retorno_contatos;
CREATE POLICY "retorno_contatos_insert_gerente" ON public.notificacoes_retorno_contatos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente') AND contatado_por = auth.uid());

DROP POLICY IF EXISTS "retorno_contatos_update_gerente" ON public.notificacoes_retorno_contatos;
CREATE POLICY "retorno_contatos_update_gerente" ON public.notificacoes_retorno_contatos
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerente')) WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "retorno_contatos_delete_gerente" ON public.notificacoes_retorno_contatos;
CREATE POLICY "retorno_contatos_delete_gerente" ON public.notificacoes_retorno_contatos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.retorno_edicao_gerente_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF NEW.excluido_at IS DISTINCT FROM OLD.excluido_at THEN
      RAISE EXCEPTION 'Somente o gerente pode ocultar um retorno.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retorno_edicao_gerente_only ON public.notificacoes_retorno;
CREATE TRIGGER retorno_edicao_gerente_only
  BEFORE UPDATE ON public.notificacoes_retorno
  FOR EACH ROW EXECUTE FUNCTION public.retorno_edicao_gerente_only();
