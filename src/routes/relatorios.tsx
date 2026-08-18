import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | DK Auto Center" },
      { name: "description", content: "Auditoria e relatórios operacionais da DK Auto Center." },
    ],
  }),
  component: Relatorios,
});

type RelatorioData = {
  atendimentos: { id: string; numero: number; total: number; finalizado_at: string | null }[];
  servicos: { atendimento_id: string; nome: string; valor: number; mecanico_id: string | null; peca_id: string | null; quantidade: number; created_at: string }[];
  mecanicos: { id: string; nome: string }[];
  pecas: { id: string; nome: string; estoque: number; estoque_minimo: number; deleted_at: string | null }[];
  retornos: { id: string; cliente_nome: string; servico: string; vencimento: string; status: string }[];
};

function Relatorios() {
  const { role } = useAuth();
  const gerente = role === "gerente";
  const hoje = new Date();
  const [inicio, setInicio] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery<RelatorioData>({
    queryKey: ["relatorios", inicio, fim],
    enabled: gerente && !!inicio && !!fim,
    queryFn: async () => {
      // O input de data é local; o banco armazena timestamptz em UTC.
      const inicioIso = new Date(`${inicio}T00:00:00`).toISOString();
      const fimIso = new Date(`${fim}T23:59:59.999`).toISOString();
      const [atendimentos, mecanicos, pecas, retornos] = await Promise.all([
        supabase
          .from("atendimentos")
          .select("id, numero, total, finalizado_at")
          .eq("status", "finalizado")
          .is("deleted_at", null)
          .gte("finalizado_at", inicioIso)
          .lte("finalizado_at", fimIso)
          .order("finalizado_at", { ascending: false })
          .limit(500),
        supabase.from("mecanicos").select("id, nome").limit(200),
        supabase
          .from("pecas")
          .select("id, nome, estoque, estoque_minimo, deleted_at")
          .is("deleted_at", null)
          .limit(500),
        supabase
          .from("notificacoes_retorno")
          .select("id, cliente_nome, servico, vencimento, status")
          .eq("status", "pendente")
          .lte("vencimento", fim)
          .order("vencimento", { ascending: true })
          .limit(200),
      ]);

      const falhaInicial = [atendimentos, mecanicos, pecas, retornos].find((resposta) => resposta.error)?.error;
      if (falhaInicial) throw falhaInicial;

      const idsFinalizados = (atendimentos.data ?? []).map((atendimento) => atendimento.id);
      const servicos = idsFinalizados.length
        ? await supabase
            .from("atendimento_servicos")
            .select("atendimento_id, nome, valor, mecanico_id, peca_id, quantidade, created_at")
            .in("atendimento_id", idsFinalizados)
            .limit(1000)
        : { data: [], error: null };
      if (servicos.error) throw servicos.error;

      return {
        atendimentos: atendimentos.data ?? [],
        servicos: servicos.data ?? [],
        mecanicos: mecanicos.data ?? [],
        pecas: pecas.data ?? [],
        retornos: retornos.data ?? [],
      } as RelatorioData;
    },
  });

  const faturamento = (data?.atendimentos ?? []).reduce((s, a) => s + Number(a.total), 0);
  const porMecanico = new Map<string, { nome: string; quantidade: number; valor: number }>();
  const porProduto = new Map<string, { nome: string; quantidade: number }>();
  const nomesMecanicos = new Map((data?.mecanicos ?? []).map((m) => [m.id, m.nome]));
  const nomesPecas = new Map((data?.pecas ?? []).map((p) => [p.id, p.nome]));

  const finalizadosIds = new Set((data?.atendimentos ?? []).map((a) => a.id));
  for (const servico of (data?.servicos ?? []).filter((item) => finalizadosIds.has(item.atendimento_id))) {
    const nomeMecanico = servico.mecanico_id ? nomesMecanicos.get(servico.mecanico_id) ?? "Mecânico removido" : "Sem responsável";
    const chave = nomeMecanico;
    const atual = porMecanico.get(chave) ?? {
      nome: nomeMecanico,
      quantidade: 0,
      valor: 0,
    };
    atual.quantidade += 1;
    atual.valor += Number(servico.valor);
    porMecanico.set(chave, atual);

    if (servico.peca_id) {
      const produto = porProduto.get(servico.peca_id) ?? {
        nome: nomesPecas.get(servico.peca_id) ?? "Produto removido",
        quantidade: 0,
      };
      produto.quantidade += Number(servico.quantidade || 1);
      porProduto.set(servico.peca_id, produto);
    }
  }

  const estoqueBaixo = (data?.pecas ?? []).filter((p) => Number(p.estoque) <= Number(p.estoque_minimo));
  const rankingMecanicos = [...porMecanico.values()].sort((a, b) => b.valor - a.valor);
  const rankingProdutos = [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade);

  return (
    <AppShell>
      <PageHeader title="Relatórios" subtitle="Auditoria e indicadores operacionais">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Início
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            Fim
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
          <Button variant="outline" onClick={() => { setInicio(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)); setFim(new Date().toISOString().slice(0, 10)); }}>
            Este mês
          </Button>
        </div>
      </PageHeader>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando relatórios...</p>}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar os relatórios: {(error as Error).message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-surface p-5"><p className="text-xs uppercase text-muted-foreground">Faturamento</p><p className="mt-2 font-display text-2xl font-bold">{brl(faturamento)}</p></div>
        <div className="card-surface p-5"><p className="text-xs uppercase text-muted-foreground">OS finalizadas</p><p className="mt-2 font-display text-2xl font-bold">{data?.atendimentos.length ?? 0}</p></div>
        <div className="card-surface p-5"><p className="text-xs uppercase text-muted-foreground">Ticket médio</p><p className="mt-2 font-display text-2xl font-bold">{brl(data?.atendimentos.length ? faturamento / data.atendimentos.length : 0)}</p></div>
        <div className="card-surface p-5"><p className="text-xs uppercase text-muted-foreground">Estoque baixo</p><p className="mt-2 font-display text-2xl font-bold text-warning">{estoqueBaixo.length}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface overflow-x-auto p-5">
          <h2 className="mb-3 font-display text-lg font-bold uppercase">Serviços por mecânico</h2>
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Mecânico</th><th className="p-2">Serviços</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>
            {rankingMecanicos.map((m) => <tr key={m.nome} className="border-b last:border-0"><td className="p-2">{m.nome}</td><td className="p-2">{m.quantidade}</td><td className="p-2 text-right">{brl(m.valor)}</td></tr>)}
            {!rankingMecanicos.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Sem serviços no período.</td></tr>}
          </tbody></table>
        </section>

        <section className="card-surface overflow-x-auto p-5">
          <h2 className="mb-3 font-display text-lg font-bold uppercase">Produtos mais usados</h2>
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Produto</th><th className="p-2 text-right">Quantidade</th></tr></thead><tbody>
            {rankingProdutos.map((p) => <tr key={p.nome} className="border-b last:border-0"><td className="p-2">{p.nome}</td><td className="p-2 text-right">{p.quantidade}</td></tr>)}
            {!rankingProdutos.length && <tr><td colSpan={2} className="p-4 text-center text-muted-foreground">Nenhum produto usado no período.</td></tr>}
          </tbody></table>
        </section>

        <section className="card-surface overflow-x-auto p-5">
          <h2 className="mb-3 font-display text-lg font-bold uppercase">Estoque baixo</h2>
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Produto</th><th className="p-2">Atual</th><th className="p-2">Mínimo</th></tr></thead><tbody>
            {estoqueBaixo.map((p) => <tr key={p.id} className="border-b last:border-0"><td className="p-2">{p.nome}</td><td className="p-2 text-warning">{p.estoque}</td><td className="p-2">{p.estoque_minimo}</td></tr>)}
            {!estoqueBaixo.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum item abaixo do mínimo.</td></tr>}
          </tbody></table>
        </section>

        <section className="card-surface overflow-x-auto p-5">
          <h2 className="mb-3 font-display text-lg font-bold uppercase">Retornos pendentes</h2>
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Cliente</th><th className="p-2">Serviço</th><th className="p-2">Vencimento</th></tr></thead><tbody>
            {(data?.retornos ?? []).map((r) => <tr key={r.id} className="border-b last:border-0"><td className="p-2">{r.cliente_nome}</td><td className="p-2">{r.servico}</td><td className="p-2">{r.vencimento}</td></tr>)}
            {!data?.retornos.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum retorno pendente até o fim do período.</td></tr>}
          </tbody></table>
        </section>
      </div>

    </AppShell>
  );
}
