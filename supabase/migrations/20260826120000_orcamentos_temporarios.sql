-- Orçamentos temporários: retenção de 15 dias, sem impacto no estoque ou caixa.
CREATE SEQUENCE IF NOT EXISTS public.orcamento_numero_seq START 1;

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.orcamento_numero_seq'),
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'convertido')),
  cliente_nome text,
  cliente_telefone text,
  cliente_cpf text,
  placa text,
  fabricante text,
  modelo text,
  cor text,
  observacao text,
  desconto numeric(12,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  subtotal_pecas numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_pecas >= 0),
  subtotal_mao_de_obra numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_mao_de_obra >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  os_id uuid REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 days')
);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('peca', 'mao_de_obra')),
  peca_id uuid REFERENCES public.pecas(id) ON DELETE SET NULL,
  servico_id uuid REFERENCES public.servicos_catalogo(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  quantidade numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamentos_validos_idx ON public.orcamentos (expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS orcamentos_busca_idx ON public.orcamentos (numero, placa, cliente_nome);
CREATE INDEX IF NOT EXISTS orcamento_itens_orcamento_idx ON public.orcamento_itens (orcamento_id, ordem);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamento_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.orcamento_numero_seq TO authenticated;
DROP TRIGGER IF EXISTS orcamentos_touch ON public.orcamentos;
CREATE TRIGGER orcamentos_touch BEFORE UPDATE ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP POLICY IF EXISTS "orcamentos_gerente_all" ON public.orcamentos;
CREATE POLICY "orcamentos_gerente_all" ON public.orcamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente') AND expires_at > now())
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "orcamento_itens_gerente_all" ON public.orcamento_itens;
CREATE POLICY "orcamento_itens_gerente_all" ON public.orcamento_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orcamentos o
      WHERE o.id = orcamento_itens.orcamento_id
        AND public.has_role(auth.uid(), 'gerente')
        AND o.expires_at > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orcamentos o
      WHERE o.id = orcamento_itens.orcamento_id
        AND public.has_role(auth.uid(), 'gerente')
        AND o.expires_at > now()
    )
  );

CREATE OR REPLACE FUNCTION public.limpar_orcamentos_expirados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode limpar orçamentos expirados.';
  END IF;
  DELETE FROM public.orcamentos WHERE expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_orcamentos_expirados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_orcamentos_expirados() TO authenticated;

