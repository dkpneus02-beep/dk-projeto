import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { dt } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos de serviço | DK Auto Center" },
      { name: "description", content: "Avisos da gerência ligados aos serviços da oficina." },
    ],
  }),
  component: Avisos,
});

const db = supabase as any;
type Aviso = { id: string; mensagem: string; mecanico_id: string | null; criado_por_nome: string | null; created_at: string; atendimento_id: string | null; atendimento_servico_id: string | null; editado_at: string | null; excluido_at: string | null; mes_referencia: string; mecanicos?: { nome?: string } | null; atendimento_servicos?: { nome?: string; atendimentos?: { numero?: number; placa?: string; cliente_nome?: string } | null } | null; aviso_leituras?: { id: string; user_id: string; user_nome: string | null; lido_at: string }[] };
type Servico = { id: string; nome: string; atendimento_id: string; atendimentos?: { numero?: number; placa?: string; cliente_nome?: string } | null };

function Avisos() {
  const qc = useQueryClient();
  const { user, nome, role } = useAuth();
  const isGerente = role === "gerente";
  const [mensagem, setMensagem] = useState("");
  const [destino, setDestino] = useState("todos");
  const [servicoId, setServicoId] = useState("nenhum");
  const [filtro, setFiltro] = useState<"nao_lidos" | "lidos" | "todos">("nao_lidos");
  const [mesFiltro, setMesFiltro] = useState<"atual" | "todos">("atual");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Aviso | null>(null);
  const [editando, setEditando] = useState<Aviso | null>(null);

  const { data: mecanicos } = useQuery({
    queryKey: ["mecanicos-ativos-avisos"],
    enabled: isGerente,
    queryFn: async () => {
      const { data, error } = await db.from("mecanicos").select("id, nome").is("deleted_at", null).eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: servicos } = useQuery<Servico[]>({
    queryKey: ["avisos-servicos-abertos"],
    enabled: isGerente,
    queryFn: async () => {
      const { data, error } = await db.from("atendimento_servicos").select("id, nome, atendimento_id, atendimentos(numero, placa, cliente_nome)").neq("status", "concluido").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: avisos, isLoading, error } = useQuery<Aviso[]>({
    queryKey: ["avisos", user?.id, role, mesFiltro],
    enabled: !!user,
    queryFn: async () => {
      const { data, error: queryError } = await db.from("avisos").select("*, aviso_leituras(id, user_id, user_nome, lido_at), mecanicos(nome), atendimento_servicos(nome, atendimentos(numero, placa, cliente_nome))").order("created_at", { ascending: false }).limit(300);
      if (queryError) throw queryError;
      return data ?? [];
    },
  });

  const visiveis = useMemo(() => (avisos ?? []).filter((a) => {
    const leitura = (a.aviso_leituras ?? []).some((l) => l.user_id === user?.id);
    const texto = `${a.mensagem} ${a.mecanicos?.nome ?? ""} ${a.atendimento_servicos?.nome ?? ""} ${a.atendimento_servicos?.atendimentos?.placa ?? ""}`.toLowerCase();
    const mesAtual = a.mes_referencia === `${new Date().toISOString().slice(0, 7)}-01`;
    return (mesFiltro === "todos" || mesAtual) && (filtro === "todos" || (filtro === "nao_lidos" ? !leitura : leitura)) && texto.includes(busca.trim().toLowerCase());
  }), [avisos, busca, filtro, mesFiltro, user?.id]);

  const publicar = useMutation({
    mutationFn: async () => {
      const servico = servicos?.find((s) => s.id === servicoId);
      const { error } = await db.from("avisos").insert({ mensagem: mensagem.trim(), mecanico_id: destino === "todos" ? null : destino, atendimento_id: servico?.atendimento_id ?? null, atendimento_servico_id: servico?.id ?? null, criado_por: user?.id ?? null, criado_por_nome: nome, mes_referencia: new Date().toISOString().slice(0, 7) + "-01" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Aviso publicado"); setMensagem(""); setServicoId("nenhum"); void qc.invalidateQueries({ queryKey: ["avisos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmar = useMutation({
    mutationFn: async (avisoId: string) => { const { error } = await db.from("aviso_leituras").upsert({ aviso_id: avisoId, user_id: user!.id, user_nome: nome }, { onConflict: "aviso_id,user_id" }); if (error) throw error; },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["avisos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => { const { error } = await db.from("avisos").update({ mensagem: texto.trim(), editado_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { setEditando(null); toast.success("Aviso editado"); void qc.invalidateQueries({ queryKey: ["avisos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("avisos").update({ excluido_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { setAberto(null); toast.success("Aviso removido da lista"); void qc.invalidateQueries({ queryKey: ["avisos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirAviso = (aviso: Aviso) => { setAberto(aviso); if (!(aviso.aviso_leituras ?? []).some((l) => l.user_id === user?.id)) confirmar.mutate(aviso.id); };
  const naoLidos = (avisos ?? []).filter((a) => !(a.aviso_leituras ?? []).some((l) => l.user_id === user?.id)).length;

  return <AppShell>
    <PageHeader title="Avisos de serviço" subtitle="Orientações da gerência relacionadas aos serviços da oficina" />
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {isGerente && <div className="card-surface space-y-3 p-5"><h2 className="font-display text-xl font-bold uppercase">Novo aviso</h2><div className="space-y-1.5"><Label>Destinatário</Label><Select value={destino} onValueChange={setDestino}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Toda a equipe</SelectItem>{(mecanicos ?? []).map((m: { id: string; nome: string }) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Serviço relacionado (opcional)</Label><Select value={servicoId} onValueChange={setServicoId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nenhum">Aviso geral</SelectItem>{(servicos ?? []).map((s) => <SelectItem key={s.id} value={s.id}>OS #{s.atendimentos?.numero ?? "—"} · {s.nome} · {s.atendimentos?.placa ?? "sem placa"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: revisar o óleo antes da entrega" /></div><Button className="w-full" disabled={!mensagem.trim() || publicar.isPending} onClick={() => publicar.mutate()}><i className="fa-solid fa-bullhorn" /> Publicar aviso</Button></div>}
      <div className="space-y-3"><div className="flex flex-wrap gap-2"><Input className="min-w-[220px] flex-1" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aviso, serviço ou placa..." /><Button size="sm" variant={filtro === "nao_lidos" ? "default" : "outline"} onClick={() => setFiltro("nao_lidos")}>Não lidos {naoLidos > 0 && <Badge variant="secondary" className="ml-1">{naoLidos}</Badge>}</Button><Button size="sm" variant={filtro === "lidos" ? "default" : "outline"} onClick={() => setFiltro("lidos")}>Lidos</Button><Button size="sm" variant={filtro === "todos" ? "default" : "outline"} onClick={() => setFiltro("todos")}>Todos</Button><Button size="sm" variant={mesFiltro === "atual" ? "default" : "outline"} onClick={() => setMesFiltro("atual")}>Este mês</Button><Button size="sm" variant={mesFiltro === "todos" ? "default" : "outline"} onClick={() => setMesFiltro("todos")}>Histórico</Button></div>{isLoading && <p className="text-sm text-muted-foreground">Carregando avisos...</p>}{error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar os avisos: {(error as Error).message}</p>}{visiveis.map((a) => { const lido = (a.aviso_leituras ?? []).some((l) => l.user_id === user?.id); const destinoLabel = a.mecanicos?.nome ? `para ${a.mecanicos.nome}` : "para toda a equipe"; return <div key={a.id} className={`card-surface flex flex-wrap items-start justify-between gap-4 p-5 ${!lido ? "border-primary/40 bg-primary/5" : ""}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{!lido && <Badge>Novo</Badge>}{a.atendimento_servicos?.nome && <Badge variant="outline"><i className="fa-solid fa-screwdriver-wrench mr-1" /> {a.atendimento_servicos.nome}</Badge>}<p className="line-clamp-2 whitespace-pre-wrap">{a.mensagem}</p></div><p className="mt-2 text-xs text-muted-foreground">{a.criado_por_nome ?? "Gerência"} · {dt(a.created_at)} · {destinoLabel}{a.editado_at ? " · editado" : ""}</p>{a.atendimento_servicos?.atendimentos && <p className="mt-1 text-xs text-muted-foreground">OS #{a.atendimento_servicos.atendimentos.numero ?? "—"} · {a.atendimento_servicos.atendimentos.placa ?? "sem placa"}</p>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => abrirAviso(a)}><i className="fa-solid fa-folder-open" /> Abrir</Button>{isGerente && <Button size="sm" variant="ghost" onClick={() => setEditando(a)}><i className="fa-solid fa-pen" /></Button>}{isGerente && <ConfirmActionDialog trigger={<Button size="sm" variant="ghost" title="Excluir aviso"><i className="fa-solid fa-trash" /></Button>} title="Excluir aviso" description="O aviso será ocultado, mas a leitura e o histórico técnico serão preservados." confirmLabel="Excluir" destructive onConfirm={() => excluir.mutateAsync(a.id)} />}</div></div>; })}{!isLoading && visiveis.length === 0 && <div className="card-surface p-12 text-center text-muted-foreground"><i className="fa-solid fa-bullhorn mb-3 text-3xl" /><p>Nenhum aviso neste filtro.</p></div>}</div>
    </div>
    {aberto && <Dialog open onOpenChange={(open) => !open && setAberto(null)}><DialogContent><DialogHeader><DialogTitle>Aviso de serviço</DialogTitle></DialogHeader><div className="space-y-3"><div className="rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{aberto.mensagem}</div><p className="text-xs text-muted-foreground">{aberto.criado_por_nome ?? "Gerência"} · {dt(aberto.created_at)}{aberto.editado_at ? " · editado" : ""}</p>{aberto.aviso_leituras && aberto.aviso_leituras.length > 0 && <p className="border-t pt-3 text-xs text-muted-foreground">Leram: {aberto.aviso_leituras.map((l) => l.user_nome ?? "Usuário").join(", ")}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setAberto(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>}
    {editando && <EditarAvisoDialog aviso={editando} saving={editar.isPending} onClose={() => setEditando(null)} onSave={(texto) => editar.mutate({ id: editando.id, texto })} />}
  </AppShell>;
}

function EditarAvisoDialog({ aviso, saving, onClose, onSave }: { aviso: Aviso; saving: boolean; onClose: () => void; onSave: (texto: string) => void }) { const [texto, setTexto] = useState(aviso.mensagem); return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Editar aviso</DialogTitle></DialogHeader><Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} /><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!texto.trim() || saving} onClick={() => onSave(texto)}>Salvar</Button></DialogFooter></DialogContent></Dialog>; }
