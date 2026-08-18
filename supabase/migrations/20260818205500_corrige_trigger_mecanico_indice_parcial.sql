-- A unicidade de user_id é um índice parcial. ON CONFLICT (user_id)
-- não consegue inferir índices parciais sem o predicado, então o trigger
-- usa UPDATE seguido de INSERT dentro da mesma transação.
CREATE OR REPLACE FUNCTION public.handle_new_mecanico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nome_mecanico text;
BEGIN
  IF lower(NEW.raw_user_meta_data::text) LIKE '%mecanico%' THEN
    nome_mecanico := COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'nome',
      'Mecânico sem nome'
    );

    UPDATE public.mecanicos
       SET nome = nome_mecanico,
           email = NEW.email,
           ativo = true,
           deleted_at = null
     WHERE user_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO public.mecanicos (user_id, nome, email, ativo, deleted_at)
      VALUES (NEW.id, nome_mecanico, NEW.email, true, null);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
