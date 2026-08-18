-- Impede duplicidades de identidade entre mecânicos ativos ou logicamente presentes.
-- Registros com deleted_at não nulo ficam fora dos índices para preservar a restauração idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS mecanicos_nome_presente_unique
ON public.mecanicos (lower(btrim(nome)))
WHERE deleted_at IS NULL
  AND btrim(nome) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS mecanicos_telefone_presente_unique
ON public.mecanicos (regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'))
WHERE deleted_at IS NULL
  AND length(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g')) >= 10;

CREATE UNIQUE INDEX IF NOT EXISTS mecanicos_email_presente_unique
ON public.mecanicos (lower(btrim(email)))
WHERE deleted_at IS NULL
  AND btrim(coalesce(email, '')) <> '';

COMMENT ON INDEX public.mecanicos_nome_presente_unique IS 'Um nome normalizado por mecânico não excluído';
COMMENT ON INDEX public.mecanicos_telefone_presente_unique IS 'Um telefone normalizado por mecânico não excluído';
COMMENT ON INDEX public.mecanicos_email_presente_unique IS 'Um e-mail normalizado por mecânico não excluído';

NOTIFY pgrst, 'reload schema';

-- Fim da migration de unicidade de identidade de mecânicos.

/*
  A conta de gerente é bloqueada no server function porque todos os e-mails
  existentes no Supabase Auth são consultados antes de createUser. Assim, um
  e-mail do gerente não precisa existir na tabela mecanicos para ser recusado.
*/

-- Índices acima são deliberadamente parciais para não impedir restauração lógica.
-- O endpoint server-side também valida nome e telefone com normalização de acentos
-- e máscara, produzindo mensagens amigáveis antes do erro do banco.

-- Segurança: nenhuma permissão de mecânico é ampliada por esta migration.