-- O agendamento é criado somente se a extensão de cron estiver disponível no projeto.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('limpar-orcamentos-expirados', '15 3 * * *', $cron$SELECT public.limpar_orcamentos_expirados();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $migration$;

-- A OS pode nascer incompleta a partir de um orçamento; a tela atual continua
-- exigindo os campos no fluxo normal. Não são criados dados falsos.
ALTER TABLE public.atendimentos ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE public.atendimentos ALTER COLUMN cliente_nome DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.iniciar_atendimento_orcamento(_orcamento_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento public.orcamentos%ROWTYPE;
  v_atendimento_id uuid;
  v_item public.orcamento_itens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode iniciar um serviço a partir do orçamento.';
  END IF;

  SELECT * INTO v_orcamento
  FROM public.orcamentos
  WHERE id = _orcamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado ou expirado.';
  END IF;
  IF v_orcamento.expires_at <= now() THEN
    RAISE EXCEPTION 'Este orçamento já expirou.';
  END IF;
  IF v_orcamento.os_id IS NOT NULL OR v_orcamento.status = 'convertido' THEN
    RETURN v_orcamento.os_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamento_itens WHERE orcamento_id = _orcamento_id) THEN
    RAISE EXCEPTION 'O orçamento precisa ter pelo menos um item.';
  END IF;

  INSERT INTO public.atendimentos (
    placa, fabricante, modelo, cor, cliente_nome, cliente_telefone, cliente_cpf,
    observacao, desconto, total, status
  ) VALUES (
    NULLIF(trim(v_orcamento.placa), ''), v_orcamento.fabricante, v_orcamento.modelo,
    v_orcamento.cor, NULLIF(trim(v_orcamento.cliente_nome), ''),
    v_orcamento.cliente_telefone, v_orcamento.cliente_cpf, v_orcamento.observacao,
    v_orcamento.desconto, v_orcamento.total, 'aberto'
  ) RETURNING id INTO v_atendimento_id;

  FOR v_item IN
    SELECT * FROM public.orcamento_itens WHERE orcamento_id = _orcamento_id ORDER BY ordem, created_at
  LOOP
    INSERT INTO public.atendimento_servicos (
      atendimento_id, nome, status, valor, mecanico_id, peca_id, quantidade,
      preco_peca, mao_de_obra, retorno_meses, garantia_km
    ) VALUES (
      v_atendimento_id, v_item.descricao, 'aguardando', v_item.valor_total, NULL,
      v_item.peca_id, v_item.quantidade,
      CASE WHEN v_item.tipo = 'peca' THEN v_item.valor_unitario ELSE 0 END,
      CASE WHEN v_item.tipo = 'mao_de_obra' THEN v_item.valor_unitario ELSE 0 END,
      0, NULL
    );
  END LOOP;

  UPDATE public.orcamentos
  SET status = 'convertido', os_id = v_atendimento_id, updated_at = now()
  WHERE id = _orcamento_id;

  RETURN v_atendimento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_atendimento_orcamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_atendimento_orcamento(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_orcamento(
  _orcamento_id uuid,
  _dados jsonb,
  _itens jsonb
)
RETURNS public.orcamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento public.orcamentos%ROWTYPE;
  v_item jsonb;
  v_tipo text;
  v_descricao text;
  v_quantidade numeric;
  v_valor_unitario numeric;
  v_pecas numeric := 0;
  v_mao_de_obra numeric := 0;
  v_desconto numeric := GREATEST(COALESCE((_dados->>'desconto')::numeric, 0), 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode salvar orçamentos.';
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos uma peça ou serviço ao orçamento.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_itens)
  LOOP
    v_tipo := v_item->>'tipo';
    v_descricao := NULLIF(trim(v_item->>'descricao'), '');
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_valor_unitario := (v_item->>'valor_unitario')::numeric;
    IF v_tipo NOT IN ('peca', 'mao_de_obra') OR v_descricao IS NULL OR v_quantidade <= 0 OR v_valor_unitario < 0 THEN
      RAISE EXCEPTION 'Item inválido no orçamento.';
    END IF;
    IF v_tipo = 'peca' THEN v_pecas := v_pecas + v_quantidade * v_valor_unitario;
    ELSE v_mao_de_obra := v_mao_de_obra + v_quantidade * v_valor_unitario;
    END IF;
  END LOOP;

  IF _orcamento_id IS NULL THEN
    INSERT INTO public.orcamentos (
      criado_por, cliente_nome, cliente_telefone, cliente_cpf, placa, fabricante,
      modelo, cor, observacao, desconto, subtotal_pecas, subtotal_mao_de_obra, total
    ) VALUES (
      auth.uid(), NULLIF(trim(_dados->>'cliente_nome'), ''), NULLIF(trim(_dados->>'cliente_telefone'), ''),
      NULLIF(trim(_dados->>'cliente_cpf'), ''), NULLIF(trim(_dados->>'placa'), ''),
      NULLIF(trim(_dados->>'fabricante'), ''), NULLIF(trim(_dados->>'modelo'), ''),
      NULLIF(trim(_dados->>'cor'), ''), NULLIF(trim(_dados->>'observacao'), ''),
      v_desconto, v_pecas, v_mao_de_obra, GREATEST(v_pecas + v_mao_de_obra - v_desconto, 0)
    ) RETURNING * INTO v_orcamento;
  ELSE
    UPDATE public.orcamentos
    SET cliente_nome = NULLIF(trim(_dados->>'cliente_nome'), ''),
        cliente_telefone = NULLIF(trim(_dados->>'cliente_telefone'), ''),
        cliente_cpf = NULLIF(trim(_dados->>'cliente_cpf'), ''),
        placa = NULLIF(trim(_dados->>'placa'), ''),
        fabricante = NULLIF(trim(_dados->>'fabricante'), ''),
        modelo = NULLIF(trim(_dados->>'modelo'), ''),
        cor = NULLIF(trim(_dados->>'cor'), ''),
        observacao = NULLIF(trim(_dados->>'observacao'), ''),
        desconto = v_desconto,
        subtotal_pecas = v_pecas,
        subtotal_mao_de_obra = v_mao_de_obra,
        total = GREATEST(v_pecas + v_mao_de_obra - v_desconto, 0)
    WHERE id = _orcamento_id AND status = 'aberto' AND expires_at > now()
    RETURNING * INTO v_orcamento;
    IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado, expirado ou já convertido.'; END IF;
    DELETE FROM public.orcamento_itens WHERE orcamento_id = _orcamento_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_itens)
  LOOP
    INSERT INTO public.orcamento_itens (
      orcamento_id, tipo, peca_id, servico_id, descricao, quantidade,
      valor_unitario, valor_total, ordem
    ) VALUES (
      v_orcamento.id, v_item->>'tipo', NULLIF(v_item->>'peca_id', '')::uuid,
      NULLIF(v_item->>'servico_id', '')::uuid, trim(v_item->>'descricao'),
      (v_item->>'quantidade')::numeric, (v_item->>'valor_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'valor_unitario')::numeric,
      COALESCE((v_item->>'ordem')::integer, 0)
    );
  END LOOP;
  RETURN v_orcamento;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_orcamento(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_orcamento(uuid, jsonb, jsonb) TO authenticated;
