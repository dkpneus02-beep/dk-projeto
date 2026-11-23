import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NovoAtendimentoDialog } from "@/components/NovoAtendimentoDialog";
import { ConfirmarRecebimentoDialog, type FormaPagamentoConfirmada } from "@/components/ConfirmarRecebimentoDialog";
import { Button } from "@/components/ui/button";
import { brl, dt, statusLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";

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
      const [abertos, aguardandoPagamento] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("*, atendimento_servicos(id, nome, status, valor), pagamentos(pago)")
          .eq("status", "aberto")
          .is("deleted_at", null)
          .order("entrada_at", { ascending: true }),
        supabase
          .from("atendimentos")
          .select("*, atendimento_servicos(id, nome, status, valor), pagamentos!inner(pago)")
          .eq("status", "finalizado")
          .eq("pagamentos.pago", false)
          .is("deleted_at", null)
          .order("entrada_at", { ascending: true }),
      ]);
      if (abertos.error) throw abertos.error;
      if (aguardandoPagamento.error) throw aguardandoPagamento.error;
      return [...(abertos.data ?? []), ...(aguardandoPagamento.data ?? [])].sort(
        (a, b) => new Date(a.entrada_at).getTime() - new Date(b.entrada_at).getTime(),
      );
    },
  });
}

function Patio() {
  const { role } = useAuth();
  const gerente = isGerente(role);
  const qc = useQueryClient();
  const { data, isLoading } = usePatio();
  const carros = data ?? [];
  const marcarAtendimentoPago = useMutation({
    mutationFn: async ({ atendimentoId, pagamentos }: { atendimentoId: string; pagamentos: FormaPagamentoConfirmada[] }) => {
      const { error } = await supabase.rpc("marcar_atendimento_pago_com_formas", {
        _atendimento_id: atendimentoId,
        _formas: pagamentos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado no caixa; a OS foi liberada para o Histórico.");
      void qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
            style={{ width: `${Math.min((carros.length / 5) * 100, 100)}%` }}
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
          const totalServicos = servicos.reduce((sum, s) => sum + Number(s.valor), 0);
          const emExec = servicos.some((s) => s.status === "em_execucao");
          const pagamentosPendentes = (c.pagamentos ?? []).some((p) => p.pago === false);
          const aguardandoPagamento = c.status === "finalizado" && pagamentosPendentes;
          return (
            <div key={c.id} className="card-surface p-5 transition-shadow hover:shadow-md">
              <Link
                to="/atendimento/$id"
                params={{ id: c.id }}
                className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-bold tracking-wider">{c.placa}</p>
                    <p className="break-words text-sm text-muted-foreground">
                      {[c.fabricante, c.modelo, c.cor].filter(Boolean).join(" · ") || "Veículo"}
                    </p>
                  </div>
                  <Badge
                    variant={aguardandoPagamento ? "outline" : emExec ? "default" : "secondary"}
                  >
                    {aguardandoPagamento
                      ? "Aguardando pagamento"
                      : emExec
                        ? statusLabel["em_execucao"]
                        : "Aguardando"}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-1 text-sm">
                  <Row label="Cliente" value={c.cliente_nome ?? "—"} />
                  <Row label="Entrada" value={dt(c.entrada_at)} />
                  <Row label="Serviços" value={`${concluidos}/${servicos.length} concluídos`} />
                  <Row
                    label="Total"
                    value={brl(aguardandoPagamento ? c.total : totalServicos)}
                    strong
                  />
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">OS #{c.numero}</p>
                {aguardandoPagamento && (
                  <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-900">
                    Serviço concluído. O veículo continua no pátio aguardando o pagamento.
                  </p>
                )}
              </Link>
              {aguardandoPagamento && gerente && (
                <ConfirmarRecebimentoDialog
                  atendimentoId={c.id}
                  total={Number(c.total)}
                  trigger={
                    <Button className="mt-4 w-full" disabled={marcarAtendimentoPago.isPending}>
                      <i className="fa-solid fa-money-bill-transfer" /> Revisar forma e confirmar pagamento
                    </Button>
                  }
                  disabled={marcarAtendimentoPago.isPending}
                  onConfirm={(pagamentos) =>
                    marcarAtendimentoPago.mutateAsync({ atendimentoId: c.id, pagamentos })
                  }
                />
              )}
            </div>
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
