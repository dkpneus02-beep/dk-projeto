-- ====================================================================
-- FASE 1 DO ROADMAP: fechar o ciclo "mecânico executa → gerente confere"
-- com permissões aplicadas no banco (não só escondendo botão na tela).
--
-- O que esta migration faz:
--   1) Registra quem criou cada atendimento (criado_por / criado_por_nome),
--      preenchido automaticamente pelo banco — o cliente não pode forjar.
--   2) Define visibilidade por role: mecânico só vê atendimentos que
--      criou ou onde tem serviço atribuído a ele; gerente vê tudo.
--   3) Bloqueia, via trigger, que o mecânico altere campos administrativos
--      do atendimento (desconto, total, garantia, retorno) e campos
--      sensíveis do serviço (responsável, valor, nome, garantia) — ele só
--      pode mudar o status do próprio serviço.
--   4) Bloqueia, já no INSERT (policy + trigger), que o mecânico crie um
--      atendimento_servicos atribuído a outro mecânico — só pode gravar
--      sem responsável ou com o próprio id.
-- Nada aqui mexe em estoque, código de barras, nota fiscal ou notificações
-- (fases seguintes do roadmap).
-- ====================================================================

-- --------------------------------------------------------------
-- 1) Quem criou o atendimento
-- --------------------------------------------------------------
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS criado_por uuid,
  ADD COLUMN IF NOT EXISTS criado_por_nome text;

CREATE OR REPLACE FUNCTION public.set_atendimento_criado_por()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sempre sobrescreve com o usuário autenticado da requisição — o valor
  -- enviado pelo cliente (se houver) é ignorado, para não poder ser forjado.
  NEW.criado_por := auth.uid();
  SELECT p.nome INTO NEW.criado_por_nome FROM public.profiles p WHERE p.id = auth.uid();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimentos_set_criado_por ON public.atendimentos;
CREATE TRIGGER atendimentos_set_criado_por
  BEFORE INSERT ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_atendimento_criado_por();

-- Preenche retroativamente os atendimentos já existentes com um valor
-- neutro (não sabemos quem criou os antigos) para não deixar a coluna nula
-- travando comparações futuras. Isso NÃO altera visibilidade de quem é
-- gerente (que continua vendo tudo).
UPDATE public.atendimentos SET criado_por_nome = COALESCE(criado_por_nome, 'Registro anterior à Fase 1')
  WHERE criado_por IS NULL;

-- --------------------------------------------------------------
-- 2) Função central de visibilidade: gerente vê tudo; mecânico só vê o
--    que criou ou onde tem serviço atribuído a ele (via mecanicos.user_id).
--    SECURITY DEFINER + mesmo padrão já usado em has_role() para permitir
--    a policy consultar atendimento_servicos/mecanicos sem recursão de RLS.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_atendimento(_atendimento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(), 'gerente')
    OR EXISTS (
      SELECT 1 FROM public.atendimentos a
      WHERE a.id = _atendimento_id AND a.criado_por = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.atendimento_servicos s
      JOIN public.mecanicos m ON m.id = s.mecanico_id
      WHERE s.atendimento_id = _atendimento_id AND m.user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION public.can_view_atendimento(uuid) FROM PUBLIC, anon;

-- --------------------------------------------------------------
-- 2b) Função central para validar o valor de mecanico_id que está sendo
--     GRAVADO (usada no INSERT de atendimento_servicos). Gerente pode
--     atribuir qualquer mecânico; quem não é gerente só pode gravar NULL
--     (serviço ainda sem responsável) ou o próprio id em public.mecanicos
--     — nunca o id de outro mecânico. Mesmo padrão SECURITY DEFINER das
--     funções acima, para a policy poder consultar mecanicos sem depender
--     da RLS dessa tabela.
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mecanico_id_permitido(_mecanico_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(), 'gerente')
    OR _mecanico_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.mecanicos m
      WHERE m.id = _mecanico_id AND m.user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION public.mecanico_id_permitido(uuid) FROM PUBLIC, anon;

