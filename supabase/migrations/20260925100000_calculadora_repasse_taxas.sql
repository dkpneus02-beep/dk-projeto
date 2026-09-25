-- Calculadora de Repasse de Taxas: configuração gerencial e registro financeiro.

CREATE TABLE IF NOT EXISTS public.financeiro_taxas_repasse (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pix_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (pix_percentual >= 0 AND pix_percentual < 100),
  dinheiro_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (dinheiro_percentual >= 0 AND dinheiro_percentual < 100),
  debito_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (debito_percentual >= 0 AND debito_percentual < 100),
  credito_1x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_1x_percentual >= 0 AND credito_1x_percentual < 100),
  credito_2x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_2x_percentual >= 0 AND credito_2x_percentual < 100),
  credito_3x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_3x_percentual >= 0 AND credito_3x_percentual < 100),
  credito_4x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_4x_percentual >= 0 AND credito_4x_percentual < 100),
  credito_5x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_5x_percentual >= 0 AND credito_5x_percentual < 100),
  credito_6x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_6x_percentual >= 0 AND credito_6x_percentual < 100),
  credito_7x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_7x_percentual >= 0 AND credito_7x_percentual < 100),
  credito_8x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_8x_percentual >= 0 AND credito_8x_percentual < 100),
  credito_9x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_9x_percentual >= 0 AND credito_9x_percentual < 100),
  credito_10x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_10x_percentual >= 0 AND credito_10x_percentual < 100),
  credito_11x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_11x_percentual >= 0 AND credito_11x_percentual < 100),
  credito_12x_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (credito_12x_percentual >= 0 AND credito_12x_percentual < 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.financeiro_taxas_repasse (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.financeiro_taxas_repasse TO authenticated;
GRANT ALL ON public.financeiro_taxas_repasse TO service_role;
ALTER TABLE public.financeiro_taxas_repasse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financeiro_taxas_repasse_gerente" ON public.financeiro_taxas_repasse;
CREATE POLICY "financeiro_taxas_repasse_gerente" ON public.financeiro_taxas_repasse FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TABLE IF NOT EXISTS public.financeiro_vendas_repasse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valor_unitario numeric(12,2) NOT NULL CHECK (valor_unitario >= 0),
  quantidade numeric(12,2) NOT NULL CHECK (quantidade > 0),
  valor_original numeric(12,2) NOT NULL CHECK (valor_original >= 0),
  desconto_concedido numeric(12,2) NOT NULL DEFAULT 0 CHECK (desconto_concedido >= 0),
  base_apos_desconto numeric(12,2) NOT NULL CHECK (base_apos_desconto >= 0),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('PIX', 'Dinheiro', 'Débito', 'Crédito')),
  parcelas integer NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  taxa_percentual numeric(6,3) NOT NULL CHECK (taxa_percentual >= 0 AND taxa_percentual < 100),
  valor_acrescimo numeric(12,2) NOT NULL CHECK (valor_acrescimo >= 0),
  total_cobrado numeric(12,2) NOT NULL CHECK (total_cobrado >= 0),
  valor_parcela numeric(12,2) NOT NULL CHECK (valor_parcela >= 0),
  taxa_maquininha numeric(12,2) NOT NULL CHECK (taxa_maquininha >= 0),
  valor_real_recebido numeric(12,2) NOT NULL CHECK (valor_real_recebido >= 0),
  cmv numeric(12,2) NOT NULL DEFAULT 0 CHECK (cmv >= 0),
  lucro_real numeric(12,2) NOT NULL,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS financeiro_vendas_repasse_criado_idx ON public.financeiro_vendas_repasse (criado_em DESC);
GRANT SELECT ON public.financeiro_vendas_repasse TO authenticated;
GRANT ALL ON public.financeiro_vendas_repasse TO service_role;
ALTER TABLE public.financeiro_vendas_repasse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financeiro_vendas_repasse_gerente" ON public.financeiro_vendas_repasse;
CREATE POLICY "financeiro_vendas_repasse_gerente" ON public.financeiro_vendas_repasse FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE OR REPLACE FUNCTION public.salvar_taxas_repasse(_taxas jsonb)
RETURNS public.financeiro_taxas_repasse
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE resultado public.financeiro_taxas_repasse; campo text; valor numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode configurar taxas.'; END IF;
  FOREACH campo IN ARRAY ARRAY['pix_percentual','dinheiro_percentual','debito_percentual','credito_1x_percentual','credito_2x_percentual','credito_3x_percentual','credito_4x_percentual','credito_5x_percentual','credito_6x_percentual','credito_7x_percentual','credito_8x_percentual','credito_9x_percentual','credito_10x_percentual','credito_11x_percentual','credito_12x_percentual'] LOOP
    valor := ROUND(COALESCE((_taxas->>campo)::numeric, 0), 3);
    IF valor < 0 OR valor >= 100 THEN RAISE EXCEPTION 'A taxa % deve estar entre 0 e 99,999%%.', campo; END IF;
  END LOOP;
  UPDATE public.financeiro_taxas_repasse SET
    pix_percentual = ROUND(COALESCE((_taxas->>'pix_percentual')::numeric, 0), 3),
    dinheiro_percentual = ROUND(COALESCE((_taxas->>'dinheiro_percentual')::numeric, 0), 3),
    debito_percentual = ROUND(COALESCE((_taxas->>'debito_percentual')::numeric, 0), 3),
    credito_1x_percentual = ROUND(COALESCE((_taxas->>'credito_1x_percentual')::numeric, 0), 3),
    credito_2x_percentual = ROUND(COALESCE((_taxas->>'credito_2x_percentual')::numeric, 0), 3),
    credito_3x_percentual = ROUND(COALESCE((_taxas->>'credito_3x_percentual')::numeric, 0), 3),
    credito_4x_percentual = ROUND(COALESCE((_taxas->>'credito_4x_percentual')::numeric, 0), 3),
    credito_5x_percentual = ROUND(COALESCE((_taxas->>'credito_5x_percentual')::numeric, 0), 3),
    credito_6x_percentual = ROUND(COALESCE((_taxas->>'credito_6x_percentual')::numeric, 0), 3),
    credito_7x_percentual = ROUND(COALESCE((_taxas->>'credito_7x_percentual')::numeric, 0), 3),
    credito_8x_percentual = ROUND(COALESCE((_taxas->>'credito_8x_percentual')::numeric, 0), 3),
    credito_9x_percentual = ROUND(COALESCE((_taxas->>'credito_9x_percentual')::numeric, 0), 3),
    credito_10x_percentual = ROUND(COALESCE((_taxas->>'credito_10x_percentual')::numeric, 0), 3),
    credito_11x_percentual = ROUND(COALESCE((_taxas->>'credito_11x_percentual')::numeric, 0), 3),
    credito_12x_percentual = ROUND(COALESCE((_taxas->>'credito_12x_percentual')::numeric, 0), 3),
    updated_at = now(), updated_by = auth.uid() WHERE id = true RETURNING * INTO resultado;
  RETURN resultado;
END; $$;
GRANT EXECUTE ON FUNCTION public.salvar_taxas_repasse(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_venda_repasse(_venda jsonb)
RETURNS public.financeiro_vendas_repasse
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.financeiro_vendas_repasse; v_sessao uuid; v_total numeric; v_base numeric; v_taxa numeric; v_cmv numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode registrar vendas no Financeiro.'; END IF;
  v_base := ROUND(GREATEST(COALESCE((_venda->>'valor_original')::numeric, 0) - COALESCE((_venda->>'desconto_concedido')::numeric, 0), 0), 2);
  v_taxa := ROUND(COALESCE((_venda->>'taxa_percentual')::numeric, 0), 3);
  IF v_base < 0 OR v_taxa < 0 OR v_taxa >= 100 THEN RAISE EXCEPTION 'Base ou taxa inválida.'; END IF;
  v_total := ROUND(v_base / (1 - v_taxa / 100), 2);
  v_cmv := ROUND(GREATEST(COALESCE((_venda->>'cmv')::numeric, 0), 0), 2);
  INSERT INTO public.financeiro_vendas_repasse (valor_unitario, quantidade, valor_original, desconto_concedido, base_apos_desconto, forma_pagamento, parcelas, taxa_percentual, valor_acrescimo, total_cobrado, valor_parcela, taxa_maquininha, valor_real_recebido, cmv, lucro_real, criado_por)
  VALUES (ROUND((_venda->>'valor_unitario')::numeric, 2), ROUND((_venda->>'quantidade')::numeric, 2), ROUND((_venda->>'valor_original')::numeric, 2), ROUND(COALESCE((_venda->>'desconto_concedido')::numeric, 0), 2), v_base, _venda->>'forma_pagamento', COALESCE((_venda->>'parcelas')::integer, 1), v_taxa, ROUND(v_total - v_base, 2), v_total, ROUND(v_total / COALESCE((_venda->>'parcelas')::integer, 1), 2), ROUND(v_total - v_base, 2), v_base, v_cmv, ROUND(v_base - v_cmv, 2), auth.uid()) RETURNING * INTO r;
  SELECT id INTO v_sessao FROM public.caixa_sessoes WHERE aberto = true ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_sessao IS NOT NULL THEN
    INSERT INTO public.caixa_movimentos (sessao_id, tipo, descricao, valor, forma, responsavel)
    VALUES (v_sessao, 'entrada', format('Venda com repasse de taxa — %s', r.forma_pagamento), r.total_cobrado, r.forma_pagamento, auth.uid()::text);
  END IF;
  RETURN r;
END; $$;
GRANT EXECUTE ON FUNCTION public.registrar_venda_repasse(jsonb) TO authenticated;
