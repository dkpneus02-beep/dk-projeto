import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NovoAtendimentoDialog } from "@/components/NovoAtendimentoDialog";
import { brl, d, diasEntre, dt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel | DK Auto Center" },
      { name: "description", content: "Dashboard mensal da DK Auto Center com faturamento, custos, lucro e operação." },
      { property: "og:title", content: "Painel | DK Auto Center" },
      { property: "og:description", content: "Gestão mensal da oficina: receita, custo, lucro, estoque e retornos." },
    ],
  }),
  component: Dashboard,
});

type DashboardServico = {
  id?: string;
  nome: string;
  valor: number;
  quantidade?: number;
  mecanico_id?: string | null;
  preco_peca?: number;
  mao_de_obra?: number;
  pecas?: { nome?: string; preco_custo?: number } | null;
};

type DashboardPagamento = { forma: string; valor: number };
type DashboardOs = {
  id: string;
  numero: number;
  total: number;
  desconto: number;
  finalizado_at: string;
  atendimento_servicos: DashboardServico[];
  pagamentos: DashboardPagamento[];
};

const CORES = ["#f97316", "#0ea5e9", "#22c55e", "#a855f7", "#eab308", "#ef4444"];

function periodoAtual() {
  return new Date().toISOString().slice(0, 7);
}

function limitesDoMes(periodo: string) {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = `${periodo}-01`;
  const proximo = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  return { inicio, proximo };
}

