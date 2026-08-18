import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, d, dt, matches } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";
import { printReceipt } from "@/lib/receipt";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico | DK Auto Center" },
      {
        name: "description",
        content: "Histórico completo de atendimentos, valores e status de garantia.",
      },
      { property: "og:title", content: "Histórico | DK Auto Center" },
      { property: "og:description", content: "Atendimentos finalizados da oficina." },
    ],
  }),
  component: Historico,
});

function Historico() {
  const { role } = useAuth();
  const gerente = isGerente(role);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [tab, setTab] = useState("todos");

  const { data } = useQuery({
    queryKey: ["historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, atendimento_servicos(nome, valor, peca_id, quantidade, pecas(nome)), pagamentos(forma, valor, parcelas)")
        .is("deleted_at", null)
        .order("entrada_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("*").maybeSingle();
      return data;
    },
    enabled: gerente,
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("atendimentos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento excluído do histórico");
      void qc.invalidateQueries({ queryKey: ["historico"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desfinalizar = useMutation({
    mutationFn: async (id: string) => {
      // Reabre o atendimento: volta pro pátio com os dados liberados para
      // alteração. Os pagamentos e o lançamento no caixa são revertidos —
      // ao finalizar novamente, um novo recibo é emitido.
      const { error: e1 } = await supabase.from("caixa_movimentos").delete().eq("atendimento_id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("pagamentos").delete().eq("atendimento_id", id);
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("atendimentos")
        .update({ status: "aberto", finalizado_at: null, pronto_at: null, pronto_por: null })
        .eq("id", id);
      if (e3) throw e3;
    },
    onSuccess: (_v, id) => {
      toast.success("Atendimento reaberto — voltou para o pátio");
      void qc.invalidateQueries({ queryKey: ["historico"] });
      void navigate({ to: "/atendimento/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return (data ?? []).filter((a) => {
      const naGarantia = a.garantia_ate ? a.garantia_ate >= hoje : false;
      if (tab === "garantia" && !naGarantia) return false;
      if (tab === "fora" && naGarantia) return false;
      return matches(busca, [
        a.placa,
        a.cliente_nome,
        a.cliente_cpf,
        a.cliente_telefone,
        a.modelo,
        a.fabricante,
        String(a.numero),
      ]);
    });
  }, [data, busca, tab]);

  return (
    <AppShell>
      <PageHeader
        title="Histórico"
        subtitle={
          gerente
            ? "Busca por placa, cliente, CPF, telefone ou OS"
            : "Busca por placa, cliente, CPF, telefone ou OS — modo leitura"
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar (ignora pontos, traços e acentos)"
          className="max-w-sm"
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="garantia">Na garantia</TabsTrigger>
            <TabsTrigger value="fora">Fora da garantia</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="p-3">OS</th>
              <th className="p-3">Veículo</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Serviços</th>
              <th className="p-3">Entrada</th>
              <th className="p-3">Garantia</th>
              <th className="p-3 text-right">Total</th>
              {gerente && <th className="p-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const hoje = new Date().toISOString().slice(0, 10);
              const naGarantia = a.garantia_ate ? a.garantia_ate >= hoje : false;
              const finalizado = a.status === "finalizado";
              return (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="num p-3">
                    <Link to="/atendimento/$id" params={{ id: a.id }} className="font-medium hover:underline">
                      #{a.numero}
                    </Link>
                  </td>
                  <td className="p-3">
                    <p className="font-display font-bold tracking-wider">{a.placa}</p>
                    <p className="text-xs text-muted-foreground">
                      {[a.fabricante, a.modelo].filter(Boolean).join(" ")}
                    </p>
                  </td>
                  <td className="p-3">{a.cliente_nome}</td>
                  <td className="p-3 text-muted-foreground">
                    {(a.atendimento_servicos ?? [])
                      .map((s) => {
                        const item = s as typeof s & { pecas?: { nome: string } | null; quantidade?: number };
                        return item.pecas?.nome
                          ? `${s.nome} · ${item.pecas.nome}${item.quantidade && item.quantidade !== 1 ? ` x${item.quantidade}` : ""}`
                          : s.nome;
                      })
                      .join(", ") || "—"}
                  </td>
                  <td className="num p-3 text-muted-foreground">{dt(a.entrada_at)}</td>
                  <td className="p-3">
                    {!finalizado ? (
                      <Badge variant="secondary">Em aberto</Badge>
                    ) : naGarantia ? (
                      <Badge>Ativa até {d(a.garantia_ate)}</Badge>
                    ) : (
                      <Badge variant="destructive">Fora da garantia</Badge>
                    )}
                  </td>
                  <td className="num p-3 text-right font-semibold">{brl(a.total)}</td>
                  {gerente && (
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {finalizado && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Imprimir notinha / recibo"
                            onClick={() =>
                              printReceipt(
                                {
                                  numero: a.numero,
                                  placa: a.placa,
                                  modelo: a.modelo,
                                  fabricante: a.fabricante,
                                  km: a.km,
                                  cliente_nome: a.cliente_nome,
                                  cliente_telefone: a.cliente_telefone,
                                  desconto: Number(a.desconto ?? 0),
                                  total: Number(a.total),
                                  finalizado_at: a.finalizado_at,
                                  garantia_ate: a.garantia_ate,
                                },
                                (a.atendimento_servicos ?? []).map((s) => {
                                  const item = s as typeof s & { pecas?: { nome: string } | null; quantidade?: number };
                                  return {
                                    nome: item.pecas?.nome ? `${s.nome} · ${item.pecas.nome}` : s.nome,
                                    valor: Number(s.valor),
                                    quantidade: Number(item.quantidade ?? 1),
                                  };
                                }),
                                (a.pagamentos ?? []).map((p) => ({
                                  forma: p.forma,
                                  valor: Number(p.valor),
                                  parcelas: p.parcelas,
                                })),
                                {
                                  nome_oficina: config?.nome_oficina || "DK Auto Center",
                                  endereco: config?.endereco ?? "",
                                  telefone: config?.telefone ?? "",
                                  cnpj: config?.cnpj ?? "",
                                },
                              )
                            }
                          >
                            <i className="fa-solid fa-receipt" />
                          </Button>
                        )}
                        {finalizado && (
                          <ConfirmActionDialog
                            trigger={
                              <Button variant="ghost" size="icon" title="Desfinalizar (reabrir)">
                                <i className="fa-solid fa-rotate-left" />
                              </Button>
                            }
                            title="Desfinalizar atendimento"
                            description={
                              <>
                                A OS #{a.numero} volta para "Carros no pátio" com todos os dados
                                liberados para alteração. Os pagamentos já registrados e o lançamento
                                no caixa desta OS serão removidos — ao finalizar de novo, um novo
                                recibo é gerado.
                              </>
                            }
                            confirmLabel="Desfinalizar"
                            onConfirm={() => desfinalizar.mutateAsync(a.id)}
                          />
                        )}
                        <ConfirmActionDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Excluir"
                              className="text-destructive hover:text-destructive"
                            >
                              <i className="fa-solid fa-trash-can" />
                            </Button>
                          }
                          title="Excluir atendimento"
                          description={
                            <>
                              Tem certeza que deseja excluir a OS #{a.numero} de{" "}
                              <strong className="text-foreground">{a.cliente_nome}</strong>? Essa ação
                              remove o registro do histórico.
                            </>
                          }
                          confirmLabel="Excluir"
                          destructive
                          onConfirm={() => excluir.mutateAsync(a.id)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={gerente ? 8 : 7} className="p-8 text-center text-muted-foreground">
                  Nenhum atendimento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
