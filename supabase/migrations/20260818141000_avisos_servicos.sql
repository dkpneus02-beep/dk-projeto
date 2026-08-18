-- Avisos de serviço com ciclo mensal e exclusão lógica.
ALTER TABLE public.avisos
  ADD COLUMN IF NOT EXISTS atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atendimento_servico_id uuid REFERENCES public.atendimento_servicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS editado_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_at timestamptz,
  ADD COLUMN IF NOT EXISTS mes_referencia date NOT NULL DEFAULT date_trunc('month', now())::date;

CREATE INDEX IF NOT EXISTS avisos_mes_idx ON public.avisos (mes_referencia, created_at DESC);
CREATE INDEX IF NOT EXISTS avisos_servico_idx ON public.avisos (atendimento_servico_id, created_at DESC);

DROP POLICY IF EXISTS "avisos_all" ON public.avisos;
CREATE POLICY "avisos_select_permitidos" ON public.avisos
  FOR SELECT TO authenticated
  USING (
    excluido_at IS NULL
    AND (
      public.has_role(auth.uid(), 'gerente')
      OR mecanico_id IS NULL
      OR EXISTS (SELECT 1 FROM public.mecanicos m WHERE m.id = avisos.mecanico_id AND m.user_id = auth.uid())
    )
  );

CREATE POLICY "avisos_insert_gerente" ON public.avisos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "avisos_update_gerente" ON public.avisos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "avisos_delete_gerente" ON public.avisos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "aviso_leituras_all" ON public.aviso_leituras;
CREATE POLICY "aviso_leituras_select_permitidas" ON public.aviso_leituras
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.avisos a WHERE a.id = aviso_leituras.aviso_id AND public.has_role(auth.uid(), 'gerente'))
  );

CREATE POLICY "aviso_leituras_insert_propria" ON public.aviso_leituras
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "aviso_leituras_update_propria" ON public.aviso_leituras
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
