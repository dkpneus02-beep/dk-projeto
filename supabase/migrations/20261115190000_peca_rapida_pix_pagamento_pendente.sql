-- V.0.0.1 — cadastro rápido de peça, desconto manual por linha e cobrança Pix pendente.
-- Migration preparada para revisão. Não foi aplicada à produção.
-- Depende das operações por lote que já existem no schema de produção.

DO $$
BEGIN
  IF to_regclass('public.peca_lotes') IS NULL
     OR to_regclass('public.atendimento_pecas_movimentos') IS NULL
     OR to_regclass('public.atendimento_pecas_cmv') IS NULL
     OR to_regprocedure('public.ajustar_estoque_com_lotes(uuid,numeric,text,numeric)') IS NULL
     OR to_regprocedure('public.consumir_lotes_estoque(uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Esta migration requer as tabelas de lotes/movimentos/CMV e as RPCs de ajuste/consumo já aplicadas.';
  END IF;
END;
$$;

ALTER TABLE public.pecas
  ADD COLUMN IF NOT EXISTS cadastro_pendente boolean NOT NULL DEFAULT false;

ALTER TABLE public.atendimento_servicos
  ADD COLUMN IF NOT EXISTS tipo_item text NOT NULL DEFAULT 'servico',
  ADD COLUMN IF NOT EXISTS nome_peca_snapshot text,
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric(5,2);

ALTER TABLE public.atendimento_servicos
  ALTER COLUMN desconto_percentual DROP NOT NULL,
  ALTER COLUMN desconto_percentual DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atendimento_servicos'::regclass
      AND conname = 'atendimento_servicos_tipo_item_check'
  ) THEN
    ALTER TABLE public.atendimento_servicos
      ADD CONSTRAINT atendimento_servicos_tipo_item_check
      CHECK (tipo_item IN ('servico', 'peca'));
  END IF;
END;
$$;

ALTER TABLE public.atendimento_servicos
  DROP CONSTRAINT IF EXISTS atendimento_servicos_desconto_percentual_check;
ALTER TABLE public.atendimento_servicos
  ADD CONSTRAINT atendimento_servicos_desconto_percentual_check
  CHECK (
    desconto_percentual IS NULL
    OR (desconto_percentual >= 0 AND desconto_percentual <= 100)
  );

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS pago boolean NOT NULL DEFAULT true;

ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS pix_chave text NOT NULL DEFAULT '32801574000155',
  ADD COLUMN IF NOT EXISTS pix_nome_recebedor text NOT NULL DEFAULT 'DK AUTO CENTER',
  ADD COLUMN IF NOT EXISTS pix_cidade text NOT NULL DEFAULT 'SALGUEIRO';

-- Novos vínculos salvam o nome do catálogo pelo trigger; itens legados usam
-- o nome atual da peça como fallback, sem UPDATE em massa durante a migration.

-- Registros legados permanecem NULL. A tela pré-preenche visualmente 20% para
-- peças elegíveis, mas a decisão só é persistida quando o gerente confirma.

CREATE OR REPLACE FUNCTION public.calcular_total_atendimento(_atendimento_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    GREATEST(
      COALESCE(
        SUM(COALESCE(s.valor, 0)) - SUM(
          CASE
            WHEN p.aceita_desconto_pix = true AND s.peca_id IS NOT NULL THEN
              ROUND(
                COALESCE(s.preco_peca, 0)
                * COALESCE(s.desconto_percentual, 0) / 100,
                2
              )
            ELSE 0
          END
        ),
        0
      ),
      0
    ),
    2
  )
  FROM public.atendimento_servicos s
  LEFT JOIN public.pecas p ON p.id = s.peca_id
  WHERE s.atendimento_id = _atendimento_id;
$$;

REVOKE EXECUTE ON FUNCTION public.calcular_total_atendimento(uuid)
  FROM PUBLIC, anon, authenticated;

