import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NovoAtendimentoDialog } from "@/components/NovoAtendimentoDialog";
import { brl, d, diasEntre, dt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel | DK Auto Center" },
      {
        name: "description",
        content:
          "Painel de gestão da DK Auto Center: pátio, faturamento do dia, retornos de clientes e estoque.",
      },
      { property: "og:title", content: "Painel | DK Auto Center" },
      {
        property: "og:description",
        content: "Gestão completa da oficina: atendimentos, caixa, estoque e garantias.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["dashboard", hoje],
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
          .select("id, total, finalizado_at")
          .eq("status", "finalizado")
          .gte("finalizado_at", `${hoje}T00:00:00`),
        supabase
          .from("notificacoes_retorno")
          .select("*")
          .eq("status", "pendente")
          .order("vencimento")
          .limit(6),
        supabase.from("pecas").select("id, nome, estoque, estoque_minimo").is("deleted_at", null),
        supabase.from("mecanicos").select("id, nome").is("deleted_at", null),
      ]);
      return {
        patio: patio.data ?? [],
        pendencias: pendencias.data ?? [],
        finalizados: finalizados.data ?? [],
        retornos: retornos.data ?? [],
        pecas: (pecas.data ?? []).filter((p) => Number(p.estoque) <= Number(p.estoque_minimo)),
        mecanicos: mecanicos.data ?? [],
      };
    },
  });

  const patio = data?.patio ?? [];
  const pendencias = data?.pendencias ?? [];
  const mecanicoNome = new Map((data?.mecanicos ?? []).map((m) => [m.id, m.nome]));
  const faturamento = (data?.finalizados ?? []).reduce((s, a) => s + Number(a.total), 0);
  const retornos = data?.retornos ?? [];
  const baixos = data?.pecas ?? [];

  return (
    <AppShell>
      <PageHeader title="Painel" subtitle="Visão geral da operação de hoje">
        <NovoAtendimentoDialog lotado={patio.length >= 5} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon="fa-car-side"
          label="Carros no pátio"
          value={`${patio.length}/5`}
          hint={patio.length >= 5 ? "Pátio lotado" : `${5 - patio.length} vagas livres`}
        />
        <Kpi
          icon="fa-sack-dollar"
          label="Faturamento do dia"
          value={brl(faturamento)}
          hint={`${(data?.finalizados ?? []).length} atendimentos finalizados`}
        />
        <Kpi
          icon="fa-bell"
          label="Retornos pendentes"
          value={String(retornos.length)}
          hint={`${retornos.filter((r) => diasEntre(r.vencimento) <= 0).length} já vencidos`}
        />
        <Kpi
          icon="fa-boxes-stacked"
          label="Estoque baixo"
          value={String(baixos.length)}
          hint="Itens no mínimo ou abaixo"
        />
      </div>

      <section className="card-surface mb-6 border-primary/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold uppercase">Aguardando conferência do gerente</h2>
            <p className="text-sm text-muted-foreground">
              {pendencias.length === 0
                ? "Nenhum atendimento aguardando conferência."
                : `${pendencias.length} atendimento${pendencias.length === 1 ? "" : "s"} pronto${pendencias.length === 1 ? "" : "s"} para revisar.`}
            </p>
          </div>
          <Badge variant={pendencias.length > 0 ? "destructive" : "secondary"}>
            {pendencias.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {pendencias.map((a) => {
            const servicosPendentes = a.atendimento_servicos ?? [];
            const mecanicosDaOs = [...new Set(servicosPendentes.map((s) => s.mecanico_id).filter(Boolean))]
              .map((id) => mecanicoNome.get(id))
              .filter(Boolean)
              .join(", ");
            return (
              <Link
                key={a.id}
                to="/atendimento/$id"
                params={{ id: a.id }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 p-3 hover:bg-muted/50"
              >
                <div>
                  <p className="font-display font-bold tracking-wider">OS #{a.numero} · {a.placa}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.cliente_nome} · {a.modelo ?? "veículo"} {mecanicosDaOs ? `· ${mecanicosDaOs}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{dt(a.pronto_at ?? a.entrada_at)}</span>
                  <Badge variant="outline">Conferir atendimento</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold uppercase">No pátio agora</h2>
            <Link to="/patio" className="text-sm text-primary hover:underline">
              Ver tudo
            </Link>
          </div>
          <div className="space-y-2">
            {patio.map((c) => (
              <Link
                key={c.id}
                to="/atendimento/$id"
                params={{ id: c.id }}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50"
              >
                <div>
                  <p className="font-display font-bold tracking-wider">{c.placa}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.cliente_nome} · {c.modelo ?? "veículo"}
                  </p>
                </div>
                <span className="num text-xs text-muted-foreground">{dt(c.entrada_at)}</span>
              </Link>
            ))}
            {patio.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum carro no pátio.
              </p>
            )}
          </div>
        </section>

        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold uppercase">Próximos retornos</h2>
            <Link to="/notificacoes" className="text-sm text-primary hover:underline">
              Ver tudo
            </Link>
          </div>
          <div className="space-y-2">
            {retornos.map((r) => {
              const dias = diasEntre(r.vencimento);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium">{r.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.servico} · {r.veiculo}
                    </p>
                  </div>
                  <Badge variant={dias <= 0 ? "destructive" : "secondary"}>
                    {dias <= 0 ? "Vencido" : d(r.vencimento)}
                  </Badge>
                </div>
              );
            })}
            {retornos.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum retorno pendente.
              </p>
            )}
          </div>
        </section>
      </div>

      {baixos.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="mb-3 font-display text-xl font-bold uppercase">Estoque baixo</h2>
          <div className="flex flex-wrap gap-2">
            {baixos.map((p) => (
              <Badge key={p.id} variant="destructive">
                {p.nome} ({Number(p.estoque)})
              </Badge>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card-surface p-5">
      <p className="text-sm text-muted-foreground">
        <i className={`fa-solid ${icon} mr-2 text-primary`} />
        {label}
      </p>
      <p className="num mt-1 font-display text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
