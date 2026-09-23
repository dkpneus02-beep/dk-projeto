-- Correção: ON CONFLICT por colunas requer índice único não parcial.
-- O índice continua permitindo várias linhas com origem NULL, como desejado.
DROP INDEX IF EXISTS public.despesas_financeiras_recorrencia_competencia_uq;

CREATE UNIQUE INDEX despesas_financeiras_recorrencia_competencia_uq
  ON public.despesas_financeiras (recorrencia_origem_id, competencia);