-- Permite a alteração do total somente na chamada aninhada esperada do trigger,
-- e somente se o valor for exatamente o agregado calculado no banco.
CREATE OR REPLACE FUNCTION public.check_atendimento_edicao_restrita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      IF pg_trigger_depth() <> 2
         OR NEW.total IS DISTINCT FROM public.calcular_total_atendimento(NEW.id) THEN
        RAISE EXCEPTION 'Apenas o gerente pode alterar o total do atendimento.';
      END IF;
    END IF;

    IF NEW.desconto IS DISTINCT FROM OLD.desconto
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

CREATE OR REPLACE FUNCTION public.sincronizar_total_atendimento_servicos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.atendimento_id IS DISTINCT FROM NEW.atendimento_id THEN
    UPDATE public.atendimentos a
    SET total = public.calcular_total_atendimento(OLD.atendimento_id),
        updated_at = now()
    WHERE a.id = OLD.atendimento_id
      AND a.status <> 'finalizado';
  END IF;

  v_atendimento_id := COALESCE(NEW.atendimento_id, OLD.atendimento_id);

  UPDATE public.atendimentos a
  SET total = public.calcular_total_atendimento(v_atendimento_id),
    updated_at = now()
  WHERE a.id = v_atendimento_id
    AND a.status <> 'finalizado';

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_total_atendimento_servicos ON public.atendimento_servicos;
CREATE TRIGGER sincronizar_total_atendimento_servicos
  AFTER INSERT OR DELETE OR UPDATE OF valor, atendimento_id, preco_peca, peca_id, desconto_percentual, mao_de_obra, quantidade
  ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_total_atendimento_servicos();

-- A verificação de profundidade exata e a fórmula de total exigem teste em
-- homologação; não liberar este SQL até validar a cadeia de triggers real.
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_insercao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_peca text;
  v_cadastro_pendente boolean;
  v_es_gerente boolean := public.has_role(auth.uid(), 'gerente');
BEGIN
  IF NOT v_es_gerente THEN
    IF NOT public.mecanico_id_permitido(NEW.mecanico_id) THEN
      RAISE EXCEPTION 'Mecânico só pode criar serviço sem responsável definido ou atribuído a si mesmo.';
    END IF;
    IF NEW.desconto_percentual IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas o gerente pode definir o desconto manual da peça.';
    END IF;
  END IF;

  IF NEW.peca_id IS NOT NULL THEN
    SELECT p.nome, COALESCE(p.cadastro_pendente, false)
      INTO v_nome_peca, v_cadastro_pendente
    FROM public.pecas p
    WHERE p.id = NEW.peca_id AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A peça vinculada não está disponível no catálogo.';
    END IF;
    IF v_cadastro_pendente AND NOT v_es_gerente THEN
      RAISE EXCEPTION 'Apenas o gerente pode vincular uma peça com cadastro pendente.';
    END IF;
    NEW.tipo_item := 'peca';
    NEW.nome_peca_snapshot := v_nome_peca;
  ELSIF NOT v_es_gerente THEN
    NEW.tipo_item := 'servico';
    NEW.nome_peca_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- O desconto manual e os metadados de impressão só podem ser gravados pelo gerente.
CREATE OR REPLACE FUNCTION public.check_atendimento_servico_edicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_peca text;
BEGIN
  IF NEW.peca_id IS DISTINCT FROM OLD.peca_id THEN
    IF NEW.peca_id IS NULL THEN
      NEW.tipo_item := 'servico';
      NEW.nome_peca_snapshot := NULL;
    ELSE
      SELECT p.nome INTO v_nome_peca
      FROM public.pecas p
      WHERE p.id = NEW.peca_id
        AND p.deleted_at IS NULL
        AND COALESCE(p.cadastro_pendente, false) = false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A peça vinculada não está disponível para uso na OS.';
      END IF;
      NEW.tipo_item := 'peca';
      NEW.nome_peca_snapshot := v_nome_peca;
    END IF;
    -- Uma troca invalida o desconto anterior; a tela pode reapresentar 20% sem persistir.
    NEW.desconto_percentual := NULL;
  END IF;

  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    IF OLD.mecanico_id IS NULL OR NOT public.mecanico_id_permitido(OLD.mecanico_id) THEN
      RAISE EXCEPTION 'Apenas o mecânico responsável pode editar este serviço.';
    END IF;

    IF NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id
       OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.retorno_meses IS DISTINCT FROM OLD.retorno_meses
       OR NEW.garantia_km IS DISTINCT FROM OLD.garantia_km
       OR (
         NEW.peca_id IS NOT DISTINCT FROM OLD.peca_id
         AND NEW.desconto_percentual IS DISTINCT FROM OLD.desconto_percentual
       )
       OR (
         NEW.peca_id IS NOT DISTINCT FROM OLD.peca_id
         AND (
           NEW.tipo_item IS DISTINCT FROM OLD.tipo_item
           OR NEW.nome_peca_snapshot IS DISTINCT FROM OLD.nome_peca_snapshot
         )
       )
    THEN
      RAISE EXCEPTION 'Mecânico não pode alterar responsável, nome, garantia ou metadados gerenciais da peça.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- OS finalizadas já tiveram total, pagamentos e estoque fechados. Bloquear
