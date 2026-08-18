import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { brl, d, dt, FORMAS_PAGAMENTO, matches, statusLabel, whatsappLink } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente, canEditServico } from "@/lib/permissions";
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
  const { role, user, nome, mecanicoId } = useAuth();
  const gerente = isGerente(role);
  const [finalizando, setFinalizando] = useState(false);
  const [editarDadosOpen, setEditarDadosOpen] = useState(false);
  const [novaAvaria, setNovaAvaria] = useState("");
  const [fotoBusy, setFotoBusy] = useState(false);
  const [filtrosPeca, setFiltrosPeca] = useState<Record<string, { busca: string; tipo: string }>>({});
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

  const { data: pecas } = useQuery({
    queryKey: ["pecas-ativas-atendimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pecas")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: gerente,
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
        .update({
          status: "aguardando_gerente",
          pronto_at: new Date().toISOString(),
          pronto_por: user?.id ?? null,
        })
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
    mutationFn: async (payload: {
      nome: string;
      retorno_meses: number;
      garantia_km: number | null;
      valor: number;
      peca_id?: string | null;
      quantidade?: number;
    }) => {
      const { error } = await supabase.from("atendimento_servicos").insert({
        atendimento_id: id,
        nome: payload.nome,
        valor: payload.valor,
        retorno_meses: payload.retorno_meses,
        garantia_km: payload.garantia_km,
        peca_id: payload.peca_id ?? null,
        quantidade: payload.quantidade ?? 1,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atendimento", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updServico = useMutation({
    mutationFn: async ({
      sid,
      patch,
    }: {
      sid: string;
      patch: TablesUpdate<"atendimento_servicos">;
    }) => {
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

  const adicionarAvaria = async () => {
    const avaria = novaAvaria.trim();
    if (!avaria || avarias.includes(avaria)) return;
    await salvarAtendimento.mutateAsync({ avarias: [...avarias, avaria] });
    setNovaAvaria("");
  };

  const removerAvaria = async (avaria: string) => {
    await salvarAtendimento.mutateAsync({ avarias: avarias.filter((item) => item !== avaria) });
  };

  const anexarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setFotoBusy(true);
    try {
      const novasFotos: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
        const { error } = await supabase.storage.from("vistorias").upload(path, file);
        if (error) throw error;
        const { data: signed } = await supabase.storage.from("vistorias").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signed?.signedUrl) novasFotos.push(signed.signedUrl);
      }
      if (novasFotos.length) {
        await salvarAtendimento.mutateAsync({ fotos: [...fotos, ...novasFotos] });
        toast.success(`${novasFotos.length} foto(s) adicionada(s) à vistoria`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anexar as fotos.");
    } finally {
      setFotoBusy(false);
    }
  };

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
            <i className="fa-solid fa-flag-checkered" /> Enviar para conferência do gerente
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
              O mecânico marcou este atendimento como pronto
              {data?.pronto_at ? ` em ${dt(data.pronto_at)}` : ""}.
              {gerente
                ? ' Confira e clique em "Finalizar e entregar".'
                : " O gerente foi notificado."}
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
              <span className="num text-sm text-muted-foreground">Total dos serviços: {brl(total)}</span>
            </div>

            <div className="space-y-3">
              {servicos.map((s) => {
                const filtroPeca = filtrosPeca[s.id] ?? { busca: "", tipo: "todos" };
                const pecasFiltradas = (pecas ?? []).filter(
                  (p) =>
                    (filtroPeca.tipo === "todos" || p.tipo === filtroPeca.tipo || p.categoria === filtroPeca.tipo) &&
                    matches(filtroPeca.busca, [p.nome, p.sku, p.marca, p.medida, p.modelo_desenho]),
                );
                return (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Serviço</p>
                      <p className="font-medium">{s.nome}</p>
                      {s.peca_id && (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <p><i className="fa-solid fa-box-open mr-1" /><strong>Produto do estoque:</strong> {(pecas ?? []).find((p) => p.id === s.peca_id)?.nome ?? "item do estoque"}</p>
                          <p><strong>Quantidade:</strong> {Number(s.quantidade || 1)} · <strong>Valor registrado:</strong> {brl(s.valor)}</p>
                        </div>
                      )}
                    </div>
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
                      {!finalizado && gerente && (
                        <ConfirmActionDialog
                          trigger={
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              title={`Excluir serviço ${s.nome}`}
                            >
                              <i className="fa-solid fa-trash-can text-xs" />
                            </button>
                          }
                          title="Excluir serviço da OS"
                          description={
                            <>
                              Tem certeza que deseja excluir <strong className="text-foreground">{s.nome}</strong> desta OS?
                              Essa ação remove o serviço do atendimento.
                            </>
                          }
                          confirmLabel="Excluir serviço"
                          destructive
                          onConfirm={() => delServico.mutateAsync(s.id)}
                        />
                      )}
                    </div>
                  </div>
                  {!finalizado && gerente && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Status do serviço</Label>
                        <Select
                          value={s.status}
                          onValueChange={(v) =>
                            updServico.mutate({ sid: s.id, patch: { status: v } })
                          }
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
                      </div>
                      <div className="space-y-1.5">
                        <Label>Responsável pelo serviço</Label>
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
                      </div>
                      <div className="space-y-1.5">
                        <Label>Preço registrado (R$)</Label>
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
                      <div className="grid gap-2 sm:col-span-3 sm:grid-cols-[1fr_120px]">
                        <div className="space-y-1.5">
                          <Label>Produto/peça/óleo/pneu usado</Label>
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                            <Select
                              value={filtroPeca.tipo}
                              onValueChange={(tipo) =>
                                setFiltrosPeca((atual) => ({
                                  ...atual,
                                  [s.id]: { ...filtroPeca, tipo },
                                }))
                              }
                            >
                              <SelectTrigger aria-label="Filtrar estoque por tipo">
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todos">Todos os tipos</SelectItem>
                                <SelectItem value="pneu">Pneus</SelectItem>
                                <SelectItem value="peca">Peças e insumos</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              value={filtroPeca.busca}
                              onChange={(e) =>
                                setFiltrosPeca((atual) => ({
                                  ...atual,
                                  [s.id]: { ...filtroPeca, busca: e.target.value },
                                }))
                              }
                              placeholder="Buscar por nome, SKU, código, marca ou medida..."
                              aria-label="Buscar item do estoque"
                            />
                          </div>
                          <Select
                            value={s.peca_id ?? "none"}
                            onValueChange={(v) => {
                            const peca = (pecas ?? []).find((p) => p.id === v);
                            updServico.mutate({
                              sid: s.id,
                              patch: {
                                peca_id: v === "none" ? null : v,
                                quantidade: s.quantidade || 1,
                                ...(peca && v !== "none" ? { valor: Number(peca.preco_venda) } : {}),
                              },
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Peça/óleo/pneu usado (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem peça vinculada</SelectItem>
                            {pecasFiltradas.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome} · {p.tipo === "pneu" ? "pneu" : "peça/insumo"} · estoque {Number(p.estoque)} · {brl(p.preco_venda)}
                              </SelectItem>
                            ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {pecasFiltradas.length} item(ns) encontrado(s) · a baixa ocorre somente na finalização da OS
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Quantidade usada</Label>
                        </div>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="num"
                          defaultValue={Number(s.quantidade || 1)}
                          disabled={!s.peca_id}
                          aria-label="Quantidade da peça"
                          onBlur={(e) =>
                            updServico.mutate({
                              sid: s.id,
                              patch: { quantidade: Math.max(Number(e.target.value) || 1, 0.01) },
                            })
                          }
                        />
                        </div>
                      </div>
                    </div>
                  )}
                  {!finalizado && !gerente && (
                    <div className="mt-3 space-y-2">
                      {/* Mecânico não vê nem altera responsável/valor — só o status do
                          próprio serviço. Campos abaixo são somente leitura (a trava
                          real está no banco: RLS + trigger bloqueiam a escrita). */}
                      <Select
                        value={s.status}
                        disabled={!canEditServico(role, s.mecanico_id, mecanicoId)}
                        onValueChange={(v) =>
                          updServico.mutate({ sid: s.id, patch: { status: v } })
                        }
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
                      {!canEditServico(role, s.mecanico_id, mecanicoId) && (
                        <p className="text-xs text-muted-foreground">
                          <i className="fa-solid fa-lock mr-1" />
                          {s.mecanico_id
                            ? "Atribuído a outro mecânico — aguarde o gerente."
                            : "Ainda sem mecânico atribuído — peça ao gerente."}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        <strong>Responsável:</strong>{" "}
                        <span className="font-medium text-foreground">
                          {(mecanicos ?? []).find((m) => m.id === s.mecanico_id)?.nome ??
                            "sem mecânico atribuído"}
                        </span>{" "}
                      · <strong>Preço registrado:</strong> <span className="num">{brl(s.valor)}</span>
                    </p>
                    </div>
                  )}
                  {finalizado && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <strong>Responsável:</strong> {(mecanicos ?? []).find((m) => m.id === s.mecanico_id)?.nome ?? "—"}{" "}
                      · <span className="num">{brl(s.valor)}</span>
                    </p>
                  )}
                </div>
                );
              })}
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
            {(avarias.length > 0 || gerente) && (
              <div>
                <p className="mb-1 text-sm font-medium">Avarias registradas</p>
                <div className="flex flex-wrap gap-2">
                  {avarias.map((a) => (
                    <Badge key={a} variant="secondary" className="gap-1">
                      {a}
                      {gerente && !finalizado && (
                        <ConfirmActionDialog
                          trigger={<button type="button" className="ml-1 text-muted-foreground hover:text-destructive" title={`Remover avaria ${a}`}><i className="fa-solid fa-xmark" /></button>}
                          title="Remover avaria"
                          description={<>Tem certeza que deseja remover <strong className="text-foreground">{a}</strong> da vistoria?</>}
                          confirmLabel="Remover avaria"
                          destructive
                          onConfirm={() => removerAvaria(a)}
                        />
                      )}
                    </Badge>
                  ))}
                </div>
                {!finalizado && gerente && (
                  <div className="mt-3 flex gap-2">
                    <Input value={novaAvaria} onChange={(e) => setNovaAvaria(e.target.value)} placeholder="Adicionar nova avaria ou observação" />
                    <Button type="button" variant="outline" onClick={() => void adicionarAvaria()} disabled={!novaAvaria.trim() || salvarAtendimento.isPending}>
                      <i className="fa-solid fa-plus" /> Adicionar
                    </Button>
                  </div>
                )}
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
            {!finalizado && gerente && (
              <div className="space-y-1.5">
                <Label htmlFor="fotos-vistoria-adicionais">Adicionar fotos posteriores</Label>
                <Input id="fotos-vistoria-adicionais" type="file" accept="image/*" multiple disabled={fotoBusy} onChange={(e) => void anexarFotos(e.target.files)} />
                <p className="text-xs text-muted-foreground">As fotos novas serão acrescentadas às atuais, sem substituí-las.</p>
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold uppercase">Cliente</h2>
              {!finalizado && gerente && (
                <Button variant="outline" size="sm" onClick={() => setEditarDadosOpen(true)}>
                  <i className="fa-solid fa-pen-to-square" /> Editar
                </Button>
              )}
            </div>
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
            <Info
              label="Serviços"
              value={`${servicos.filter((s) => s.status === "concluido").length}/${servicos.length} concluídos`}
            />
            <Info label="Total dos serviços" value={brl(total)} />
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

      {!finalizado && gerente && (
        <EditarDadosOsDialog
          open={editarDadosOpen}
          atendimento={data}
          onClose={() => setEditarDadosOpen(false)}
          onSave={async (patch) => {
            await salvarAtendimento.mutateAsync(patch);
            setEditarDadosOpen(false);
          }}
        />
      )}

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
              servicos: servicos.map((s) => ({
                nome: s.peca_id
                  ? `${s.nome} · ${(pecas ?? []).find((p) => p.id === s.peca_id)?.nome ?? "peça do estoque"}`
                  : s.nome,
                valor: Number(s.valor),
                quantidade: Number(s.quantidade ?? 1),
              })),
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
                  printReceipt(
                    reciboPergunta.atendimento,
                    reciboPergunta.servicos,
                    reciboPergunta.pagamentos,
                    {
                      nome_oficina: config?.nome_oficina || "DK Auto Center",
                      endereco: config?.endereco ?? "",
                      telefone: config?.telefone ?? "",
                      cnpj: config?.cnpj ?? "",
                    },
                  );
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
      {km
        ? ` · limite ${km.toLocaleString("pt-BR")} km${kmEntrada ? ` (entrada ${kmEntrada.toLocaleString("pt-BR")} km)` : ""}`
        : ""}
    </p>
  );
}

function EditarDadosOsDialog({
  open,
  atendimento,
  onClose,
  onSave,
}: {
  open: boolean;
  atendimento: {
    cliente_nome: string;
    cliente_telefone: string | null;
    cliente_cpf: string | null;
    placa: string;
    fabricante: string | null;
    modelo: string | null;
    cor: string | null;
    km: number | null;
  };
  onClose: () => void;
  onSave: (patch: TablesUpdate<"atendimentos">) => Promise<void>;
}) {
  const [form, setForm] = useState({
    cliente_nome: atendimento.cliente_nome,
    cliente_telefone: atendimento.cliente_telefone ?? "",
    cliente_cpf: atendimento.cliente_cpf ?? "",
    placa: atendimento.placa,
    fabricante: atendimento.fabricante ?? "",
    modelo: atendimento.modelo ?? "",
    cor: atendimento.cor ?? "",
    km: atendimento.km == null ? "" : String(atendimento.km),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      cliente_nome: atendimento.cliente_nome,
      cliente_telefone: atendimento.cliente_telefone ?? "",
      cliente_cpf: atendimento.cliente_cpf ?? "",
      placa: atendimento.placa,
      fabricante: atendimento.fabricante ?? "",
      modelo: atendimento.modelo ?? "",
      cor: atendimento.cor ?? "",
      km: atendimento.km == null ? "" : String(atendimento.km),
    });
  }, [open, atendimento]);

  const setField = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    if (!form.cliente_nome.trim() || !form.placa.trim()) {
      toast.error("Nome do cliente e placa são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        cliente_nome: form.cliente_nome.trim(),
        cliente_telefone: form.cliente_telefone.trim() || null,
        cliente_cpf: form.cliente_cpf.trim() || null,
        placa: form.placa.trim().toUpperCase(),
        fabricante: form.fabricante.trim() || null,
        modelo: form.modelo.trim() || null,
        cor: form.cor.trim() || null,
        km: form.km.trim() ? Number(form.km) : null,
      });
      toast.success("Dados da OS atualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os dados.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Editar dados da OS</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Use esta tela para corrigir dados digitados na abertura ou completar o CPF depois. O histórico da OS, estoque e pagamentos permanecem preservados.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nome do cliente *</Label><Input value={form.cliente_nome} onChange={(e) => setField("cliente_nome", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.cliente_telefone} onChange={(e) => setField("cliente_telefone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>CPF</Label><Input value={form.cliente_cpf} onChange={(e) => setField("cliente_cpf", e.target.value)} placeholder="000.000.000-00" /></div>
          <div className="space-y-1.5"><Label>Placa *</Label><Input value={form.placa} onChange={(e) => setField("placa", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Quilometragem</Label><Input type="number" min="0" value={form.km} onChange={(e) => setField("km", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fabricante</Label><Input value={form.fabricante} onChange={(e) => setField("fabricante", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Modelo</Label><Input value={form.modelo} onChange={(e) => setField("modelo", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Cor</Label><Input value={form.cor} onChange={(e) => setField("cor", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <i className="fa-solid fa-circle-notch fa-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistServicos({
  catalogo,
  jaAdicionados,
  onAdd,
}: {
  catalogo: {
    id: string;
    nome: string;
    preco_padrao: number;
    retorno_meses: number;
    garantia_km: number | null;
  }[];
  jaAdicionados: string[];
  onAdd: (i: {
    nome: string;
    retorno_meses: number;
    garantia_km: number | null;
    valor: number;
  }) => void;
}) {
  const [outro, setOutro] = useState("");
  const [buscaServico, setBuscaServico] = useState("");
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const rapidos = ["Alinhamento", "Balanceamento", "Troca de óleo", "Troca de pneu"];

  useEffect(() => {
    try {
      setFavoritos(JSON.parse(localStorage.getItem("dk-pneus-servicos-favoritos") ?? "[]") as string[]);
    } catch {
      setFavoritos([]);
    }
  }, []);

  const disponiveis = catalogo.filter((c) => matches(buscaServico, [c.nome]));
  const adicionarRapido = (nome: string) => {
    const c = catalogo.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    if (!c || jaAdicionados.includes(c.nome)) return;
    onAdd({
      nome: c.nome,
      retorno_meses: c.retorno_meses,
      garantia_km: c.garantia_km,
      valor: Number(c.preco_padrao),
    });
  };

  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-3 text-sm font-medium">
        <i className="fa-solid fa-list-check mr-2 text-primary" /> Checklist de serviços
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {rapidos.map((nome) => (
          <Button key={nome} type="button" variant="outline" size="sm" onClick={() => adicionarRapido(nome)}>
            <i className="fa-solid fa-bolt" /> {nome}
          </Button>
        ))}
      </div>
      <Input
        value={buscaServico}
        onChange={(e) => setBuscaServico(e.target.value)}
        placeholder="Buscar serviço por nome..."
        className="mb-3"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {disponiveis.map((c) => {
          const marcado = jaAdicionados.includes(c.nome);
          const favorito = favoritos.includes(c.id);
          return (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
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
                <span className="truncate">{c.nome}</span>
              </label>
              <button
                type="button"
                className="text-muted-foreground hover:text-primary"
                title={favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                onClick={() => {
                  const proximo = favorito ? favoritos.filter((id) => id !== c.id) : [...favoritos, c.id];
                  setFavoritos(proximo);
                  localStorage.setItem("dk-pneus-servicos-favoritos", JSON.stringify(proximo));
                }}
              >
                <i className={`${favorito ? "fa-solid" : "fa-regular"} fa-star`} />
              </button>
            </div>
          );
        })}
        {disponiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
        )}
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
  peca_id: string | null;
  quantidade: number;
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
            <div
              key={s.id}
              className="flex justify-between border-b px-3 py-2 text-sm last:border-0"
            >
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
