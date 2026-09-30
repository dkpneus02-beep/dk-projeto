-- Fase 2 (hardening): aplicar somente depois da nova interface estar publicada.
-- Bloqueia writes diretos antigos; a tela nova usa RPCs autorizadas.
-- A aba Peças/Pneus é gerencial; referências não devem ser alteráveis por qualquer usuário autenticado.
DROP POLICY IF EXISTS "peca_referencias_all" ON public.peca_referencias;
DROP POLICY IF EXISTS "peca_referencias_gerente" ON public.peca_referencias;
CREATE POLICY "peca_referencias_gerente"
  ON public.peca_referencias
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Evita que chamadas diretas à tabela contornem a criação/baixa de lotes.
-- As RPCs SECURITY DEFINER autorizadas executam como proprietárias e continuam funcionando.
CREATE OR REPLACE FUNCTION public.impedir_alteracao_direta_saldo_peca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF CURRENT_USER IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.estoque, 0) <> 0 THEN
      RAISE EXCEPTION 'Registre o estoque inicial por uma operação de lote autorizada.';
    ELSIF TG_OP = 'UPDATE'
      AND (
        NEW.estoque IS DISTINCT FROM OLD.estoque
        OR NEW.preco_custo IS DISTINCT FROM OLD.preco_custo
      ) THEN
      RAISE EXCEPTION 'Use uma operação de estoque autorizada para alterar saldo ou custo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pecas_bloquear_alteracao_direta_saldo ON public.pecas;
CREATE TRIGGER pecas_bloquear_alteracao_direta_saldo
  BEFORE INSERT OR UPDATE OF estoque, preco_custo ON public.pecas
  FOR EACH ROW EXECUTE FUNCTION public.impedir_alteracao_direta_saldo_peca();
REVOKE EXECUTE ON FUNCTION public.impedir_alteracao_direta_saldo_peca()
  FROM PUBLIC, anon, authenticated;

-- RPCs internos de lote não devem ser invocáveis diretamente pelo cliente.
-- As rotinas SECURITY DEFINER de finalização/reabertura de OS continuam usando-as como proprietárias.
REVOKE EXECUTE ON FUNCTION public.consumir_lotes_estoque(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.repor_estoque_com_custo(uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;

-- RPCs expostas ao app ficam disponíveis só para usuários autenticados;
-- as próprias funções validam a role gerente.
REVOKE EXECUTE ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque(uuid, numeric)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.adicionar_entrada_estoque_com_custo(uuid, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_entrada_estoque_com_custo(uuid, numeric, numeric)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ajustar_estoque_com_lotes(uuid, numeric, text, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_com_lotes(uuid, numeric, text, numeric)
  TO authenticated;

-- Mantém chamadas de OS para gerentes autenticados; acesso anônimo não é necessário.
REVOKE EXECUTE ON FUNCTION public.baixar_pecas_atendimento(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixar_pecas_atendimento(uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.estornar_pecas_atendimento(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pecas_atendimento(uuid)
  TO authenticated;
