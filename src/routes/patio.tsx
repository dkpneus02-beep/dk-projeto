import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NovoAtendimentoDialog } from "@/components/NovoAtendimentoDialog";
import { brl, dt, statusLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/patio")({
  head: () => ({
    meta: [
      { title: "Carros no pátio | DK Auto Center" },
      {
        name: "description",
        content: "Veículos em atendimento na oficina, serviços em andamento e valores.",
      },
      { property: "og:title", content: "Carros no pátio | DK Auto Center" },
      { property: "og:description", content: "Veículos em atendimento e serviços em andamento." },
    ],
  }),
  component: Patio,
});

export function usePatio() {
  return useQuery({
    queryKey: ["patio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, atendimento_servicos(id, nome, status, valor)")
        .eq("status", "aberto")
        .is("deleted_at", null)
        .order("entrada_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function Patio() {
  const { data, isLoading } = usePatio();
  const carros = data ?? [];

  return (
    <AppShell>
      <PageHeader title="Carros no pátio" subtitle={`Capacidade máxima: 5 veículos`}>
        <NovoAtendimentoDialog lotado={carros.length >= 5} />
      </PageHeader>

      <div className="mb-6 flex items-center gap-3">
        <span className="font-display text-4xl font-bold num">{carros.length}/5</span>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(carros.length / 5) * 100}%` }}
          />
        </div>
        {carros.length >= 5 && (
          <span className="text-sm text-primary">
            <i className="fa-solid fa-triangle-exclamation mr-1" /> Pátio lotado
          </span>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {carros.map((c) => {
          const servicos = c.atendimento_servicos ?? [];
          const concluidos = servicos.filter((s) => s.status === "concluido").length;
          const total = servicos.reduce((sum, s) => sum + Number(s.valor), 0);
          const emExec = servicos.some((s) => s.status === "em_execucao");
          return (
            <Link
              key={c.id}
              to="/atendimento/$id"
              params={{ id: c.id }}
              className="card-surface block p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-2xl font-bold tracking-wider">{c.placa}</p>
                  <p className="text-sm text-muted-foreground">
                    {[c.fabricante, c.modelo, c.cor].filter(Boolean).join(" · ") || "Veículo"}
                  </p>
                </div>
                <Badge variant={emExec ? "default" : "secondary"}>
                  {emExec ? statusLabel["em_execucao"] : "Aguardando"}
                </Badge>
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <Row label="Cliente" value={c.cliente_nome} />
                <Row label="Entrada" value={dt(c.entrada_at)} />
                <Row
                  label="Serviços"
                  value={`${concluidos}/${servicos.length} concluídos`}
                />
                <Row label="Total" value={brl(total)} strong />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">OS #{c.numero}</p>
            </Link>
          );
        })}
      </div>

      {!isLoading && carros.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          <i className="fa-solid fa-car-side mb-3 text-3xl" />
          <p>Nenhum carro no pátio agora.</p>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold num" : "num"}>{value}</dd>
    </div>
  );
}
