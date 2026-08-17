-- ====================================================================
-- ATUALIZAÇÃO: permissões por role, fluxo de finalização em 2 etapas,
-- retorno manual e vínculo de mecânico com usuário de autenticação.
-- ====================================================================

-- --------------------------------------------------------------
-- 1) Vínculo mecânico -> usuário (login) + telefone/e-mail visíveis
-- --------------------------------------------------------------
ALTER TABLE public.mecanicos
  ADD COLUMN IF NOT EXISTS email text;

-- --------------------------------------------------------------
-- 2) Atendimentos: status intermediário "aguardando_gerente" e
--    campos de retorno manual (substituem a geração 100% automática)
-- --------------------------------------------------------------
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS necessita_retorno boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_retorno_manual date,
  ADD COLUMN IF NOT EXISTS pronto_at timestamptz,
  ADD COLUMN IF NOT EXISTS pronto_por uuid;

-- --------------------------------------------------------------
-- 3) Trava de exclusão/edição: apenas gerente pode apagar ou
--    "desfinalizar" (reabrir) um atendimento já concluído.
--    Mecânico continua podendo criar, atualizar vistoria e
--    marcar serviços/pronto normalmente.
-- --------------------------------------------------------------
DROP POLICY IF EXISTS "atendimentos_all" ON public.atendimentos;
CREATE POLICY "atendimentos_select" ON public.atendimentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "atendimentos_insert" ON public.atendimentos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "atendimentos_update" ON public.atendimentos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "atendimentos_delete_gerente" ON public.atendimentos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

-- --------------------------------------------------------------
-- 4) Caixa, Mecânicos (escrita) e Configurações (escrita):
--    exclusivos do gerente. Leitura de mecânicos continua liberada
--    (necessária para atribuir responsável num serviço).
-- --------------------------------------------------------------
DROP POLICY IF EXISTS "caixa_sessoes_all" ON public.caixa_sessoes;
CREATE POLICY "caixa_sessoes_gerente" ON public.caixa_sessoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "caixa_movimentos_all" ON public.caixa_movimentos;
CREATE POLICY "caixa_movimentos_gerente" ON public.caixa_movimentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "mecanicos_all" ON public.mecanicos;
CREATE POLICY "mecanicos_select" ON public.mecanicos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mecanicos_write_gerente" ON public.mecanicos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "mecanicos_update_gerente" ON public.mecanicos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "mecanicos_delete_gerente" ON public.mecanicos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "configuracoes_all" ON public.configuracoes;
CREATE POLICY "configuracoes_select" ON public.configuracoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "configuracoes_write_gerente" ON public.configuracoes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "configuracoes_update_gerente" ON public.configuracoes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Pagamentos são gerados apenas na etapa 2 (finalização), exclusiva do gerente.
DROP POLICY IF EXISTS "pagamentos_all" ON public.pagamentos;
CREATE POLICY "pagamentos_select" ON public.pagamentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pagamentos_write_gerente" ON public.pagamentos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "pagamentos_update_gerente" ON public.pagamentos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "pagamentos_delete_gerente" ON public.pagamentos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

-- Trava no banco (não só na tela): só o gerente pode levar um atendimento a
-- "finalizado" ou tirá-lo desse status ("desfinalizar"). O mecânico continua
-- livre para atualizar vistoria, avarias, fotos e marcar "aguardando_gerente".
CREATE OR REPLACE FUNCTION public.check_finalizacao_gerente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = 'finalizado' OR OLD.status = 'finalizado')
     AND NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode finalizar ou reabrir um atendimento.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimentos_finalizacao_gerente ON public.atendimentos;
CREATE TRIGGER atendimentos_finalizacao_gerente
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.check_finalizacao_gerente();

DROP POLICY IF EXISTS "notificacoes_retorno_all" ON public.notificacoes_retorno;
CREATE POLICY "notificacoes_retorno_gerente" ON public.notificacoes_retorno
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Peças/estoque: fora das telas permitidas ao mecânico -> exclusivo do gerente.
DROP POLICY IF EXISTS "pecas_all" ON public.pecas;
CREATE POLICY "pecas_gerente" ON public.pecas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Catálogo de serviços: leitura liberada (usado no checklist do atendimento
-- por ambos os perfis), escrita exclusiva do gerente.
DROP POLICY IF EXISTS "servicos_catalogo_all" ON public.servicos_catalogo;
CREATE POLICY "servicos_catalogo_select" ON public.servicos_catalogo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "servicos_catalogo_write_gerente" ON public.servicos_catalogo
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "servicos_catalogo_update_gerente" ON public.servicos_catalogo
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "servicos_catalogo_delete_gerente" ON public.servicos_catalogo
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

-- --------------------------------------------------------------
-- 4b) Dados do cabeçalho do recibo/notinha (endereço, telefone, CNPJ)
-- --------------------------------------------------------------
ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS endereco text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS telefone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj text NOT NULL DEFAULT '';

-- --------------------------------------------------------------
-- 5) handle_new_user já lê raw_user_meta_data->>'role' e ->>'nome'.
--    Garante telefone do profile também, usado no cadastro do mecânico.
-- --------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'telefone'
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'mecanico'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