-- alterações de linhas até existir um fluxo transacional explícito de reabertura.
CREATE OR REPLACE FUNCTION public.proteger_servicos_atendimento_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    SELECT a.status INTO v_status
    FROM public.atendimentos a
    WHERE a.id = OLD.atendimento_id AND a.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O atendimento anterior não está disponível para edição.';
    END IF;
    IF v_status = 'finalizado' THEN
      RAISE EXCEPTION 'Não é possível alterar serviços de uma OS finalizada.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id) THEN
    SELECT a.status INTO v_status
    FROM public.atendimentos a
    WHERE a.id = NEW.atendimento_id AND a.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O atendimento de destino não está disponível para edição.';
    END IF;
    IF v_status = 'finalizado' THEN
      RAISE EXCEPTION 'Não é possível alterar serviços de uma OS finalizada.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atendimento_servicos_finalizado_guard ON public.atendimento_servicos;
CREATE TRIGGER atendimento_servicos_finalizado_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.atendimento_servicos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_servicos_atendimento_finalizado();

CREATE OR REPLACE FUNCTION public.proteger_cadastro_pendente_peca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cadastro_pendente = true
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente')) THEN
    RAISE EXCEPTION 'Apenas o gerente pode criar uma peça com cadastro pendente.';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.cadastro_pendente IS DISTINCT FROM OLD.cadastro_pendente
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente')) THEN
    RAISE EXCEPTION 'Apenas o gerente pode alterar o estado do cadastro da peça.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pecas_proteger_cadastro_pendente ON public.pecas;
CREATE TRIGGER pecas_proteger_cadastro_pendente
  BEFORE INSERT OR UPDATE OF cadastro_pendente ON public.pecas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cadastro_pendente_peca();

CREATE OR REPLACE FUNCTION public.proteger_estado_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.pago = false
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente')) THEN
    RAISE EXCEPTION 'Apenas o gerente pode registrar pagamento pendente.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.pago IS DISTINCT FROM OLD.pago
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente')) THEN
    RAISE EXCEPTION 'Apenas o gerente pode alterar o estado de pagamento.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagamentos_proteger_estado ON public.pagamentos;
CREATE TRIGGER pagamentos_proteger_estado
  BEFORE INSERT OR UPDATE OF pago ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_estado_pagamento();

-- Uma peça provisória não tem saldo/custo cadastrado: não consumir lote nem gravar CMV.
CREATE OR REPLACE FUNCTION public.baixar_pecas_atendimento(_atendimento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode consumir peças ao finalizar uma OS.';
  END IF;

  FOR item IN
    SELECT s.id, s.peca_id, s.quantidade, s.nome,
           COALESCE(p.preco_custo, 0) AS preco_custo
    FROM public.atendimento_servicos s
    JOIN public.pecas p ON p.id = s.peca_id
    WHERE s.atendimento_id = _atendimento_id
      AND s.peca_id IS NOT NULL
      AND s.quantidade > 0
      AND COALESCE(p.cadastro_pendente, false) = false
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.atendimento_pecas_movimentos m
      WHERE m.atendimento_servico_id = item.id
        AND m.tipo = 'consumo'
    ) THEN
      CONTINUE;
    END IF;
    custo := ROUND(GREATEST(COALESCE(item.preco_custo, 0), 0), 2);
    PERFORM public.consumir_lotes_estoque(item.peca_id, item.quantidade);
    INSERT INTO public.atendimento_pecas_movimentos
      (atendimento_servico_id, atendimento_id, peca_id, quantidade, tipo)
    VALUES
      (item.id, _atendimento_id, item.peca_id, item.quantidade, 'consumo');
    INSERT INTO public.atendimento_pecas_cmv
      (atendimento_servico_id, atendimento_id, peca_id, quantidade,
       custo_unitario, custo_total, tipo)
    VALUES
      (item.id, _atendimento_id, item.peca_id, item.quantidade,
       custo, ROUND(custo * item.quantidade, 2), 'consumo');
  END LOOP;