function Dashboard() {
  const [periodo, setPeriodo] = useState(periodoAtual);
  const { inicio, proximo } = limitesDoMes(periodo);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", periodo],
    queryFn: async () => {
      const [patio, pendencias, finalizados, retornos, pecas, mecanicos] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("id, numero, placa, modelo, cliente_nome, entrada_at")
          .eq("status", "aberto")
          .is("deleted_at", null)
          .order("entrada_at"),
        supabase
          .from("atendimentos")
          .select("id, numero, placa, modelo, cliente_nome, entrada_at, pronto_at, atendimento_servicos(nome, valor, mecanico_id)")
          .eq("status", "aguardando_gerente")
          .is("deleted_at", null)
          .order("pronto_at", { ascending: true }),
        supabase
          .from("atendimentos")
          .select("id, numero, total, desconto, finalizado_at, atendimento_servicos(id, nome, valor, quantidade, mecanico_id, preco_peca, mao_de_obra, pecas(nome, preco_custo)), pagamentos(forma, valor)")
          .eq("status", "finalizado")
          .is("deleted_at", null)
          .gte("finalizado_at", `${inicio}T00:00:00`)
          .lt("finalizado_at", `${proximo}T00:00:00`)
          .order("finalizado_at", { ascending: true })
          .limit(2000),
        supabase
          .from("notificacoes_retorno")
          .select("id, cliente_nome, veiculo, servico, vencimento")
          .eq("status", "pendente")
          .gte("vencimento", inicio)
          .lt("vencimento", proximo)
          .order("vencimento")
          .limit(200),
        supabase.from("pecas").select("id, nome, estoque, estoque_minimo").is("deleted_at", null),
        supabase.from("mecanicos").select("id, nome").is("deleted_at", null),
      ]);
      const firstError = [patio, pendencias, finalizados, retornos, pecas, mecanicos].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      return {
        patio: patio.data ?? [],
        pendencias: pendencias.data ?? [],
        finalizados: (finalizados.data ?? []) as unknown as DashboardOs[],
        retornos: retornos.data ?? [],
        pecas: (pecas.data ?? []).filter((p) => Number(p.estoque) <= Number(p.estoque_minimo)),
        mecanicos: mecanicos.data ?? [],
      };
    },
  });

  const patio = data?.patio ?? [];
  const pendencias = data?.pendencias ?? [];
  const finalizados = data?.finalizados ?? [];
  const retornos = data?.retornos ?? [];
  const baixos = data?.pecas ?? [];
  const mecanicoNome = new Map((data?.mecanicos ?? []).map((m) => [m.id, m.nome]));

  const metricas = useMemo(() => {
    const dias = new Map<string, { dia: string; receita: number; custo: number; lucro: number }>();
    const servicos = new Map<string, number>();
    const pagamentos = new Map<string, number>();
    const mecanicos = new Map<string, number>();
    let bruto = 0;
    let receita = 0;
    let custo = 0;
    let itens = 0;

    for (const os of finalizados) {
      const osServicos = os.atendimento_servicos ?? [];
      const brutoOs = osServicos.reduce((sum, servico) => sum + Number(servico.valor || 0), 0);
      const receitaOs = Number(os.total ?? Math.max(brutoOs - Number(os.desconto || 0), 0));
      const custoOs = osServicos.reduce((sum, servico) => {
        const quantidade = Number(servico.quantidade || 1);
        const custoUnitario = Number(servico.pecas?.preco_custo || 0);
        itens += servico.pecas ? quantidade : 0;
        return sum + custoUnitario * quantidade;
      }, 0);
      bruto += brutoOs;
      receita += receitaOs;
      custo += custoOs;

      const dia = os.finalizado_at?.slice(0, 10) ?? inicio;
      const atual = dias.get(dia) ?? { dia: dia.slice(8, 10), receita: 0, custo: 0, lucro: 0 };
      atual.receita += receitaOs;
      atual.custo += custoOs;
      atual.lucro += receitaOs - custoOs;
      dias.set(dia, atual);

      for (const servico of osServicos) {
        servicos.set(servico.nome, (servicos.get(servico.nome) ?? 0) + Number(servico.valor || 0));
        if (servico.mecanico_id) {
          const nome = mecanicoNome.get(servico.mecanico_id) ?? "Sem nome";
          mecanicos.set(nome, (mecanicos.get(nome) ?? 0) + Number(servico.valor || 0));
        }
      }
      for (const pagamento of os.pagamentos ?? []) {
        pagamentos.set(pagamento.forma, (pagamentos.get(pagamento.forma) ?? 0) + Number(pagamento.valor || 0));
      }
    }

    return {
      bruto,
      receita,
      custo,
      lucro: receita - custo,
      ticket: finalizados.length ? receita / finalizados.length : 0,
      itens,
      porDia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value),
      porServico: [...servicos.entries()].sort(([, a], [, b]) => b - a).slice(0, 8).map(([nome, valor]) => ({ nome, valor })),
      porMecanico: [...mecanicos.entries()].sort(([, a], [, b]) => b - a).map(([nome, valor]) => ({ nome, valor })),
      porPagamento: [...pagamentos.entries()].map(([nome, valor]) => ({ nome, valor })),
    };
  }, [finalizados, inicio, mecanicoNome]);

  const tituloMes = new Date(`${inicio}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const vencidos = retornos.filter((retorno) => diasEntre(retorno.vencimento) <= 0).length;

  return (
    <AppShell>
      <PageHeader title="Painel mensal" subtitle={`Indicadores de ${tituloMes}`}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor="dashboard-periodo">Período</label>
          <input id="dashboard-periodo" type="month" value={periodo} onChange={(event) => setPeriodo(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="button" variant="outline" onClick={() => setPeriodo(periodoAtual())}>Mês atual</Button>
          <NovoAtendimentoDialog lotado={patio.length >= 5} />
        </div>
      </PageHeader>

      {error && <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o painel: {(error as Error).message}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="fa-sack-dollar" label="Receita líquida" value={brl(metricas.receita)} hint={`${finalizados.length} OS finalizada(s) no mês`} />
        <Kpi icon="fa-chart-line" label="Lucro bruto" value={brl(metricas.lucro)} hint={`Custo de peças: ${brl(metricas.custo)}`} tone={metricas.lucro >= 0 ? "positive" : "negative"} />
        <Kpi icon="fa-receipt" label="Ticket médio" value={brl(metricas.ticket)} hint="Receita ÷ OS finalizadas" />
        <Kpi icon="fa-boxes-stacked" label="Itens consumidos" value={String(metricas.itens)} hint={`${baixos.length} item(ns) em estoque baixo`} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="fa-car-side" label="Carros no pátio" value={`${patio.length}/5`} hint={patio.length >= 5 ? "Pátio lotado" : `${5 - patio.length} vaga(s) livre(s)`} />
        <Kpi icon="fa-clipboard-check" label="Aguardando conferência" value={String(pendencias.length)} hint="Operação atual" />
        <Kpi icon="fa-rotate" label="Retornos do mês" value={String(retornos.length)} hint={`${vencidos} vencido(s)`} />
        <Kpi icon="fa-tags" label="Faturamento bruto" value={brl(metricas.bruto)} hint={`Descontos: ${brl(metricas.bruto - metricas.receita)}`} />
      </div>

      {isLoading ? <p className="mb-6 text-sm text-muted-foreground">Carregando indicadores do período...</p> : null}

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <ChartCard title="Receita, custo e lucro por dia" subtitle="Valores das OS finalizadas no mês">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metricas.porDia} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => brl(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="receita" name="Receita" stroke="#0ea5e9" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="custo" name="Custo" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#22c55e" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Formas de pagamento" subtitle="Participação na receita do período">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={metricas.porPagamento} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={94} paddingAngle={3}>
                {metricas.porPagamento.map((item, index) => <Cell key={item.nome} fill={CORES[index % CORES.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => brl(Number(value))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Faturamento por serviço" subtitle="Os oito serviços com maior receita">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={metricas.porServico} layout="vertical" margin={{ top: 4, right: 18, left: 18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis type="number" tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} />
              <YAxis type="category" dataKey="nome" width={115} tickLine={false} />
              <Tooltip formatter={(value) => brl(Number(value))} />
              <Bar dataKey="valor" name="Receita" fill="#f97316" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Faturamento por mecânico" subtitle="Serviços atribuídos no período">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={metricas.porMecanico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="nome" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(value) => `R$ ${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => brl(Number(value))} />
              <Bar dataKey="valor" name="Receita" fill="#0ea5e9" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="card-surface mb-6 border-primary/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold uppercase">Aguardando conferência do gerente</h2>
            <p className="text-sm text-muted-foreground">{pendencias.length === 0 ? "Nenhum atendimento aguardando conferência." : `${pendencias.length} atendimento(s) pronto(s) para revisar.`}</p>
          </div>
          <Badge variant={pendencias.length > 0 ? "destructive" : "secondary"}>{pendencias.length}</Badge>
        </div>
        <div className="space-y-2">
          {pendencias.map((a) => {
            const servicosPendentes = a.atendimento_servicos ?? [];
            const mecanicosDaOs = [...new Set(servicosPendentes.map((s) => s.mecanico_id).filter(Boolean))].map((id) => mecanicoNome.get(id)).filter(Boolean).join(", ");
            return <Link key={a.id} to="/atendimento/$id" params={{ id: a.id }} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 p-3 hover:bg-muted/50"><div><p className="font-display font-bold tracking-wider">OS #{a.numero} · {a.placa}</p><p className="text-xs text-muted-foreground">{a.cliente_nome} · {a.modelo ?? "veículo"} {mecanicosDaOs ? `· ${mecanicosDaOs}` : ""}</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{dt(a.pronto_at ?? a.entrada_at)}</span><Badge variant="outline">Conferir atendimento</Badge></div></Link>;
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold uppercase">No pátio agora</h2><Link to="/patio" className="text-sm text-primary hover:underline">Ver tudo</Link></div>
          <div className="space-y-2">{patio.map((c) => <Link key={c.id} to="/atendimento/$id" params={{ id: c.id }} className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50"><div><p className="font-display font-bold tracking-wider">{c.placa}</p><p className="text-xs text-muted-foreground">{c.cliente_nome} · {c.modelo ?? "veículo"}</p></div><span className="num text-xs text-muted-foreground">{dt(c.entrada_at)}</span></Link>)}{patio.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum carro no pátio.</p>}</div>
        </section>

        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold uppercase">Próximos retornos</h2><Link to="/notificacoes" className="text-sm text-primary hover:underline">Ver tudo</Link></div>
          <div className="space-y-2">{retornos.map((r) => { const dias = diasEntre(r.vencimento); return <div key={r.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="font-medium">{r.cliente_nome}</p><p className="text-xs text-muted-foreground">{r.servico} · {r.veiculo}</p></div><Badge variant={dias <= 0 ? "destructive" : "secondary"}>{dias <= 0 ? "Vencido" : d(r.vencimento)}</Badge></div>; })}{retornos.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum retorno pendente no período.</p>}</div>
        </section>
      </div>

      {baixos.length > 0 && <section className="card-surface mt-6 p-5"><h2 className="mb-3 font-display text-xl font-bold uppercase">Estoque baixo</h2><div className="flex flex-wrap gap-2">{baixos.map((p) => <Badge key={p.id} variant="destructive">{p.nome} ({Number(p.estoque)})</Badge>)}</div></section>}
    </AppShell>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="card-surface p-5"><div className="mb-3"><h2 className="font-display text-xl font-bold uppercase">{title}</h2><p className="text-sm text-muted-foreground">{subtitle}</p></div>{children}</section>;
}

function Kpi({ icon, label, value, hint, tone = "default" }: { icon: string; label: string; value: string; hint: string; tone?: "default" | "positive" | "negative" }) {
  return <div className={`card-surface p-5 ${tone === "positive" ? "border-emerald-500/30" : tone === "negative" ? "border-destructive/30" : ""}`}><p className="text-sm text-muted-foreground"><i className={`fa-solid ${icon} mr-2 text-primary`} />{label}</p><p className="num mt-1 font-display text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
}
