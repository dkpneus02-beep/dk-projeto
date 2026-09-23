-- Primeira etapa do financeiro: gastos fixos, variáveis e parcelas.
-- Esta migração fica versionada localmente e não é aplicada remotamente nesta etapa.

CREATE TABLE IF NOT EXISTS public.financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'operacional' CHECK (tipo IN ('operacional', 'estoque', 'pessoal', 'imposto', 'outro')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS public.despesas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  categoria_id uuid REFERENCES public.financeiro_categorias(id),
  tipo text NOT NULL CHECK (tipo IN ('fixo', 'variavel')),
  fornecedor text,
  competencia date NOT NULL,
  data_emissao date,
  data_vencimento date NOT NULL,
  valor_total numeric(14,2) NOT NULL CHECK (valor_total > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'pago', 'atrasado', 'cancelado')),
  recorrente boolean NOT NULL DEFAULT false,
  recorrencia_meses integer NOT NULL DEFAULT 1 CHECK (recorrencia_meses > 0),
  codigo_barras text,
  observacoes text,
  comprovante_path text,
  criado_por uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.despesa_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despesa_id uuid NOT NULL REFERENCES public.despesas_financeiras(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  data_vencimento date NOT NULL,
  data_pagamento timestamptz,
  valor_pago numeric(14,2) CHECK (valor_pago IS NULL OR valor_pago >= 0),
  forma_pagamento text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'pago', 'atrasado', 'cancelado')),
  caixa_movimento_id uuid REFERENCES public.caixa_movimentos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (despesa_id, numero)
);

CREATE INDEX IF NOT EXISTS despesas_financeiras_competencia_idx ON public.despesas_financeiras (competencia);
CREATE INDEX IF NOT EXISTS despesas_financeiras_vencimento_idx ON public.despesas_financeiras (data_vencimento);
CREATE INDEX IF NOT EXISTS despesas_financeiras_status_idx ON public.despesas_financeiras (status);
CREATE INDEX IF NOT EXISTS despesa_parcelas_vencimento_idx ON public.despesa_parcelas (data_vencimento);

ALTER TABLE public.financeiro_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesa_parcelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_categorias_gerente ON public.financeiro_categorias;
CREATE POLICY financeiro_categorias_gerente ON public.financeiro_categorias
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS despesas_financeiras_gerente ON public.despesas_financeiras;
CREATE POLICY despesas_financeiras_gerente ON public.despesas_financeiras
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS despesa_parcelas_gerente ON public.despesa_parcelas;
CREATE POLICY despesa_parcelas_gerente ON public.despesa_parcelas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

INSERT INTO public.financeiro_categorias (nome, tipo) VALUES
  ('Aluguel', 'operacional'),
  ('Água', 'operacional'),
  ('Energia elétrica', 'operacional'),
  ('Internet e telefone', 'operacional'),
  ('Ferramentas e manutenção', 'operacional'),
  ('Compra de peças', 'estoque'),
  ('Compra de pneus', 'estoque'),
  ('Frete', 'operacional'),
  ('Salários e folha', 'pessoal'),
  ('Adiantamentos', 'pessoal'),
  ('Comissões', 'pessoal'),
  ('Impostos', 'imposto'),
  ('Taxas de cartão', 'operacional'),
  ('Material de consumo', 'operacional'),
  ('Outros gastos', 'outro')
ON CONFLICT (nome) DO NOTHING;

COMMENT ON TABLE public.despesas_financeiras IS 'Contas e gastos fixos ou variáveis cadastrados pelo gerente.';
COMMENT ON TABLE public.despesa_parcelas IS 'Parcelas individuais de uma despesa, com vencimento e pagamento próprios.';
COMMENT ON COLUMN public.despesas_financeiras.competencia IS 'Mês ao qual o gasto pertence para o resultado gerencial.';
COMMENT ON COLUMN public.despesas_financeiras.data_vencimento IS 'Data prevista para pagamento da obrigação.';
