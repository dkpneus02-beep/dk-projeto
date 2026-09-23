-- Catálogo de peças: várias referências de marcas diferentes para a mesma peça.
-- A migração preserva os itens existentes e mantém estoque, custo e preço em pecas.

ALTER TABLE public.pecas
  ADD COLUMN IF NOT EXISTS aplicacao text,
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE TABLE IF NOT EXISTS public.peca_referencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id uuid NOT NULL REFERENCES public.pecas(id) ON DELETE CASCADE,
  marca text NOT NULL,
  referencia text NOT NULL,
  observacao text,
  principal boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peca_referencias_referencia_nao_vazia
    CHECK (length(btrim(referencia)) > 0),
  CONSTRAINT peca_referencias_marca_nao_vazia
    CHECK (length(btrim(marca)) > 0)
);

ALTER TABLE public.peca_referencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peca_referencias TO authenticated;
GRANT ALL ON public.peca_referencias TO service_role;

DROP POLICY IF EXISTS "peca_referencias_all" ON public.peca_referencias;
CREATE POLICY "peca_referencias_all"
  ON public.peca_referencias
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS peca_referencias_touch ON public.peca_referencias;
CREATE TRIGGER peca_referencias_touch
  BEFORE UPDATE ON public.peca_referencias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Mantém a referência completa para buscas normalizadas sem exigir que o usuário
-- digite pontos, hífens ou espaços exatamente como foram cadastrados.
CREATE OR REPLACE FUNCTION public.normalizar_referencia_peca(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(btrim(coalesce(valor, ''))), '[^a-z0-9]+', '', 'g');
$$;

CREATE INDEX IF NOT EXISTS peca_referencias_peca_id_idx
  ON public.peca_referencias (peca_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS peca_referencias_referencia_normalizada_idx
  ON public.peca_referencias (public.normalizar_referencia_peca(referencia))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS peca_referencias_uma_referencia_por_peca_idx
  ON public.peca_referencias (
    peca_id,
    public.normalizar_referencia_peca(referencia)
  )
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS peca_referencias_uma_principal_por_peca_idx
  ON public.peca_referencias (peca_id)
  WHERE principal AND deleted_at IS NULL;

-- Migra o SKU atual para a nova estrutura. Itens sem SKU continuam válidos
-- e poderão receber referências pela nova tela de cadastro.
INSERT INTO public.peca_referencias (peca_id, marca, referencia, principal)
SELECT
  p.id,
  btrim(p.marca),
  btrim(p.sku),
  true
FROM public.pecas p
WHERE p.deleted_at IS NULL
  AND nullif(btrim(p.sku), '') IS NOT NULL
  AND nullif(btrim(p.marca), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.peca_referencias r
    WHERE r.peca_id = p.id
      AND r.deleted_at IS NULL
      AND public.normalizar_referencia_peca(r.referencia) = public.normalizar_referencia_peca(p.sku)
  );

COMMENT ON TABLE public.peca_referencias IS
  'Referências equivalentes de marcas diferentes vinculadas a uma peça principal.';
COMMENT ON COLUMN public.peca_referencias.principal IS
  'Indica a referência preferencial da peça; todas as referências continuam pesquisáveis.';
COMMENT ON COLUMN public.pecas.aplicacao IS
  'Aplicação ou veículos compatíveis com a peça.';
COMMENT ON COLUMN public.pecas.observacoes IS
  'Informações adicionais sobre a peça.';
