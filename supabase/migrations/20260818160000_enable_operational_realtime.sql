DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atendimentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimentos;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atendimento_servicos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_servicos;
  END IF;
END;
$$;