END;
$$;

-- Chaves privadas para retries de cadastro rápido; não expõe dados ao cliente.
CREATE TABLE IF NOT EXISTS public.peca_rapida_idempotencia (
  request_id uuid PRIMARY KEY,
  atendimento_id uuid NOT NULL,
  gerente_id uuid NOT NULL,
  nome text NOT NULL,
  quantidade numeric(12,2) NOT NULL,
  preco_unitario numeric(12,2) NOT NULL,
  desconto_percentual numeric(5,2) NOT NULL,
  resultado jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.peca_rapida_idempotencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.peca_rapida_idempotencia FROM PUBLIC, anon, authenticated;

-- Cria o marcador do catálogo e a linha da OS em uma única transação.
-- A mesma chave e payload retornam o resultado anterior em retries concorrentes.
DROP FUNCTION IF EXISTS public.adicionar_peca_rapida_atendimento(uuid, text, numeric, numeric, numeric);
CREATE OR REPLACE FUNCTION public.adicionar_peca_rapida_atendimento(
  _atendimento_id uuid,
  _nome text,
  _quantidade numeric,
  _preco_unitario numeric,
  _desconto_percentual numeric,
  _request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_peca_id uuid;
  v_servico_id uuid;
  v_idempotencia public.peca_rapida_idempotencia%ROWTYPE;
  v_resultado jsonb;
  v_nome text := BTRIM(COALESCE(_nome, ''));
  v_quantidade numeric(12,2) := ROUND(COALESCE(_quantidade, 0), 2);
  v_preco numeric(12,2) := ROUND(COALESCE(_preco_unitario, -1), 2);
  v_desconto numeric(5,2) := ROUND(COALESCE(_desconto_percentual, -1), 2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode adicionar uma peça rápida à OS.';
  END IF;
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'A chave da solicitação é obrigatória; tente novamente.';
  END IF;
  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'Informe a OS para adicionar a peça.';
  END IF;
  IF v_nome = '' OR LENGTH(v_nome) > 150 THEN
    RAISE EXCEPTION 'Informe um nome de até 150 caracteres para a peça.';
  END IF;
  IF v_quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;
  IF v_preco < 0 THEN
    RAISE EXCEPTION 'O preço unitário não pode ser negativo.';
  END IF;
  IF v_desconto < 0 OR v_desconto > 100 THEN
    RAISE EXCEPTION 'O desconto deve ficar entre 0%% e 100%%.';
  END IF;

  INSERT INTO public.peca_rapida_idempotencia (
    request_id, atendimento_id, gerente_id, nome, quantidade,
    preco_unitario, desconto_percentual
  ) VALUES (
    _request_id, _atendimento_id, auth.uid(), v_nome, v_quantidade,
    v_preco, v_desconto
  )
  ON CONFLICT (request_id) DO NOTHING;

  SELECT * INTO v_idempotencia
  FROM public.peca_rapida_idempotencia
  WHERE request_id = _request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível registrar a solicitação. Tente novamente.';
  END IF;
  IF v_idempotencia.atendimento_id IS DISTINCT FROM _atendimento_id
     OR v_idempotencia.gerente_id IS DISTINCT FROM auth.uid()
     OR v_idempotencia.nome IS DISTINCT FROM v_nome
     OR v_idempotencia.quantidade IS DISTINCT FROM v_quantidade
     OR v_idempotencia.preco_unitario IS DISTINCT FROM v_preco
     OR v_idempotencia.desconto_percentual IS DISTINCT FROM v_desconto THEN
    RAISE EXCEPTION 'Esta chave já pertence a outra solicitação. Atualize e tente novamente.';
  END IF;
  IF v_idempotencia.resultado IS NOT NULL THEN
    RETURN v_idempotencia.resultado;
  END IF;

  -- Serializa solicitações independentes com o mesmo nome, inclusive quando
  -- a consulta ainda não encontra uma linha de catálogo para bloquear.
  PERFORM pg_advisory_xact_lock(hashtext('quick-part:' || LOWER(v_nome)));

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_atendimento.status = 'finalizado' THEN
    RAISE EXCEPTION 'A OS não existe ou já foi finalizada.';
  END IF;

  SELECT p.id INTO v_peca_id
  FROM public.pecas p
  WHERE LOWER(BTRIM(p.nome)) = LOWER(v_nome)
    AND p.deleted_at IS NULL
  ORDER BY p.cadastro_pendente DESC, p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_peca_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pecas p
      WHERE p.id = v_peca_id AND p.cadastro_pendente = true
    ) THEN
      RAISE EXCEPTION 'Já existe uma peça configurada com esse nome. Selecione-a no catálogo.';
    END IF;
    -- Não altere o preço global do catálogo ao lançar outra OS: o valor desta
    -- venda fica no snapshot da linha e o gerente conclui o cadastro depois.
  ELSE
    INSERT INTO public.pecas (
      nome, tipo, categoria, estoque, estoque_minimo, preco_custo,
      margem, preco_venda, aceita_desconto_pix, cadastro_pendente
    ) VALUES (
      v_nome, 'peca', 'peca', 0, 0, 0, 0, v_preco, true, true
    )
    RETURNING id INTO v_peca_id;
  END IF;

  INSERT INTO public.atendimento_servicos (
    atendimento_id, nome, status, valor, mecanico_id, peca_id, quantidade,
    retorno_meses, garantia_km, preco_peca, mao_de_obra, tipo_item,
    nome_peca_snapshot, desconto_percentual
  ) VALUES (
    _atendimento_id, 'Peça avulsa', 'concluido', ROUND(v_preco * v_quantidade, 2),
    NULL, v_peca_id, v_quantidade, 0, NULL,
    ROUND(v_preco * v_quantidade, 2), 0, 'peca', v_nome, v_desconto
  )
  RETURNING id INTO v_servico_id;

  v_resultado := jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'peca_id', v_peca_id,
    'atendimento_servico_id', v_servico_id,
    'nome', v_nome
  );
  UPDATE public.peca_rapida_idempotencia
  SET resultado = v_resultado
  WHERE request_id = _request_id;
  RETURN v_resultado;
END;
$$;

-- A contagem física e a conclusão do marcador são atômicas; entrada cria lote e custo médio.
CREATE OR REPLACE FUNCTION public.concluir_cadastro_peca_rapida(
  _peca_id uuid,
  _estoque_alvo numeric,
  _custo_unitario_entrada numeric DEFAULT 0,
  _motivo text DEFAULT 'Conferência física ao concluir cadastro rápido'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peca public.pecas%ROWTYPE;
  v_estoque_alvo numeric(12,2) := ROUND(COALESCE(_estoque_alvo, -1), 2);
  v_custo numeric(12,2) := ROUND(COALESCE(_custo_unitario_entrada, -1), 2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode concluir o cadastro e o estoque da peça.';
  END IF;
  IF _peca_id IS NULL OR v_estoque_alvo < 0 THEN
    RAISE EXCEPTION 'Informe a peça e uma contagem física igual ou maior que zero.';
  END IF;
  IF v_custo < 0 THEN
    RAISE EXCEPTION 'Informe um custo de referência igual ou maior que zero.';
  END IF;

  SELECT * INTO v_peca
  FROM public.pecas
  WHERE id = _peca_id AND deleted_at IS NULL AND cadastro_pendente = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A peça não está pendente ou não foi encontrada.';
  END IF;
  IF NULLIF(BTRIM(v_peca.nome), '') IS NULL OR v_peca.preco_venda < 0 THEN
    RAISE EXCEPTION 'Revise o nome e o preço de venda antes de concluir o cadastro.';
  END IF;

  IF v_estoque_alvo IS DISTINCT FROM ROUND(COALESCE(v_peca.estoque, 0), 2) THEN
    PERFORM public.ajustar_estoque_com_lotes(
      _peca_id,
      v_estoque_alvo,
      COALESCE(NULLIF(BTRIM(_motivo), ''), 'Conferência física ao concluir cadastro rápido'),
      v_custo
    );
  ELSIF v_estoque_alvo = 0 THEN
    -- Com saldo zero não há lote a atualizar; guardar o custo de referência
    -- para que as próximas entradas ponderem o custo médio corretamente.
    UPDATE public.pecas SET preco_custo = v_custo WHERE id = _peca_id;
  END IF;

  UPDATE public.pecas
  SET cadastro_pendente = false
  WHERE id = _peca_id;

  RETURN jsonb_build_object(
    'peca_id', _peca_id,
    'nome', v_peca.nome,
    'estoque_confirmado', v_estoque_alvo,
    'cadastro_pendente', false
  );
END;
$$;

-- Ao finalizar, o banco recalcula os descontos por linha e cria o plano de pagamento pendente.
-- Não lança dinheiro no caixa até o gerente confirmar o recebimento.
DROP FUNCTION IF EXISTS public.finalizar_atendimento_transacional(uuid, numeric, jsonb, boolean, date);
CREATE OR REPLACE FUNCTION public.finalizar_atendimento_transacional(
  _atendimento_id uuid,
  _pagamentos jsonb,
  _necessita_retorno boolean DEFAULT false,
  _data_retorno_manual date DEFAULT NULL,
  _descontos jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_cfg public.configuracoes%ROWTYPE;
  v_bruto numeric(12,2);
  v_desconto numeric(12,2) := 0;
  v_total numeric(12,2);
  v_garantia_ate date;
  v_garantia_km integer;
  v_finalizado_at timestamptz := now();
  v_item jsonb;
  v_servico_id uuid;
  v_percentual numeric(5,2);
  v_aceita_desconto boolean;
  v_pagamento_total numeric(12,2) := 0;
  v_pagamento_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode finalizar uma OS.';
  END IF;
  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'A OS precisa ser informada.';
  END IF;
  IF _pagamentos IS NULL OR jsonb_typeof(_pagamentos) <> 'array' THEN
    RAISE EXCEPTION 'Informe os pagamentos em uma lista válida.';
  END IF;
  IF _descontos IS NOT NULL AND jsonb_typeof(_descontos) <> 'array' THEN
    RAISE EXCEPTION 'Os descontos por peça estão em formato inválido.';
  END IF;
  IF _descontos IS NOT NULL AND EXISTS (
    SELECT value->>'servico_id'
    FROM jsonb_array_elements(_descontos)
    GROUP BY value->>'servico_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há desconto duplicado para a mesma peça.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada ou já excluída.';
  END IF;
  IF v_atendimento.status = 'finalizado' THEN
    RAISE EXCEPTION 'Esta OS já está finalizada.';
  END IF;

  IF _descontos IS NOT NULL THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(_descontos)
    LOOP
      IF NULLIF(v_item->>'servico_id', '') IS NULL
         OR NULLIF(v_item->>'percentual', '') IS NULL THEN
        RAISE EXCEPTION 'Cada desconto precisa informar peça e percentual.';
      END IF;
      v_servico_id := (v_item->>'servico_id')::uuid;
      v_percentual := ROUND((v_item->>'percentual')::numeric, 2);
      IF v_percentual < 0 OR v_percentual > 100 THEN
        RAISE EXCEPTION 'O desconto de cada peça deve ficar entre 0%% e 100%%.';
      END IF;

      SELECT p.aceita_desconto_pix INTO v_aceita_desconto
      FROM public.atendimento_servicos s
      JOIN public.pecas p ON p.id = s.peca_id
      WHERE s.id = v_servico_id
        AND s.atendimento_id = _atendimento_id
        AND s.peca_id IS NOT NULL
      FOR UPDATE OF s;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A peça selecionada não pertence a esta OS.';
      END IF;
      IF v_percentual > 0 AND NOT COALESCE(v_aceita_desconto, false) THEN
        RAISE EXCEPTION 'Esta peça está marcada como não elegível a desconto.';
      END IF;

      UPDATE public.atendimento_servicos
      SET desconto_percentual = v_percentual
      WHERE id = v_servico_id AND atendimento_id = _atendimento_id;
    END LOOP;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(s.valor, 0)), 0)::numeric(12,2),
    COALESCE(SUM(
      CASE WHEN s.peca_id IS NOT NULL AND COALESCE(p.aceita_desconto_pix, false) THEN
        ROUND(COALESCE(s.preco_peca, 0) * LEAST(GREATEST(COALESCE(s.desconto_percentual, 0), 0), 100) / 100, 2)
      ELSE 0 END
    ), 0)::numeric(12,2),
    MIN(NULLIF(s.garantia_km, 0))
  INTO v_bruto, v_desconto, v_garantia_km
  FROM public.atendimento_servicos s
  LEFT JOIN public.pecas p ON p.id = s.peca_id
  WHERE s.atendimento_id = _atendimento_id;

  v_desconto := LEAST(GREATEST(ROUND(COALESCE(v_desconto, 0), 2), 0), v_bruto);
  v_total := ROUND(GREATEST(v_bruto - v_desconto, 0), 2);

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    IF NULLIF(BTRIM(v_item->>'forma'), '') IS NULL THEN
      RAISE EXCEPTION 'Todo pagamento precisa informar a forma.';
    END IF;
    IF COALESCE((v_item->>'valor')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'O valor de pagamento não pode ser negativo.';
    END IF;
    IF COALESCE((v_item->>'parcelas')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'O número de parcelas precisa ser maior que zero.';
    END IF;
    v_pagamento_total := v_pagamento_total + ROUND(COALESCE((v_item->>'valor')::numeric, 0), 2);
    v_pagamento_count := v_pagamento_count + 1;
  END LOOP;

  IF v_pagamento_count = 0 OR ABS(v_pagamento_total - v_total) >= 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos deve ser igual ao total da OS.';
  END IF;

  SELECT * INTO v_cfg FROM public.configuracoes LIMIT 1;
  v_garantia_ate := (CURRENT_DATE + COALESCE(v_cfg.garantia_dias, 90))::date;
  IF v_garantia_km IS NOT NULL THEN
    v_garantia_km := COALESCE(v_atendimento.km, 0) + v_garantia_km;
  END IF;

  -- A transição dispara a baixa atual por lotes; itens ainda pendentes são ignorados pelo RPC.
  UPDATE public.atendimentos
  SET status = 'finalizado',
      desconto = v_desconto,
      total = v_total,
      finalizado_at = v_finalizado_at,
      garantia_ate = v_garantia_ate,
      garantia_km = v_garantia_km,
      necessita_retorno = COALESCE(_necessita_retorno, false),
      data_retorno_manual = CASE
        WHEN COALESCE(_necessita_retorno, false) THEN _data_retorno_manual
        ELSE NULL
      END
  WHERE id = _atendimento_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_pagamentos)
  LOOP
    INSERT INTO public.pagamentos (atendimento_id, forma, valor, parcelas, pago)
    VALUES (
      _atendimento_id,
      BTRIM(v_item->>'forma'),
      ROUND((v_item->>'valor')::numeric, 2),
      (v_item->>'parcelas')::integer,
      false
    );
  END LOOP;

  IF COALESCE(_necessita_retorno, false) AND _data_retorno_manual IS NOT NULL THEN
    INSERT INTO public.notificacoes_retorno
      (atendimento_id, cliente_nome, telefone, veiculo, servico, vencimento)
    SELECT
      _atendimento_id,
      v_atendimento.cliente_nome,
      v_atendimento.cliente_telefone,
      BTRIM(COALESCE(v_atendimento.modelo, '') || ' ' || v_atendimento.placa),
      COALESCE(string_agg(COALESCE(s.nome_peca_snapshot, s.nome), ', ' ORDER BY COALESCE(s.nome_peca_snapshot, s.nome)), 'Serviço realizado'),
      _data_retorno_manual
    FROM public.atendimento_servicos s
    WHERE s.atendimento_id = _atendimento_id;
  END IF;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'total', v_total,
    'desconto', v_desconto,
    'garantia_ate', v_garantia_ate,
    'garantia_km', v_garantia_km,
    'finalizado_at', v_finalizado_at,
    'pago', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_atendimento_pago(_atendimento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atendimento public.atendimentos%ROWTYPE;
  v_sessao_id uuid;
  v_item record;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode confirmar o recebimento.';
  END IF;
  IF _atendimento_id IS NULL THEN
    RAISE EXCEPTION 'Informe a OS para marcar o pagamento.';
  END IF;

  SELECT * INTO v_atendimento
  FROM public.atendimentos
  WHERE id = _atendimento_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_atendimento.status <> 'finalizado' THEN
    RAISE EXCEPTION 'Somente uma OS finalizada pode ser marcada como paga.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pagamentos
    WHERE atendimento_id = _atendimento_id AND pago = false
  ) THEN
    RAISE EXCEPTION 'Esta OS não possui pagamentos pendentes.';
  END IF;

  SELECT id INTO v_sessao_id
  FROM public.caixa_sessoes
  WHERE aberto = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Abra o caixa antes de registrar o recebimento da OS.';
  END IF;

  FOR v_item IN
    SELECT id, forma, valor
    FROM public.pagamentos
    WHERE atendimento_id = _atendimento_id AND pago = false
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    UPDATE public.pagamentos SET pago = true WHERE id = v_item.id;
    INSERT INTO public.caixa_movimentos
      (sessao_id, tipo, descricao, valor, forma, atendimento_id)
    VALUES
      (v_sessao_id, 'entrada',
       FORMAT('OS #%s — %s', v_atendimento.numero, v_atendimento.cliente_nome),
       ROUND(v_item.valor, 2), v_item.forma, _atendimento_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'atendimento_id', _atendimento_id,
    'pagamentos_marcados', v_count,
    'pago', true
  );
END;
$$;

-- Mantém compatibilidade com clientes antigos, mas direciona a entrada sem custo
-- informado ao fluxo atual de lote usando o custo médio registrado da peça.
CREATE OR REPLACE FUNCTION public.adicionar_entrada_estoque(
  _peca_id uuid,
  _quantidade numeric
)
RETURNS public.pecas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_custo numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode registrar entrada de estoque.';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
  END IF;
  SELECT GREATEST(COALESCE(preco_custo, 0), 0)
  INTO v_custo
  FROM public.pecas
  WHERE id = _peca_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado ou excluído.';
  END IF;
  RETURN public.adicionar_entrada_estoque_com_custo(_peca_id, _quantidade, v_custo);
END;
$$;

REVOKE ALL ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.adicionar_peca_rapida_atendimento(uuid, text, numeric, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_peca_rapida_atendimento(uuid, text, numeric, numeric, numeric, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.concluir_cadastro_peca_rapida(uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_cadastro_peca_rapida(uuid, numeric, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.finalizar_atendimento_transacional(uuid, jsonb, boolean, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_transacional(uuid, jsonb, boolean, date, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.marcar_atendimento_pago(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atendimento_pago(uuid) TO authenticated;

COMMENT ON COLUMN public.pecas.cadastro_pendente IS
  'Peça criada rapidamente na OS; não consome estoque até gerente concluir cadastro e contagem física.';
COMMENT ON COLUMN public.atendimento_servicos.desconto_percentual IS
  'Percentual manual de desconto aplicado somente ao preço da peça, independentemente da forma de pagamento.';
COMMENT ON COLUMN public.pagamentos.pago IS
  'Indica recebimento confirmado pelo gerente; pagamentos pendentes não entram no caixa.';

-- A assinatura da RPC mudou; atualiza o schema cache usado pelo PostgREST.
NOTIFY pgrst, 'reload schema';
