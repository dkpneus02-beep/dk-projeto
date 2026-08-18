import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, dt, FORMAS_PAGAMENTO, matches } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

export const Route = createFileRoute("/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa | DK Auto Center" },
      { name: "description", content: "Abertura, entradas, saídas e fechamento do caixa diário." },
      { property: "og:title", content: "Caixa | DK Auto Center" },
      { property: "og:description", content: "Controle financeiro diário da oficina." },
    ],
  }),
  component: Caixa,
});

function Caixa() {
  const qc = useQueryClient();
  const { nome, role } = useAuth();
  const gerente = isGerente(role);
  const [valorInicial, setValorInicial] = useState(0);
  const [buscaMov, setBuscaMov] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [mov, setMov] = useState({ tipo: "saida", descricao: "", valor: 0, forma: "Dinheiro" });

  const { data: sessao } = useQuery({
    queryKey: ["caixa-sessao"],
    queryFn: async () => {
      const { data } = await supabase
        .from("caixa_sessoes")
        .select("*")
        .eq("aberto", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: movimentos } = useQuery({
    queryKey: ["caixa-movs", sessao?.id],
    enabled: !!sessao?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("caixa_movimentos")
        .select("*")
        .eq("sessao_id", sessao!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const entradas = (movimentos ?? [])
    .filter((m) => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor), 0);
  const saidas = (movimentos ?? [])
    .filter((m) => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor), 0);
  const saldo = Number(sessao?.valor_inicial ?? 0) + entradas - saidas;
  const movimentosVisiveis = useMemo(
    () =>
      (movimentos ?? []).filter(
        (m) =>
          (filtroTipo === "todos" || m.tipo === filtroTipo) &&
          matches(buscaMov, [m.descricao, m.forma, m.responsavel]),
      ),
    [movimentos, buscaMov, filtroTipo],
  );
  const totaisPorForma = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of movimentos ?? []) {
      const forma = m.forma || "Não informada";
      mapa.set(forma, (mapa.get(forma) ?? 0) + (m.tipo === "entrada" ? Number(m.valor) : -Number(m.valor)));
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [movimentos]);

  const abrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("caixa_sessoes")
        .insert({ responsavel: nome || "Operador", valor_inicial: valorInicial });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa aberto");
      void qc.invalidateQueries({ queryKey: ["caixa-sessao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("caixa_sessoes")
        .update({ aberto: false, fechado_at: new Date().toISOString() })
        .eq("id", sessao!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Caixa fechado");
      void qc.invalidateQueries();
    },
  });

  const estornar = useMutation({
    mutationFn: async (m: NonNullable<typeof movimentos>[number]) => {
      const { error } = await supabase.from("caixa_movimentos").insert({
        sessao_id: sessao!.id,
        tipo: m.tipo === "entrada" ? "saida" : "entrada",
        descricao: `Estorno: ${m.descricao}`,
        valor: Number(m.valor),
        forma: m.forma,
        responsavel: nome,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estorno lançado como novo movimento; o histórico original foi preservado.");
      void qc.invalidateQueries({ queryKey: ["caixa-movs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lancar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("caixa_movimentos").insert({
        sessao_id: sessao!.id,
        tipo: mov.tipo,
        descricao: mov.descricao,
        valor: mov.valor,
        forma: mov.forma,
        responsavel: nome,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMov({ tipo: "saida", descricao: "", valor: 0, forma: "Dinheiro" });
      void qc.invalidateQueries({ queryKey: ["caixa-movs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!sessao) {
    return (
      <AppShell>
        <PageHeader title="Caixa" subtitle="Nenhum caixa aberto no momento" />
        <div className="card-surface max-w-md space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Valor inicial em caixa</Label>
            <Input
              type="number"
              step="0.01"
              className="num"
              value={valorInicial}
              onChange={(e) => setValorInicial(Number(e.target.value) || 0)}
            />
          </div>
          <ConfirmActionDialog
            trigger={
              <Button className="w-full" disabled={abrir.isPending}>
                <i className="fa-solid fa-cash-register" /> Abrir caixa
              </Button>
            }
            title="Confirmar abertura de caixa"
            description={
              <>
                Você está prestes a abrir o caixa com valor inicial de{" "}
                <strong className="text-foreground">{brl(valorInicial)}</strong>, em nome de{" "}
                <strong className="text-foreground">{nome || "Operador"}</strong>. Confira o valor
                antes de confirmar.
              </>
            }
            confirmLabel="Abrir caixa"
            onConfirm={() => abrir.mutateAsync()}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Caixa"
        subtitle={`Aberto por ${sessao.responsavel} · ${dt(sessao.created_at)}`}
      >
        <ConfirmActionDialog
          trigger={
            <Button variant="outline">
              <i className="fa-solid fa-lock" /> Fechar caixa
            </Button>
          }
          title="Confirmar fechamento de caixa"
          description={
            <>
              Saldo final calculado: <strong className="text-foreground">{brl(saldo)}</strong>{" "}
              (inicial {brl(sessao.valor_inicial)} + entradas {brl(entradas)} − saídas {brl(saidas)}
              ). Depois de fechado, não é mais possível lançar movimentos nesta sessão.
            </>
          }
          confirmLabel="Fechar caixa"
          destructive
          onConfirm={() => fechar.mutateAsync()}
        />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Kpi label="Valor inicial" value={brl(sessao.valor_inicial)} icon="fa-wallet" />
        <Kpi label="Entradas" value={brl(entradas)} icon="fa-arrow-down" tone="text-success" />
        <Kpi label="Saídas" value={brl(saidas)} icon="fa-arrow-up" tone="text-destructive" />
        <Kpi label="Saldo atual" value={brl(saldo)} icon="fa-scale-balanced" strong />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card-surface space-y-3 p-5">
          <h2 className="font-display text-xl font-bold uppercase">Novo lançamento</h2>
          <p className="text-xs text-muted-foreground">Registre entradas e saídas somente no caixa aberto. Para corrigir um lançamento, use estorno; não apagamos o histórico.</p>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={mov.tipo} onValueChange={(v) => setMov({ ...mov, tipo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={mov.descricao}
              onChange={(e) => setMov({ ...mov, descricao: e.target.value })}
              placeholder="Ex.: compra de óleo"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={mov.forma} onValueChange={(v) => setMov({ ...mov, forma: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              className="num"
              value={mov.valor}
              onChange={(e) => setMov({ ...mov, valor: Number(e.target.value) || 0 })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!mov.descricao.trim() || !mov.valor || lancar.isPending}
            onClick={() => lancar.mutate()}
          >
            Lançar
          </Button>
        </div>

        <div className="space-y-4">
          <div className="card-surface space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Input value={buscaMov} onChange={(e) => setBuscaMov(e.target.value)} placeholder="Buscar descrição, forma ou responsável..." aria-label="Buscar movimentos do caixa" />
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger aria-label="Filtrar movimentos por tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Entradas e saídas</SelectItem>
                  <SelectItem value="entrada">Somente entradas</SelectItem>
                  <SelectItem value="saida">Somente saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {totaisPorForma.map(([forma, valor]) => <Badge key={forma} variant="outline">{forma}: {brl(valor)}</Badge>)}
            </div>
          </div>
          <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Descrição</th>
                <th className="p-3">Forma</th>
                <th className="p-3 text-right">Valor</th>
                {gerente && <th className="p-3 text-right">Ação</th>}
              </tr>
            </thead>
            <tbody>
              {movimentosVisiveis.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="num p-3 text-muted-foreground">{dt(m.created_at)}</td>
                  <td className="p-3">{m.descricao}</td>
                  <td className="p-3">{m.forma ?? "—"}</td>
                  <td
                    className={`num p-3 text-right font-semibold ${m.tipo === "entrada" ? "text-success" : "text-destructive"}`}
                  >
                    {m.tipo === "entrada" ? "+" : "−"} {brl(m.valor)}
                  </td>
                  {gerente && (
                    <td className="p-3 text-right">
                      {!m.descricao.startsWith("Estorno:") && (
                        <ConfirmActionDialog
                          trigger={<Button variant="ghost" size="sm" title="Estornar movimento"><i className="fa-solid fa-rotate-left" /></Button>}
                          title="Confirmar estorno"
                          description={<>Será lançado um novo movimento inverso de <strong className="text-foreground">{brl(m.valor)}</strong>. O lançamento original continuará no histórico.</>}
                          confirmLabel="Lançar estorno"
                          destructive
                          onConfirm={() => estornar.mutateAsync(m)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {movimentosVisiveis.length === 0 && (
                <tr>
                  <td colSpan={gerente ? 5 : 4} className="p-8 text-center text-muted-foreground">
                    Nenhum movimento encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
  strong,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="card-surface p-4">
      <p className="text-sm text-muted-foreground">
        <i className={`fa-solid ${icon} mr-2 ${tone ?? "text-primary"}`} />
        {label}
      </p>
      <p className={`num mt-1 font-display font-bold ${strong ? "text-3xl" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}
