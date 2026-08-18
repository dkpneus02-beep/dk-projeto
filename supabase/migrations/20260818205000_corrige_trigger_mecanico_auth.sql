-- O trigger de Auth cria o registro inicial do mecânico quando a conta é criada.
-- A versão anterior usava ON CONFLICT (id), mas a unicidade operacional é por user_id.
-- Isso fazia o endpoint server-side tentar inserir uma segunda linha.
CREATE OR REPLACE FUNCTION public.handle_new_mecanico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.raw_user_meta_data::text) LIKE '%mecanico%' THEN
    INSERT INTO public.mecanicos (user_id, nome, email, ativo, deleted_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'nome', 'Mecânico sem nome'),
      NEW.email,
      true,
      null
    )
    ON CONFLICT (user_id) DO UPDATE
      SET nome = EXCLUDED.nome,
          email = EXCLUDED.email,
          ativo = true,
          deleted_at = null;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_mecanico_created ON auth.users;
CREATE TRIGGER on_auth_mecanico_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_mecanico();

GRANT EXECUTE ON FUNCTION public.handle_new_mecanico() TO service_role;
NOTIFY pgrst, 'reload schema';
