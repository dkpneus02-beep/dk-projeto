-- Quinta etapa financeira: status de atraso e alertas persistentes de vencimento.

CREATE OR REPLACE FUNCTION public.atualizar_alertas_financeiros(
  _hoje date DEFAULT CURRENT_DATE,
  _antecedencia integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gerente_user uuid;
  parcela record;
  dias integer;
  titulo text;
  mensagem text;
  chave text;
  total_alertas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'Apenas o gerente pode atualizar alertas financeiros.';
  END IF;
  IF _antecedencia < 0 OR _antecedencia > 90 THEN
    RAISE EXCEPTION 'A antecedência deve estar entre 0 e 90 dias.';
  END IF;

  UPDATE public.despesa_parcelas
  SET status = 'atrasado', updated_at = now()
  WHERE status IN ('pendente', 'atrasado')
    AND data_vencimento < _hoje;

  UPDATE public.despesas_financeiras d
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.despesa_parcelas p
      WHERE p.despesa_id = d.id AND p.status = 'atrasado'
    ) THEN 'atrasado'
    WHEN EXISTS (
      SELECT 1 FROM public.despesa_parcelas p
      WHERE p.despesa_id = d.id AND p.status IN ('pendente', 'parcial')
    ) THEN 'pendente'
    ELSE d.status
  END,
  updated_at = now()
  WHERE d.deleted_at IS NULL
    AND d.status NOT IN ('pago', 'cancelado');

  FOR gerente_user IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'gerente'
  LOOP
    FOR parcela IN
      SELECT p.id, p.despesa_id, p.data_vencimento, p.valor, p.status,
             d.descricao, d.fornecedor
      FROM public.despesa_parcelas p
      JOIN public.despesas_financeiras d ON d.id = p.despesa_id
      WHERE d.deleted_at IS NULL
        AND p.status IN ('pendente', 'atrasado')
        AND (
          p.data_vencimento < _hoje
          OR p.data_vencimento BETWEEN _hoje AND (_hoje + _antecedencia)
        )
    LOOP
      dias := parcela.data_vencimento - _hoje;
      IF parcela.status = 'atrasado' OR parcela.data_vencimento < _hoje THEN
        titulo := 'Conta em atraso';
        mensagem := COALESCE(parcela.descricao, 'Gasto') || ' está atrasado desde ' || to_char(parcela.data_vencimento, 'DD/MM/YYYY') || ' — ' || to_char(parcela.valor, 'FM999G999G990D00') || '.';
        chave := 'financeiro:parcela:' || parcela.id || ':atrasada';
      ELSE
        titulo := 'Conta próxima do vencimento';
        mensagem := COALESCE(parcela.descricao, 'Gasto') || ' vence em ' || to_char(parcela.data_vencimento, 'DD/MM/YYYY') || ' — ' || to_char(parcela.valor, 'FM999G999G990D00') || '.';
        chave := 'financeiro:parcela:' || parcela.id || ':vence:' || parcela.data_vencimento;
      END IF;

      PERFORM public.criar_notificacao_interna(
        'alerta_financeiro',
        titulo,
        mensagem,
        gerente_user,
        NULL,
        NULL,
        NULL,
        chave,
        jsonb_build_object(
          'despesa_id', parcela.despesa_id,
          'parcela_id', parcela.id,
          'data_vencimento', parcela.data_vencimento,
          'valor', parcela.valor,
          'dias', dias
        )
      );
      total_alertas := total_alertas + 1;
    END LOOP;
  END LOOP;

  RETURN total_alertas;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_alertas_financeiros(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_alertas_financeiros(date, integer) TO authenticated;
