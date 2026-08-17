
-- roles
CREATE TYPE public.app_role AS ENUM ('gerente','mecanico');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'mecanico'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- mecanicos
CREATE TABLE public.mecanicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  ativo boolean NOT NULL DEFAULT true,
  user_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mecanicos TO authenticated;
GRANT ALL ON public.mecanicos TO service_role;
ALTER TABLE public.mecanicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mecanicos_all" ON public.mecanicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- catalogo de servicos
CREATE TABLE public.servicos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  preco_padrao numeric(12,2) NOT NULL DEFAULT 0,
  retorno_meses integer NOT NULL DEFAULT 6,
  garantia_km integer,
  ativo boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos_catalogo TO authenticated;
GRANT ALL ON public.servicos_catalogo TO service_role;
ALTER TABLE public.servicos_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servicos_catalogo_all" ON public.servicos_catalogo FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.servicos_catalogo (nome, retorno_meses, garantia_km) VALUES
('Troca de pneu', 12, 20000),
('Balanceamento', 6, 10000),
('Alinhamento', 6, 10000),
('Troca de pastilhas de freio', 6, 10000),
('Troca de amortecedor', 12, 20000),
('Troca de óleo', 6, 10000),
('Troca de pivô', 12, 20000),
('Troca de terminal', 12, 20000),
('Troca de coifas', 12, 20000),
('Troca de barra axial', 12, 20000),
('Troca de rolamentos', 12, 20000),
('Troca de bieleta', 12, 20000),
('Troca de morcegos', 12, 20000),
('Troca de homocinética', 12, 20000);

-- pecas / pneus
CREATE TABLE public.pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text,
  nome text NOT NULL,
  marca text,
  categoria text NOT NULL DEFAULT 'peca',
  tipo text NOT NULL DEFAULT 'peca',
  estoque numeric(12,2) NOT NULL DEFAULT 0,
  estoque_minimo numeric(12,2) NOT NULL DEFAULT 0,
  preco_custo numeric(12,2) NOT NULL DEFAULT 0,
  margem numeric(6,2) NOT NULL DEFAULT 0,
  preco_venda numeric(12,2) NOT NULL DEFAULT 0,
  medida text,
  indice_carga text,
  simbolo_velocidade text,
  modelo_desenho text,
  construcao text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pecas TO authenticated;
GRANT ALL ON public.pecas TO service_role;
ALTER TABLE public.pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pecas_all" ON public.pecas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER pecas_touch BEFORE UPDATE ON public.pecas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- atendimentos
CREATE SEQUENCE public.atendimento_numero_seq START 1000;

CREATE TABLE public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT nextval('public.atendimento_numero_seq'),
  placa text NOT NULL,
  fabricante text,
  modelo text,
  cor text,
  cliente_nome text NOT NULL,
  cliente_telefone text,
  cliente_cpf text,
  km integer,
  entrada_at timestamptz NOT NULL DEFAULT now(),
  observacao text,
  alertas_tecnicos text,
  avarias jsonb NOT NULL DEFAULT '[]'::jsonb,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'aberto',
  desconto numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  finalizado_at timestamptz,
  garantia_ate date,
  garantia_km integer,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimentos TO authenticated;
GRANT ALL ON public.atendimentos TO service_role;
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atendimentos_all" ON public.atendimentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER atendimentos_touch BEFORE UPDATE ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.check_patio_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE qtd integer;
BEGIN
  SELECT count(*) INTO qtd FROM public.atendimentos
   WHERE status = 'aberto' AND deleted_at IS NULL;
  IF qtd >= 5 THEN
    RAISE EXCEPTION 'Pátio lotado: máximo de 5 carros ao mesmo tempo.';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER atendimentos_patio_limit BEFORE INSERT ON public.atendimentos
FOR EACH ROW WHEN (NEW.status = 'aberto') EXECUTE FUNCTION public.check_patio_limit();

CREATE TABLE public.atendimento_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando',
  valor numeric(12,2) NOT NULL DEFAULT 0,
  mecanico_id uuid REFERENCES public.mecanicos(id),
  peca_id uuid REFERENCES public.pecas(id),
  quantidade numeric(12,2) NOT NULL DEFAULT 1,
  retorno_meses integer NOT NULL DEFAULT 6,
  garantia_km integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_servicos TO authenticated;
GRANT ALL ON public.atendimento_servicos TO service_role;
ALTER TABLE public.atendimento_servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atendimento_servicos_all" ON public.atendimento_servicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  forma text NOT NULL,
  valor numeric(12,2) NOT NULL,
  parcelas integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos TO authenticated;
GRANT ALL ON public.pagamentos TO service_role;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pagamentos_all" ON public.pagamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- caixa
CREATE TABLE public.caixa_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT current_date,
  responsavel text NOT NULL,
  valor_inicial numeric(12,2) NOT NULL DEFAULT 0,
  aberto boolean NOT NULL DEFAULT true,
  fechado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixa_sessoes TO authenticated;
GRANT ALL ON public.caixa_sessoes TO service_role;
ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixa_sessoes_all" ON public.caixa_sessoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.caixa_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  forma text,
  atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  responsavel text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixa_movimentos TO authenticated;
GRANT ALL ON public.caixa_movimentos TO service_role;
ALTER TABLE public.caixa_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixa_movimentos_all" ON public.caixa_movimentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pos-venda
CREATE TABLE public.notificacoes_retorno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  cliente_nome text NOT NULL,
  telefone text,
  veiculo text,
  servico text NOT NULL,
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_retorno TO authenticated;
GRANT ALL ON public.notificacoes_retorno TO service_role;
ALTER TABLE public.notificacoes_retorno ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacoes_retorno_all" ON public.notificacoes_retorno FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- avisos internos
CREATE TABLE public.avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem text NOT NULL,
  mecanico_id uuid REFERENCES public.mecanicos(id) ON DELETE CASCADE,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos TO authenticated;
GRANT ALL ON public.avisos TO service_role;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avisos_all" ON public.avisos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.aviso_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id uuid NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_nome text,
  lido_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aviso_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aviso_leituras TO authenticated;
GRANT ALL ON public.aviso_leituras TO service_role;
ALTER TABLE public.aviso_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aviso_leituras_all" ON public.aviso_leituras FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- configuracoes
CREATE TABLE public.configuracoes (
  id boolean PRIMARY KEY DEFAULT true,
  nome_oficina text NOT NULL DEFAULT 'DK Auto Center',
  horario_fechamento time NOT NULL DEFAULT '17:30',
  aviso_antecedencia_min integer NOT NULL DEFAULT 15,
  garantia_dias integer NOT NULL DEFAULT 90,
  CONSTRAINT configuracoes_single CHECK (id)
);
GRANT SELECT, INSERT, UPDATE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configuracoes_all" ON public.configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.configuracoes (id) VALUES (true);
