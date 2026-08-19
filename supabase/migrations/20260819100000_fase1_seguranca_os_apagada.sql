-- Fase 1 — segurança de RLS e exclusão lógica de OS.
-- Esta migration é aditiva e deve ser aplicada somente após validação local.

-- OS apagada não participa da visibilidade normal, inclusive para gerente.
CREATE OR REPLACE FUNCTION public.can_view_atendimento(_atendimento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.atendimentos a
    WHERE a.id = _atendimento_id
      AND a.deleted_at IS NULL
      AND (
        public.has_role(auth.uid(), 'gerente')
        OR a.criado_por = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.atendimento_servicos s
          JOIN public.mecanicos m ON m.id = s.mecanico_id
          WHERE s.atendimento_id = a.id
            AND m.user_id = auth.uid()
            AND m.deleted_at IS NULL
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_atendimento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_atendimento(uuid) TO authenticated;

-- Remove policies permissivas antigas que anulavam a separação por papel.
DROP POLICY IF EXISTS "atendimentos_all" ON public.atendimentos;
DROP POLICY IF EXISTS "mecanicos_all" ON public.mecanicos;
DROP POLICY IF EXISTS "Permitir acesso total para usuarios autenticados" ON public.mecanicos;
DROP POLICY IF EXISTS "Permitir acesso total para usuários autenticados" ON public.mecanicos;

-- OS: leitura restrita à função central; escrita de OS continua permitida para
-- criar o atendimento, mas atualização e exclusão lógica seguem regras de papel.
DROP POLICY IF EXISTS "atendimentos_select" ON public.atendimentos;
CREATE POLICY "atendimentos_select" ON public.atendimentos
  FOR SELECT TO authenticated
  USING (public.can_view_atendimento(id));

DROP POLICY IF EXISTS "atendimentos_insert" ON public.atendimentos;
CREATE POLICY "atendimentos_insert" ON public.atendimentos
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "atendimentos_update" ON public.atendimentos;
CREATE POLICY "atendimentos_update" ON public.atendimentos
  FOR UPDATE TO authenticated
  USING (public.can_view_atendimento(id))
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente')
    OR public.can_view_atendimento(id)
  );

DROP POLICY IF EXISTS "atendimentos_delete_gerente" ON public.atendimentos;
CREATE POLICY "atendimentos_delete_gerente" ON public.atendimentos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

-- Mecânico só pode atualizar campos de vistoria e fluxo da própria OS.
-- Dados cadastrais, financeiros, garantia e exclusão lógica são do gerente.
CREATE OR REPLACE FUNCTION public.check_atendimento_edicao_restrita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.garantia_ate IS DISTINCT FROM OLD.garantia_ate
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
       OR NEW.necessita_retorno IS DISTINCT FROM OLD.necessita_retorno
       OR NEW.data_retorno_manual IS DISTINCT FROM OLD.data_retorno_manual
       OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.placa IS DISTINCT FROM OLD.placa
       OR NEW.fabricante IS DISTINCT FROM OLD.fabricante
       OR NEW.modelo IS DISTINCT FROM OLD.modelo
       OR NEW.cor IS DISTINCT FROM OLD.cor
       OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
       OR NEW.cliente_telefone IS DISTINCT FROM OLD.cliente_telefone
       OR NEW.cliente_cpf IS DISTINCT FROM OLD.cliente_cpf
       OR NEW.km IS DISTINCT FROM OLD.km
    THEN
      RAISE EXCEPTION 'Apenas o gerente pode alterar dados cadastrais, financeiros, garantia ou exclusão do atendimento.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atendimentos_edicao_restrita ON public.atendimentos;
CREATE TRIGGER atendimentos_edicao_restrita
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_edicao_restrita();

-- Serviços: gerente altera qualquer serviço; mecânico só altera o próprio
-- serviço atribuído. Serviço sem responsável fica para o gerente decidir.
DROP POLICY IF EXISTS "atendimento_servicos_update" ON public.atendimento_servicos;
CREATE POLICY "atendimento_servicos_update" ON public.atendimento_servicos
  FOR UPDATE TO authenticated
  USING (
    public.can_view_atendimento(atendimento_id)
    AND (
      public.has_role(auth.uid(), 'gerente')
      OR EXISTS (
        SELECT 1
        FROM public.mecanicos m
        WHERE m.id = atendimento_servicos.mecanico_id
          AND m.user_id = auth.uid()
          AND m.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    public.can_view_atendimento(atendimento_id)
    AND (
      public.has_role(auth.uid(), 'gerente')
      OR EXISTS (
        SELECT 1
        FROM public.mecanicos m
        WHERE m.id = atendimento_servicos.mecanico_id
          AND m.user_id = auth.uid()
          AND m.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "atendimento_servicos_delete" ON public.atendimento_servicos;
CREATE POLICY "atendimento_servicos_delete" ON public.atendimento_servicos
  FOR DELETE TO authenticated
  USING (
    public.can_view_atendimento(atendimento_id)
    AND (
      public.has_role(auth.uid(), 'gerente')
      OR EXISTS (
        SELECT 1
        FROM public.mecanicos m
        WHERE m.id = atendimento_servicos.mecanico_id
          AND m.user_id = auth.uid()
          AND m.deleted_at IS NULL
      )
    )
  );

-- Defesa em profundidade: mesmo que outra policy seja adicionada no futuro,
-- o mecânico nunca troca responsável, preço, peça ou identidade do serviço.
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_edicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF OLD.mecanico_id IS NULL OR OLD.mecanico_id <> (
      SELECT m.id FROM public.mecanicos m WHERE m.user_id = auth.uid() AND m.deleted_at IS NULL LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Mecânico só pode atualizar o próprio serviço atribuído.';
    END IF;

    IF NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.retorno_meses IS DISTINCT FROM OLD.retorno_meses
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
       OR NEW.peca_id IS DISTINCT FROM OLD.peca_id
       OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
       OR NEW.preco_peca IS DISTINCT FROM OLD.preco_peca
       OR NEW.mao_de_obra IS DISTINCT FROM OLD.mao_de_obra
    THEN
      RAISE EXCEPTION 'Mecânico só pode atualizar o status do próprio serviço.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atendimento_servicos_edicao_restrita ON public.atendimento_servicos;
CREATE TRIGGER atendimento_servicos_edicao_restrita
  BEFORE UPDATE ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.check_atendimento_servico_edicao();
