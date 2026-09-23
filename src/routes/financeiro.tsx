import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { supabase } from "@/integrations/supabase/client";
import { brl, FORMAS_PAGAMENTO } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";

export const Route = createFileRoute("/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro | DK Auto Center" }] }),
  component: Financeiro,
});

type FormState = {
  descricao: string;
  categoria_id: string;
  tipo: "fixo" | "variavel";
  fornecedor: string;
  competencia: string;
  data_vencimento: string;
  valor_total: string;
  recorrente: "nao" | "sim";
  parcelas: string;
  observacoes: string;
};

const hoje = new Date();
const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
const primeiroDia = `${mesAtual}-01`;
const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
const vencimentoAtual = `${mesAtual}-${String(ultimoDia).padStart(2, "0")}`;

const formInicial: FormState = {
  descricao: "",
  categoria_id: "",
  tipo: "variavel",
  fornecedor: "",
  competencia: primeiroDia,
  data_vencimento: vencimentoAtual,
  valor_total: "",
  recorrente: "nao",
  parcelas: "1",
  observacoes: "",
};

function Financeiro() {
  const { role } = useAuth();
  const gerente = isGerente(role);
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual);
  const [form, setForm] = useState<FormState>(formInicial);
  const [formasPagamento, setFormasPagamento] = useState<Record<string, string>>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [percentualMaoObra, setPercentualMaoObra] = useState("0");

  const { data: categorias = [], isLoading: carregandoCategorias } = useQuery({
    queryKey: ["financeiro-categorias"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase.from("financeiro_categorias").select("id, nome, tipo").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: gastos = [], isLoading: carregandoGastos } = useQuery({
    queryKey: ["financeiro-gastos", mes],
    enabled: gerente,
    queryFn: async () => {
      const inicio = `${mes}-01`;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10);
      const { error: recorrenciaError } = await supabase.rpc("gerar_despesas_recorrentes", { _competencia: inicio });
      if (recorrenciaError) throw recorrenciaError;
      const { error: alertaError } = await supabase.rpc("atualizar_alertas_financeiros", { _hoje: new Date().toISOString().slice(0, 10), _antecedencia: 3 });
      if (alertaError) throw alertaError;
      const { data, error } = await supabase
        .from("despesas_financeiras")
        .select("id, descricao, categoria_id, tipo, fornecedor, competencia, data_vencimento, valor_total, status, recorrente, observacoes, categorias:financeiro_categorias(nome), parcelas:despesa_parcelas(id, numero, valor, data_vencimento, data_pagamento, valor_pago, forma_pagamento, status)")
        .is("deleted_at", null)
        .gte("competencia", inicio)
        .lte("competencia", fim)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: osFinalizadas = [] } = useQuery({
    queryKey: ["financeiro-os-finalizadas", mes],
    enabled: gerente,
    queryFn: async () => {
      const inicio = `${mes}-01T00:00:00`;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).toISOString();
      const { data, error } = await supabase.from("atendimentos").select("id, total, desconto, finalizado_at").eq("status", "finalizado").is("deleted_at", null).gte("finalizado_at", inicio).lt("finalizado_at", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: caixaMovimentos = [] } = useQuery({
    queryKey: ["financeiro-caixa", mes],
    enabled: gerente,
    queryFn: async () => {
      const inicio = `${mes}-01T00:00:00`;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).toISOString();
      const { data, error } = await supabase.from("caixa_movimentos").select("tipo, valor, created_at").gte("created_at", inicio).lt("created_at", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movimentosCmv = [] } = useQuery({
    queryKey: ["financeiro-cmv", mes],
    enabled: gerente,
    queryFn: async () => {
      const inicio = `${mes}-01T00:00:00`;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).toISOString();
      const { data, error } = await supabase
        .from("atendimento_pecas_cmv")
        .select("tipo, custo_total, criado_em, atendimento_id")
        .gte("criado_em", inicio)
        .lt("criado_em", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: parametrosMaoObra } = useQuery({
    queryKey: ["financeiro-parametros-mao-obra"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase.from("financeiro_parametros").select("*").eq("id", true).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: custosMaoObra = [] } = useQuery({
    queryKey: ["financeiro-custos-mao-obra", mes],
    enabled: gerente,
    queryFn: async () => {
      const inicio = `${mes}-01T00:00:00`;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).toISOString();
      const { data, error } = await supabase
        .from("atendimento_mao_obra_custos")
        .select("tipo, custo_total, criado_em, atendimento_id")
        .gte("criado_em", inicio)
        .lt("criado_em", fim);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (parametrosMaoObra) setPercentualMaoObra(String(parametrosMaoObra.custo_mao_obra_percentual));
  }, [parametrosMaoObra]);

  const salvarPercentualMaoObra = useMutation({
    mutationFn: async () => {
      const percentual = Math.round(Number(percentualMaoObra.replace(",", ".")) * 100) / 100;
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        throw new Error("Informe um percentual entre 0 e 100.");
      }
      const { error } = await supabase.rpc("salvar_percentual_custo_mao_obra", { _percentual: percentual });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Custo de mão de obra atualizado para as próximas OS.");
      void qc.invalidateQueries({ queryKey: ["financeiro-parametros-mao-obra"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = Math.round(Number(form.valor_total.replace(",", ".")) * 100) / 100;
      const parcelas = Math.max(Number.parseInt(form.parcelas, 10) || 1, 1);
      if (!form.descricao.trim()) throw new Error("Informe a descrição do gasto.");
      if (!Number.isFinite(valor) || valor <= 0) throw new Error("O valor precisa ser maior que R$ 0,00.");
      if (!form.categoria_id) throw new Error("Escolha uma categoria.");
      if (editandoId) {
        const { error } = await supabase.rpc("editar_despesa_financeira", {
          _despesa_id: editandoId,
          _descricao: form.descricao.trim(),
          _categoria_id: form.categoria_id,
          _tipo: form.tipo,
          _fornecedor: form.fornecedor.trim(),
          _competencia: form.competencia,
          _data_vencimento: form.data_vencimento,
          _valor_total: valor,
          _recorrente: form.recorrente === "sim",
          _observacoes: form.observacoes.trim(),
        });
        if (error) throw error;
        return;
      }
      const { data: despesa, error } = await supabase.from("despesas_financeiras").insert({
        descricao: form.descricao.trim(),
        categoria_id: form.categoria_id,
        tipo: form.tipo,
        fornecedor: form.fornecedor.trim() || null,
        competencia: form.competencia,
        data_vencimento: form.data_vencimento,
        valor_total: valor,
        recorrente: form.recorrente === "sim",
        recorrencia_meses: 1,
        observacoes: form.observacoes.trim() || null,
      }).select("id").single();
      if (error) throw error;
      const base = new Date(`${form.data_vencimento}T12:00:00`);
      const valorBase = Math.floor((valor / parcelas) * 100) / 100;
      const resto = Math.round((valor - valorBase * parcelas) * 100) / 100;
      const linhas = Array.from({ length: parcelas }, (_, i) => {
        const venc = new Date(base);
        venc.setMonth(venc.getMonth() + i);
        return {
          despesa_id: despesa.id,
          numero: i + 1,
          valor: Math.round((valorBase + (i === parcelas - 1 ? resto : 0)) * 100) / 100,
          data_vencimento: venc.toISOString().slice(0, 10),
        };
      });
      const { error: parcelaError } = await supabase.from("despesa_parcelas").insert(linhas);
      if (parcelaError) throw parcelaError;
    },
    onSuccess: () => {
      toast.success(editandoId ? "Gasto atualizado com sucesso" : "Gasto cadastrado com sucesso");
      setEditandoId(null);
      setForm({ ...formInicial, competencia: `${mes}-01`, data_vencimento: vencimentoAtualFor(mes) });
      void qc.invalidateQueries({ queryKey: ["financeiro-gastos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pagarParcela = useMutation({
    mutationFn: async ({ parcelaId, forma }: { parcelaId: string; forma: string }) => {
      const { error } = await supabase.rpc("pagar_despesa_parcela", {
        _parcela_id: parcelaId,
        _forma_pagamento: forma,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parcela paga e saída lançada no Caixa");
      void qc.invalidateQueries({ queryKey: ["financeiro-gastos"] });
      void qc.invalidateQueries({ queryKey: ["financeiro-caixa"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelarDespesa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancelar_despesa_financeira", { _despesa_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gasto cancelado; o histórico foi preservado");
      void qc.invalidateQueries({ queryKey: ["financeiro-gastos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const excluirDespesa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("excluir_despesa_financeira", { _despesa_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gasto removido da visão ativa; o histórico foi preservado");
      void qc.invalidateQueries({ queryKey: ["financeiro-gastos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const iniciarEdicao = (gasto: (typeof gastos)[number]) => {
    setEditandoId(gasto.id);
    setForm({
      descricao: gasto.descricao,
      categoria_id: gasto.categoria_id ?? "",
      tipo: gasto.tipo as FormState["tipo"],
      fornecedor: gasto.fornecedor ?? "",
      competencia: gasto.competencia,
      data_vencimento: gasto.data_vencimento,
      valor_total: String(gasto.valor_total),
      recorrente: gasto.recorrente ? "sim" : "nao",
      parcelas: String(gasto.parcelas?.length || 1),
      observacoes: gasto.observacoes ?? "",
    });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm({ ...formInicial, competencia: `${mes}-01`, data_vencimento: vencimentoAtualFor(mes) });
  };

  const receitaBruta = osFinalizadas.reduce((s, os) => s + Number(os.total || 0) + Number(os.desconto || 0), 0);
  const descontos = osFinalizadas.reduce((s, os) => s + Number(os.desconto || 0), 0);
  const receitaLiquida = osFinalizadas.reduce((s, os) => s + Number(os.total || 0), 0);
  const gastosFixos = gastos.filter((g) => g.tipo === "fixo" && g.status !== "cancelado").reduce((s, g) => s + Number(g.valor_total || 0), 0);
  const gastosVariaveis = gastos.filter((g) => g.tipo === "variavel" && g.status !== "cancelado").reduce((s, g) => s + Number(g.valor_total || 0), 0);
  const entradasCaixa = caixaMovimentos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.valor || 0), 0);
  const saidasCaixa = caixaMovimentos.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.valor || 0), 0);
  const resultadoOperacional = receitaLiquida - gastosFixos - gastosVariaveis;
  const cmv = movimentosCmv.reduce(
    (s, movimento) => s + (movimento.tipo === "consumo" ? 1 : -1) * Number(movimento.custo_total || 0),
    0,
  );
  const resultadoAposCmv = resultadoOperacional - cmv;
  const custoMaoObra = custosMaoObra.reduce(
    (s, movimento) => s + (movimento.tipo === "consumo" ? 1 : -1) * Number(movimento.custo_total || 0),
    0,
  );
  const resultadoAposCustosDiretos = resultadoAposCmv - custoMaoObra;
  const pendentes = gastos.filter((g) => g.status === "pendente" || g.status === "atrasado").reduce((s, g) => s + Number(g.valor_total || 0), 0);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const limiteAviso = new Date();
  limiteAviso.setDate(limiteAviso.getDate() + 3);
  const limiteAvisoIso = limiteAviso.toISOString().slice(0, 10);
  const parcelasAtrasadas = gastos.flatMap((g) => (g.parcelas ?? []).filter((p) => p.status === "atrasado"));
  const parcelasProximas = gastos.flatMap((g) => (g.parcelas ?? []).filter((p) => p.status === "pendente" && p.data_vencimento >= hojeIso && p.data_vencimento <= limiteAvisoIso));

  const resumo = useMemo(() => [
    ["Receita líquida", receitaLiquida, "text-success"],
    ["Gastos fixos", gastosFixos, "text-destructive"],
    ["Gastos variáveis", gastosVariaveis, "text-destructive"],
    ["Resultado operacional", resultadoOperacional, resultadoOperacional >= 0 ? "text-success" : "text-destructive"],
    ["CMV de peças", cmv, "text-warning"],
    ["Custo de mão de obra", custoMaoObra, "text-warning"],
    ["Resultado após custos diretos", resultadoAposCustosDiretos, resultadoAposCustosDiretos >= 0 ? "text-success" : "text-destructive"],
  ] as const, [receitaLiquida, gastosFixos, gastosVariaveis, resultadoOperacional, cmv, custoMaoObra, resultadoAposCustosDiretos]);

  if (!gerente) return <AppShell><PageHeader title="Financeiro" subtitle="Acesso exclusivo para o gerente" /></AppShell>;

  return (
    <AppShell>
      <PageHeader title="Financeiro" subtitle="Controle mensal de receitas, gastos fixos e variáveis">
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual)} className="num w-44" aria-label="Mês de análise" />
      </PageHeader>
      <div className="card-surface mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <Label>Percentual de custo da mão de obra</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Aplicado sobre a mão de obra cobrada nas próximas OS finalizadas. O percentual usado fica congelado no histórico.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="percentual-custo-mao-obra">Percentual</Label>
            <Input id="percentual-custo-mao-obra" type="number" min="0" max="100" step="0.01" className="num w-28" value={percentualMaoObra} onChange={(e) => setPercentualMaoObra(e.target.value)} />
          </div>
          <span className="pb-2">%</span>
          <Button onClick={() => salvarPercentualMaoObra.mutate()} disabled={salvarPercentualMaoObra.isPending}>
            {salvarPercentualMaoObra.isPending ? "Salvando..." : "Salvar custo"}
          </Button>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumo.map(([label, value, tone]) => <Kpi key={label} label={label} value={brl(value)} tone={tone} />)}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Receita bruta" value={brl(receitaBruta)} />
        <Kpi label="Descontos" value={brl(descontos)} tone="text-warning" />
        <Kpi label="Entradas no caixa" value={brl(entradasCaixa)} tone="text-success" />
        <Kpi label="Saídas no caixa" value={brl(saidasCaixa)} tone="text-destructive" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Kpi label="Contas atrasadas" value={brl(parcelasAtrasadas.reduce((s, p) => s + Number(p.valor || 0), 0))} tone="text-destructive" />
        <Kpi label="Vencem em até 3 dias" value={brl(parcelasProximas.reduce((s, p) => s + Number(p.valor || 0), 0))} tone="text-warning" />
      </div>
      {(parcelasAtrasadas.length > 0 || parcelasProximas.length > 0) && <div className="mb-6 grid gap-4 md:grid-cols-2">
        {parcelasAtrasadas.length > 0 && <div className="card-surface border-destructive/30 bg-destructive/5 p-4"><h2 className="font-display font-bold uppercase text-destructive">Contas atrasadas</h2><ul className="mt-2 space-y-1 text-sm">{parcelasAtrasadas.slice(0, 5).map((p) => <li key={p.id}>Parcela {p.numero} · {brl(p.valor)} · vencida em {p.data_vencimento}</li>)}</ul></div>}
        {parcelasProximas.length > 0 && <div className="card-surface border-warning/30 bg-warning/5 p-4"><h2 className="font-display font-bold uppercase text-warning">Próximos vencimentos</h2><ul className="mt-2 space-y-1 text-sm">{parcelasProximas.slice(0, 5).map((p) => <li key={p.id}>Parcela {p.numero} · {brl(p.valor)} · vence em {p.data_vencimento}</li>)}</ul></div>}
      </div>}
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="card-surface space-y-4 p-5">
          <div><h2 className="font-display text-xl font-bold uppercase">{editandoId ? "Editar gasto" : "Cadastrar gasto"}</h2><p className="text-sm text-muted-foreground">{editandoId ? "Altere apenas uma conta ainda não paga." : "Registre todos os gastos fixos e variáveis do mês."}</p></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: conta de energia" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(v: "fixo" | "variavel") => setForm({ ...form, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixo">Fixo</SelectItem><SelectItem value="variavel">Variável</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Categoria</Label><Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}><SelectTrigger><SelectValue placeholder={carregandoCategorias ? "Carregando..." : "Escolha"} /></SelectTrigger><SelectContent>{categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label>Fornecedor ou favorecido</Label><Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Competência</Label><Input type="date" value={form.competencia} onChange={(e) => setForm({ ...form, competencia: e.target.value })} /></div><div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Valor total</Label><Input type="number" min="0.01" step="0.01" className="num" value={form.valor_total} onChange={(e) => setForm({ ...form, valor_total: e.target.value })} placeholder="0,00" /></div><div className="space-y-1.5"><Label>Parcelas{editandoId && " (mantidas)"}</Label><Input type="number" min="1" step="1" className="num" value={form.parcelas} onChange={(e) => setForm({ ...form, parcelas: e.target.value })} disabled={Boolean(editandoId)} /></div></div>
          <div className="space-y-1.5"><Label>Recorrente</Label><Select value={form.recorrente} onValueChange={(v: "nao" | "sim") => setForm({ ...form, recorrente: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim, lembrar para os próximos meses</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Observação</Label><Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Opcional" /></div>
          <div className="flex gap-2"><Button className="flex-1" onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : editandoId ? "Salvar alterações" : "Cadastrar gasto"}</Button>{editandoId && <Button variant="outline" onClick={cancelarEdicao} disabled={salvar.isPending}>Cancelar</Button>}</div>
        </div>
        <div className="space-y-6">
          <div className="card-surface grid gap-4 p-5 sm:grid-cols-2"><Kpi label="Contas pendentes" value={brl(pendentes)} tone="text-warning" /><Kpi label="Gastos cadastrados" value={brl(gastosFixos + gastosVariaveis)} tone="text-destructive" /></div>
          <div className="card-surface overflow-x-auto">
            <div className="border-b p-5"><h2 className="font-display text-xl font-bold uppercase">Gastos do mês</h2><p className="text-sm text-muted-foreground">Competência {mes} · pagamento exige Caixa aberto</p></div>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">Vencimento</th><th className="p-3">Descrição</th><th className="p-3">Tipo</th><th className="p-3">Categoria</th><th className="p-3 text-right">Valor</th><th className="p-3">Parcelas e pagamento</th></tr></thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-b align-top last:border-0">
                    <td className="num p-3">{g.data_vencimento}</td>
                    <td className="p-3"><strong>{g.descricao}</strong>{g.fornecedor && <span className="block text-xs text-muted-foreground">{g.fornecedor}</span>}{(() => { const bloqueado = g.status === "pago" || g.status === "cancelado" || (g.parcelas ?? []).some((parcela) => parcela.status === "pago"); return <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => iniciarEdicao(g)} disabled={bloqueado}>Editar</Button><ConfirmActionDialog trigger={<Button size="sm" variant="ghost" disabled={bloqueado || cancelarDespesa.isPending}>Cancelar</Button>} title="Cancelar gasto" description="O gasto ficará cancelado e suas parcelas não serão apagadas do histórico." confirmLabel="Cancelar gasto" onConfirm={() => cancelarDespesa.mutateAsync(g.id)} /><ConfirmActionDialog trigger={<Button size="sm" variant="ghost" className="text-destructive" disabled={bloqueado || excluirDespesa.isPending}>Excluir</Button>} title="Excluir gasto" description="O gasto sairá da visão ativa por exclusão lógica. O registro histórico permanecerá preservado." confirmLabel="Excluir gasto" onConfirm={() => excluirDespesa.mutateAsync(g.id)} /></div>; })()}</td>
                    <td className="p-3">{g.tipo === "fixo" ? "Fixo" : "Variável"}</td>
                    <td className="p-3">{Array.isArray(g.categorias) ? g.categorias[0]?.nome : g.categorias?.nome ?? "—"}</td>
                    <td className="num p-3 text-right font-semibold">{brl(g.valor_total)}</td>
                    <td className="min-w-[280px] space-y-2 p-3">
                      {(g.parcelas ?? []).sort((a, b) => a.numero - b.numero).map((parcela) => {
                        const pago = parcela.status === "pago";
                        const forma = formasPagamento[parcela.id] ?? parcela.forma_pagamento ?? "Dinheiro";
                        return <div key={parcela.id} className="rounded-md border p-2">
                          <div className="flex items-center justify-between gap-2"><span>Parcela {parcela.numero} · {brl(parcela.valor)}</span><span className={pago ? "text-success" : "text-warning"}>{pago ? "paga" : parcela.status}</span></div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Venc. {parcela.data_vencimento}</span>
                            {pago ? <span className="text-muted-foreground">{parcela.forma_pagamento} · {parcela.data_pagamento?.slice(0, 10)}</span> : <><Select value={forma} onValueChange={(v) => setFormasPagamento((atual) => ({ ...atual, [parcela.id]: v }))}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{FORMAS_PAGAMENTO.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><ConfirmActionDialog trigger={<Button size="sm" disabled={pagarParcela.isPending}>Pagar</Button>} title="Confirmar pagamento" description={<>Será lançada uma saída de <strong className="text-foreground">{brl(parcela.valor)}</strong> no Caixa aberto, vinculada à despesa <strong className="text-foreground">{g.descricao}</strong>.</>} confirmLabel="Pagar parcela" onConfirm={() => pagarParcela.mutateAsync({ parcelaId: parcela.id, forma })} /></>}
                          </div>
                        </div>;
                      })}
                    </td>
                  </tr>
                ))}
                {!carregandoGastos && gastos.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum gasto cadastrado para este mês.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function vencimentoAtualFor(mes: string) { const [ano, mesNumero] = mes.split("-").map(Number); return `${mes}-${String(new Date(ano, mesNumero, 0).getDate()).padStart(2, "0")}`; }
function Kpi({ label, value, tone = "text-primary" }: { label: string; value: string; tone?: string }) { return <div className="card-surface p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`num mt-1 font-display text-2xl font-bold ${tone}`}>{value}</p></div>; }
