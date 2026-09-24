-- Integração dos lotes com o consumo e estorno de peças na OS.

CREATE OR REPLACE FUNCTION public.baixar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode consumir peças ao finalizar uma OS.'; END IF;
  FOR item IN
    SELECT s.id, s.peca_id, s.quantidade, s.nome, COALESCE(p.preco_custo, 0) AS preco_custo
    FROM public.atendimento_servicos s JOIN public.pecas p ON p.id = s.peca_id
    WHERE s.atendimento_id = _atendimento_id AND s.peca_id IS NOT NULL AND s.quantidade > 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.atendimento_pecas_movimentos m WHERE m.atendimento_servico_id = item.id AND m.tipo = 'consumo') THEN CONTINUE; END IF;
    custo := ROUND(GREATEST(COALESCE(item.preco_custo, 0), 0), 2);
    UPDATE public.pecas SET estoque = estoque - item.quantidade, updated_at = now()
    WHERE id = item.peca_id AND deleted_at IS NULL AND estoque >= item.quantidade;
    IF NOT FOUND THEN RAISE EXCEPTION 'Estoque insuficiente para a peça do serviço: %.', item.nome; END IF;
    PERFORM public.consumir_lotes_estoque(item.peca_id, item.quantidade);
    INSERT INTO public.atendimento_pecas_movimentos (atendimento_servico_id, atendimento_id, peca_id, quantidade, tipo)
    VALUES (item.id, _atendimento_id, item.peca_id, item.quantidade, 'consumo');
    INSERT INTO public.atendimento_pecas_cmv (atendimento_servico_id, atendimento_id, peca_id, quantidade, custo_unitario, custo_total, tipo)
    VALUES (item.id, _atendimento_id, item.peca_id, item.quantidade, custo, ROUND(custo * item.quantidade, 2), 'consumo');
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_pecas_atendimento(_atendimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; custo numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN RAISE EXCEPTION 'Apenas o gerente pode reabrir uma OS e estornar peças.'; END IF;
  FOR item IN
    SELECT m.atendimento_servico_id, m.peca_id, m.quantidade,
      COALESCE((SELECT c.custo_unitario FROM public.atendimento_pecas_cmv c WHERE c.atendimento_servico_id = m.atendimento_servico_id AND c.tipo = 'consumo' ORDER BY c.criado_em DESC LIMIT 1), p.preco_custo, 0) AS custo_unitario
    FROM public.atendimento_pecas_movimentos m JOIN public.pecas p ON p.id = m.peca_id
    WHERE m.atendimento_id = _atendimento_id AND m.tipo = 'consumo'
  LOOP
    custo := ROUND(GREATEST(COALESCE(item.custo_unitario, 0), 0), 2);
    PERFORM public.repor_estoque_com_custo(item.peca_id, item.quantidade, custo);
    INSERT INTO public.atendimento_pecas_cmv (atendimento_servico_id, atendimento_id, peca_id, quantidade, custo_unitario, custo_total, tipo)
    VALUES (item.atendimento_servico_id, _atendimento_id, item.peca_id, item.quantidade, custo, ROUND(custo * item.quantidade, 2), 'estorno');
  END LOOP;
  DELETE FROM public.atendimento_pecas_movimentos WHERE atendimento_id = _atendimento_id AND tipo = 'consumo';
END; $$;
