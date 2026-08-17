import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, d, dt, FORMAS_PAGAMENTO, statusLabel, whatsappLink } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";
import { printReceipt } from "@/lib/receipt";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/atendimento/$id")({
  head: () => ({
    meta: [
      { title: "Atendimento | DK Auto Center" },
      { name: "description", content: "Ordem de serviço com checklist, mecânicos e pagamento." },
      { property: "og:title", content: "Atendimento | DK Auto Center" },
      { property: "og:description", content: "Ordem de serviço da oficina DK Auto Center." },
    ],
  }),
  component: AtendimentoPage,
});

function AtendimentoPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, user, nome } = useAuth();
  const gerente = isGerente(role);
  const [finalizando, setFinalizando] = useState(false);
  const [reciboPergunta, setReciboPergunta] = useState<null | {
    atendimento: Parameters<typeof printReceipt>[0];
    servicos: Parameters<typeof printReceipt>[1];
    pagamentos: Parameters<typeof printReceipt>[2];
  }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["atendimento", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, atendimento_servicos(*), pagamentos(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: mecanicos } = useQuery({
    queryKey: ["mecanicos-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mecanicos")
        .select("*")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: catalogo } = useQuery({
    queryKey: ["catalogo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos_catalogo")
        .select("*")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("*").maybeSingle();
      return data;
    },
  });

  const servicos = useMemo(
    () => [...(data?.atendimento_servicos ?? [])].sort((a, b) => a.nome.localeCompare(b.nome)),
    [data],
  );
  const total = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const todosConcluidos = servicos.length > 0 && servicos.every((s) => s.status === "concluido");
  const finalizado = data?.status === "finalizado";
  const aguardandoGerente = data?.status === "aguardando_gerente";

  const marcarPronto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("atendimentos")
        .update({ status: "aguardando_gerente", pronto_at: new Date().toISOString(), pronto_por: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço marcado como pronto — o gerente foi avisado.");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addServico = useMutation({
    mutationFn: async (payload: { nome: string; retorno_meses: number; garantia_km: number | null; valor: number }) => {
      const { error } = await supabase.from("atendimento_servicos").insert({
        atendimento_id: id,
        nome: payload.nome,
        valor: payload.valor,
        retorno_meses: payload.retorno_meses,
        garantia_km: payload.garantia_km,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atendimento", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updServico = useMutation({
    mutationFn: async ({ sid, patch }: { sid: string; patch: TablesUpdate<"atendimento_servicos"> }) => {
      const { error } = await supabase.from("atendimento_servicos").update(patch).eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atendimento", id] }),
  });

  const delServico = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase.from("atendimento_servicos").delete().eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atendimento", id] }),
  });

  const salvarAtendimento = useMutation({
    mutationFn: async (patch: TablesUpdate<"atendimentos">) => {
      const { error } = await supabase.from("atendimentos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento atualizado");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
  });

  if (isLoading || !data) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Carregando atendimento…</p>
      </AppShell>
    );
  }

  const avarias = (data.avarias as string[]) ?? [];
  const fotos = (data.fotos as string[]) ?? [];

  return (
    <AppShell>
      <PageHeader
        title={`OS #${data.numero} · ${data.placa}`}
        subtitle={`${[data.fabricante, data.modelo, data.cor].filter(Boolean).join(" · ")} — ${data.cliente_nome}`}
      >
        <Button variant="outline" asChild>
          <Link to="/patio">
            <i className="fa-solid fa-arrow-left" /> Voltar
          </Link>
        </Button>
        {!finalizado && !aguardandoGerente && !gerente && (
          <Button
            disabled={!todosConcluidos || marcarPronto.isPending}
            onClick={() => marcarPronto.mutate()}
          >
            {marcarPronto.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            <i className="fa-solid fa-flag-checkered" /> Marcar serviço como pronto
          </Button>
        )}
        {!finalizado && gerente && (
          <Button disabled={!todosConcluidos} onClick={() => setFinalizando(true)}>
            <i className="fa-solid fa-flag-checkered" /> Finalizar e entregar
          </Button>
        )}
      </PageHeader>

      {aguardandoGerente && !finalizado && (
        <div className="card-surface mb-6 flex items-center gap-3 p-4">
          <i className="fa-solid fa-bell text-xl text-primary" />
          <div>
            <p className="font-semibold">Aguardando finalização do gerente</p>
            <p className="text-sm text-muted-foreground">
              O mecânico marcou este atendimento como pronto{data?.pronto_at ? ` em ${dt(data.pronto_at)}` : ""}.
              {gerente ? " Confira e clique em \"Finalizar e entregar\"." : " O gerente foi notificado."}
            </p>
          </div>
        </div>
      )}

      {finalizado && (
        <div className="card-surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              Finalizado em {dt(data.finalizado_at)} · Total {brl(data.total)}
            </p>
            <GarantiaTag ate={data.garantia_ate} km={data.garantia_km} kmEntrada={data.km} />
          </div>
          <Button variant="outline" asChild>
            <a
              href={whatsappLink(
                data.cliente_telefone,
                `Olá ${data.cliente_nome}, seu ${data.modelo ?? "veículo"} (${data.placa}) está pronto! Serviços: ${servicos.map((s) => s.nome).join(", ")}. Total ${brl(data.total)}. Termo de garantia válido até ${d(data.garantia_ate)}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <i className="fa-brands fa-whatsapp" /> Enviar OS por WhatsApp
            </a>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          <div className="card-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold uppercase">Serviços</h2>
              <span className="num text-sm text-muted-foreground">Total {brl(total)}</span>
            </div>

            <div className="space-y-3">
              {servicos.map((s) => (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{s.nome}</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          s.status === "concluido"
                            ? "default"
                            : s.status === "em_execucao"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {statusLabel[s.status]}
                      </Badge>
                      {!finalizado && (
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => delServico.mutate(s.id)}
                        >
                          <i className="fa-solid fa-trash-can text-xs" />
                        </button>
                      )}
                    </div>
                  </div>
                  {!finalizado && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <Select
                        value={s.status}
                        onValueChange={(v) => updServico.mutate({ sid: s.id, patch: { status: v } })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando">Aguardando</SelectItem>
                          <SelectItem value="em_execucao">Em execução</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={s.mecanico_id ?? "none"}
                        onValueChange={(v) =>
                          updServico.mutate({
                            sid: s.id,
                            patch: { mecanico_id: v === "none" ? null : v },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Mecânico" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem mecânico</SelectItem>
                          {(mecanicos ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        className="num"
                        defaultValue={Number(s.valor)}
                        onBlur={(e) =>
                          updServico.mutate({
                            sid: s.id,
                            patch: { valor: Number(e.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                  )}
                  {finalizado && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mecânico:{" "}
                      {(mecanicos ?? []).find((m) => m.id === s.mecanico_id)?.nome ?? "—"} ·{" "}
                      <span className="num">{brl(s.valor)}</span>
                    </p>
                  )}
                </div>
              ))}
              {servicos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum serviço adicionado ainda.</p>
              )}
            </div>

            {!finalizado && (
              <ChecklistServicos
                catalogo={catalogo ?? []}
                jaAdicionados={servicos.map((s) => s.nome)}
                onAdd={(item) => addServico.mutate(item)}
              />
            )}
          </div>

          <div className="card-surface space-y-4 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Vistoria de entrada</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="KM na entrada" value={data.km ? String(data.km) : "—"} />
              <Info label="Entrada" value={dt(data.entrada_at)} />
            </div>
            {avarias.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Avarias prévias registradas</p>
                <div className="flex flex-wrap gap-2">
                  {avarias.map((a) => (
                    <Badge key={a} variant="secondary">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotos.map((f) => (
                  <a key={f} href={f} target="_blank" rel="noreferrer">
                    <img
                      src={f}
                      alt="Foto da vistoria do veículo"
                      className="h-24 w-full rounded-md object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Alertas técnicos / recusa do cliente</Label>
              <Textarea
                defaultValue={data.alertas_tecnicos ?? ""}
                rows={3}
                onBlur={(e) => salvarAtendimento.mutate({ alertas_tecnicos: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação geral</Label>
              <Textarea
                defaultValue={data.observacao ?? ""}
                rows={2}
                onBlur={(e) => salvarAtendimento.mutate({ observacao: e.target.value })}
              />
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="card-surface space-y-2 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Cliente</h2>
            <Info label="Nome" value={data.cliente_nome} />
            <Info label="Telefone" value={data.cliente_telefone || "—"} />
            <Info label="CPF" value={data.cliente_cpf || "—"} />
            {data.cliente_telefone && (
              <Button variant="outline" className="w-full" asChild>
                <a
                  href={whatsappLink(
                    data.cliente_telefone,
                    `Olá ${data.cliente_nome}, aqui é da DK Auto Center sobre o seu ${data.modelo ?? "veículo"} (${data.placa}).`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fa-brands fa-whatsapp" /> WhatsApp
                </a>
              </Button>
            )}
          </div>

          <div className="card-surface space-y-2 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Resumo</h2>
            <Info label="Serviços" value={`${servicos.filter((s) => s.status === "concluido").length}/${servicos.length} concluídos`} />
            <Info label="Total" value={brl(total)} />
            {finalizado && (
              <>
                <Info label="Desconto" value={brl(data.desconto)} />
                <Info label="Pago" value={brl(data.total)} />
                <div className="pt-2">
                  {(data.pagamentos ?? []).map((p) => (
                    <p key={p.id} className="num text-sm text-muted-foreground">
                      {p.forma}
                      {p.parcelas > 1 ? ` (${p.parcelas}x)` : ""} — {brl(p.valor)}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {finalizando && gerente && (
        <FinalizarDialog
          atendimento={data}
          servicos={servicos}
          mecanicos={mecanicos ?? []}
          onClose={() => setFinalizando(false)}
          onDone={(resultado) => {
            setFinalizando(false);
            void qc.invalidateQueries();
            setReciboPergunta({
              atendimento: {
                numero: data.numero,
                placa: data.placa,
                modelo: data.modelo,
                fabricante: data.fabricante,
                km: data.km,
                cliente_nome: data.cliente_nome,
                cliente_telefone: data.cliente_telefone,
                desconto: resultado.desconto,
                total: resultado.total,
                finalizado_at: new Date().toISOString(),
                garantia_ate: resultado.garantia_ate,
              },
              servicos: servicos.map((s) => ({ nome: s.nome, valor: Number(s.valor) })),
              pagamentos: resultado.pagamentos,
            });
          }}
        />
      )}

      {reciboPergunta && (
        <AlertDialog open onOpenChange={() => {}}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display uppercase">
                Atendimento finalizado
              </AlertDialogTitle>
              <AlertDialogDescription>
                Deseja gerar a notinha do cliente agora?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setReciboPergunta(null);
                  void navigate({ to: "/patio" });
                }}
              >
                Não
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  printReceipt(reciboPergunta.atendimento, reciboPergunta.servicos, reciboPergunta.pagamentos, {
                    nome_oficina: config?.nome_oficina || "DK Auto Center",
                    endereco: config?.endereco ?? "",
                    telefone: config?.telefone ?? "",
                    cnpj: config?.cnpj ?? "",
                  });
                  setReciboPergunta(null);
                  void navigate({ to: "/patio" });
                }}
              >
                Sim, gerar notinha
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

export function GarantiaTag({
  ate,
  km,
  kmEntrada,
}: {
  ate: string | null;
  km: number | null;
  kmEntrada: number | null;
}) {
  if (!ate) return null;
  const dias = Math.round((new Date(ate).getTime() - Date.now()) / 86400000);
  const ativa = dias >= 0;
  return (
    <p className={`text-sm font-semibold ${ativa ? "text-success" : "text-destructive"}`}>
      <i className={`fa-solid ${ativa ? "fa-shield-halved" : "fa-triangle-exclamation"} mr-1`} />
      {ativa
        ? `Garantia ativa — faltam ${dias} dias (até ${d(ate)})`
        : `SERVIÇO FORA DA GARANTIA DESDE ${d(ate)}`}
      {km ? ` · limite ${km.toLocaleString("pt-BR")} km${kmEntrada ? ` (entrada ${kmEntrada.toLocaleString("pt-BR")} km)` : ""}` : ""}
    </p>
  );
}

function ChecklistServicos({
  catalogo,
  jaAdicionados,
  onAdd,
}: {
  catalogo: { id: string; nome: string; preco_padrao: number; retorno_meses: number; garantia_km: number | null }[];
  jaAdicionados: string[];
  onAdd: (i: { nome: string; retorno_meses: number; garantia_km: number | null; valor: number }) => void;
}) {
  const [outro, setOutro] = useState("");
  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-3 text-sm font-medium">
        <i className="fa-solid fa-list-check mr-2 text-primary" /> Checklist de serviços
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {catalogo.map((c) => {
          const marcado = jaAdicionados.includes(c.nome);
          return (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={marcado}
                disabled={marcado}
                onCheckedChange={() =>
                  onAdd({
                    nome: c.nome,
                    retorno_meses: c.retorno_meses,
                    garantia_km: c.garantia_km,
                    valor: Number(c.preco_padrao),
                  })
                }
              />
              {c.nome}
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          placeholder="Adicionar outro serviço"
        />
        <Button
          variant="outline"
          onClick={() => {
            if (!outro.trim()) return;
            onAdd({ nome: outro.trim(), retorno_meses: 6, garantia_km: null, valor: 0 });
            setOutro("");
          }}
        >
          <i className="fa-solid fa-plus" />
        </Button>
      </div>
    </div>
  );
}

type Servico = {
  id: string;
  nome: string;
  valor: number;
  mecanico_id: string | null;
  retorno_meses: number;
  garantia_km: number | null;
};

function FinalizarDialog({
  atendimento,
  servicos,
  mecanicos,
  onClose,
  onDone,
}: {
  atendimento: {
    id: string;
    numero: number;
    placa: string;
    modelo: string | null;
    cliente_nome: string;
    cliente_telefone: string | null;
    km: number | null;
  };
  servicos: Servico[];
  mecanicos: { id: string; nome: string }[];
  onClose: () => void;
  onDone: (resultado: {
    desconto: number;
    total: number;
    garantia_ate: string | null;
    pagamentos: { forma: string; valor: number; parcelas: number }[];
  }) => void;
}) {
  const bruto = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const [desconto, setDesconto] = useState(0);
  const liquido = Math.max(bruto - desconto, 0);
  const [pagamentos, setPagamentos] = useState([
    { forma: "Dinheiro", valor: liquido, parcelas: 1 },
  ]);
  const somaPag = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const ok = Math.abs(somaPag - liquido) < 0.01;

  // Retorno agora é uma decisão manual do gerente, não mais gerado
  // automaticamente pelo sistema a partir do catálogo de serviços.
  const [necessitaRetorno, setNecessitaRetorno] = useState(false);
  const [dataRetorno, setDataRetorno] = useState("");

  const finalizar = useMutation({
    mutationFn: async () => {
      const { data: cfg } = await supabase.from("configuracoes").select("*").maybeSingle();
      const dias = cfg?.garantia_dias ?? 90;
      const garantiaAte = new Date();
      garantiaAte.setDate(garantiaAte.getDate() + dias);
      const garantiaKm = servicos.reduce<number | null>(
        (min, s) => (s.garantia_km ? Math.min(min ?? s.garantia_km, s.garantia_km) : min),
        null,
      );

      const garantiaAteStr = garantiaAte.toISOString().slice(0, 10);

      const { error: e1 } = await supabase
        .from("atendimentos")
        .update({
          status: "finalizado",
          desconto,
          total: liquido,
          finalizado_at: new Date().toISOString(),
          garantia_ate: garantiaAteStr,
          garantia_km: garantiaKm ? (atendimento.km ?? 0) + garantiaKm : null,
          necessita_retorno: necessitaRetorno,
          data_retorno_manual: necessitaRetorno && dataRetorno ? dataRetorno : null,
        })
        .eq("id", atendimento.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("pagamentos").insert(
        pagamentos.map((p) => ({
          atendimento_id: atendimento.id,
          forma: p.forma,
          valor: Number(p.valor),
          parcelas: p.parcelas,
        })),
      );
      if (e2) throw e2;

      const { data: sessao } = await supabase
        .from("caixa_sessoes")
        .select("id")
        .eq("aberto", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessao) {
        await supabase.from("caixa_movimentos").insert(
          pagamentos.map((p) => ({
            sessao_id: sessao.id,
            tipo: "entrada",
            descricao: `OS #${atendimento.numero} — ${atendimento.cliente_nome}`,
            valor: Number(p.valor),
            forma: p.forma,
            atendimento_id: atendimento.id,
          })),
        );
      }

      // Retorno é opcional e manual: só cria a notificação se o gerente marcou
      // "Sim" e definiu uma data. Nada mais é agendado automaticamente.
      if (necessitaRetorno && dataRetorno) {
        await supabase.from("notificacoes_retorno").insert({
          atendimento_id: atendimento.id,
          cliente_nome: atendimento.cliente_nome,
          telefone: atendimento.cliente_telefone,
          veiculo: `${atendimento.modelo ?? ""} ${atendimento.placa}`.trim(),
          servico: servicos.map((s) => s.nome).join(", "),
          vencimento: dataRetorno,
        });
      }

      return { garantiaAteStr };
    },
    onSuccess: ({ garantiaAteStr }) => {
      toast.success("Atendimento finalizado e registrado no caixa");
      onDone({ desconto, total: liquido, garantia_ate: garantiaAteStr, pagamentos });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">
            Finalizar atendimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Cliente:</span> {atendimento.cliente_nome}
          </p>
          <p>
            <span className="text-muted-foreground">Veículo:</span> {atendimento.modelo}{" "}
            {atendimento.placa}
          </p>
        </div>

        <div className="rounded-md border">
          {servicos.map((s) => (
            <div key={s.id} className="flex justify-between border-b px-3 py-2 text-sm last:border-0">
              <span>
                {s.nome}
                <span className="text-muted-foreground">
                  {" "}
                  · {mecanicos.find((m) => m.id === s.mecanico_id)?.nome ?? "sem mecânico"}
                </span>
              </span>
              <span className="num">{brl(s.valor)}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Desconto</Label>
            <Input
              type="number"
              step="0.01"
              className="num"
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Valor final</Label>
            <p className="num font-display text-2xl font-bold">{brl(liquido)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pagamentos</Label>
          {pagamentos.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Select
                value={p.forma}
                onValueChange={(v) =>
                  setPagamentos((ps) => ps.map((x, j) => (i === j ? { ...x, forma: v } : x)))
                }
              >
                <SelectTrigger className="flex-1">
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
              {p.forma === "Cartão de crédito" && (
                <Select
                  value={String(p.parcelas)}
                  onValueChange={(v) =>
                    setPagamentos((ps) =>
                      ps.map((x, j) => (i === j ? { ...x, parcelas: Number(v) } : x)),
                    )
                  }
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                type="number"
                step="0.01"
                className="num w-32"
                value={p.valor}
                onChange={(e) =>
                  setPagamentos((ps) =>
                    ps.map((x, j) => (i === j ? { ...x, valor: Number(e.target.value) } : x)),
                  )
                }
              />
              {pagamentos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}
                >
                  <i className="fa-solid fa-xmark" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPagamentos((ps) => [
                ...ps,
                { forma: "PIX", valor: Math.max(liquido - somaPag, 0), parcelas: 1 },
              ])
            }
          >
            <i className="fa-solid fa-plus" /> Adicionar pagamento
          </Button>
          {!ok && (
            <p className="text-sm text-destructive">
              A soma dos pagamentos ({brl(somaPag)}) precisa ser igual a {brl(liquido)}.
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <Label>Necessita de retorno?</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={necessitaRetorno ? "default" : "outline"}
              onClick={() => setNecessitaRetorno(true)}
            >
              Sim
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!necessitaRetorno ? "default" : "outline"}
              onClick={() => {
                setNecessitaRetorno(false);
                setDataRetorno("");
              }}
            >
              Não
            </Button>
          </div>
          {necessitaRetorno && (
            <div className="space-y-1.5 pt-1">
              <Label>Data de retorno</Label>
              <Input
                type="date"
                className="num"
                value={dataRetorno}
                onChange={(e) => setDataRetorno(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!ok || (necessitaRetorno && !dataRetorno) || finalizar.isPending}
            onClick={() => finalizar.mutate()}
          >
            {finalizar.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            Confirmar e finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