-- --------------------------------------------------------------
-- 3) Visibilidade de "atendimentos": troca a leitura liberada a todos por
--    leitura restrita via can_view_atendimento(). Escrita (insert/update/
--    delete) mantém as regras já existentes da migration anterior.
-- --------------------------------------------------------------
DROP POLICY IF EXISTS "atendimentos_select" ON public.atendimentos;
CREATE POLICY "atendimentos_select" ON public.atendimentos
  FOR SELECT TO authenticated USING (public.can_view_atendimento(id));

-- --------------------------------------------------------------
-- 4) Trava de campos administrativos do atendimento: mecânico não pode
--    alterar valores financeiros/garantia/retorno nem o próprio criado_por,
--    mesmo chamando a API diretamente. Ele continua livre para atualizar
--    vistoria, avarias, fotos, observação e status ("aguardando_gerente").
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_atendimento_edicao_restrita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.garantia_ate IS DISTINCT FROM OLD.garantia_ate
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
       OR NEW.necessita_retorno IS DISTINCT FROM OLD.necessita_retorno
       OR NEW.data_retorno_manual IS DISTINCT FROM OLD.data_retorno_manual
       OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
    THEN
      RAISE EXCEPTION 'Apenas o gerente pode alterar dados financeiros ou de garantia do atendimento.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimentos_edicao_restrita ON public.atendimentos;
CREATE TRIGGER atendimentos_edicao_restrita
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_edicao_restrita();

-- --------------------------------------------------------------
-- 5) atendimento_servicos: substitui a policy única "_all" (sem restrição
--    nenhuma) por policies separadas, com a mesma visibilidade acima.
-- --------------------------------------------------------------
DROP POLICY IF EXISTS "atendimento_servicos_all" ON public.atendimento_servicos;

CREATE POLICY "atendimento_servicos_select" ON public.atendimento_servicos
  FOR SELECT TO authenticated USING (public.can_view_atendimento(atendimento_id));

CREATE POLICY "atendimento_servicos_insert" ON public.atendimento_servicos
  FOR INSERT TO authenticated WITH CHECK (
    public.can_view_atendimento(atendimento_id)
    AND public.mecanico_id_permitido(mecanico_id)
  );

-- Reforço em trigger (defesa em profundidade): além da policy acima, uma
-- inserção que tente atribuir o serviço a outro mecânico é barrada aqui
-- também, com mensagem de erro específica (a mensagem de violação de RLS
-- sozinha é genérica e não deixa claro qual regra foi violada).
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_insercao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mecanico_id_permitido(NEW.mecanico_id) THEN
    RAISE EXCEPTION 'Mecânico só pode criar serviço sem responsável definido ou atribuído a si mesmo.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimento_servicos_insercao_restrita ON public.atendimento_servicos;
CREATE TRIGGER atendimento_servicos_insercao_restrita
  BEFORE INSERT ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_servico_insercao();

CREATE POLICY "atendimento_servicos_update" ON public.atendimento_servicos
  FOR UPDATE TO authenticated
  USING (public.can_view_atendimento(atendimento_id))
  WITH CHECK (public.can_view_atendimento(atendimento_id));

-- Exclusão de item de serviço continua liberada para quem já enxerga o
-- atendimento (mesmo comportamento de antes da Fase 1 — não é alterado
-- aqui para não impactar o fluxo de checklist já em uso).
CREATE POLICY "atendimento_servicos_delete" ON public.atendimento_servicos
  FOR DELETE TO authenticated USING (public.can_view_atendimento(atendimento_id));

-- Trava de campos sensíveis do serviço: mecânico só pode mudar o status
-- (ex.: aguardando -> em_execucao -> concluido). Responsável, valor, nome
-- e garantia só o gerente altera.
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_edicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.retorno_meses IS DISTINCT FROM OLD.retorno_meses
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
       OR NEW.peca_id IS DISTINCT FROM OLD.peca_id
       OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
    THEN
      RAISE EXCEPTION 'Mecânico só pode atualizar o status do serviço.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS atendimento_servicos_edicao_restrita ON public.atendimento_servicos;
CREATE TRIGGER atendimento_servicos_edicao_restrita
  BEFORE UPDATE ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_servico_edicao();
