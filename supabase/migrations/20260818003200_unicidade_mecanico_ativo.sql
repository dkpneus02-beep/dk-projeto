CREATE UNIQUE INDEX IF NOT EXISTS mecanicos_user_id_ativo_unique
ON public.mecanicos (user_id)
WHERE user_id IS NOT NULL
  AND ativo = true
  AND deleted_at IS NULL;
