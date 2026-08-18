import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { dt } from "@/lib/format";
import { isGerente } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { pedirPermissaoNotificacoes } from "@/hooks/useAlertas";

export const Route = createFileRoute("/notificacoes-internas")({
  head: () => ({
    meta: [
      { title: "Notificações internas | DK Auto Center" },
      { name: "description", content: "Conversas e lembretes entre gerente e mecânicos." },
    ],
  }),
  component: NotificacoesInternas,
});

const VAPID_PUBLIC_KEY = "BACQ9HGaG3flAmuhcGW0-cykikhDXlyWO6QKeGhnEqtrHHP_GoenMIIrVRPQT9AqW2bbnChaqNWONV-rygFPSFY";
const db = supabase as any;

type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  destinatario_user_id: string;
  atendimento_id: string | null;
  atendimento_servico_id: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  lido_at: string | null;
  arquivado_at: string | null;
  thread_id: string;
  reply_to_id: string | null;
  editado_at: string | null;
  excluido_at: string | null;
  mes_referencia: string;
};

type Destinatario = { id: string; nome: string; user_id: string };
type ServicoOption = { id: string; nome: string; atendimento_id: string; atendimentos?: { numero?: number; cliente_nome?: string; placa?: string } | null };

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function NotificacoesInternas() {
  const { user, role, nome } = useAuth();
  const gerente = isGerente(role);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<"nao_lidas" | "todas" | "lidas">("nao_lidas");
  const [mesFiltro, setMesFiltro] = useState<"atual" | "todos">("atual");
  const [permissao, setPermissao] = useState("unsupported");
  const [pushStatus, setPushStatus] = useState<"idle" | "ativando" | "ativo" | "erro">("idle");
  const [destinatarioId, setDestinatarioId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState("mensagem");
  const [servicoId, setServicoId] = useState("nenhum");
  const [aberta, setAberta] = useState<Notificacao | null>(null);
  const [editando, setEditando] = useState<Notificacao | null>(null);
  const [responder, setResponder] = useState<Notificacao | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPermissao(Notification.permission);
  }, []);

  const { data: destinatarios } = useQuery<Destinatario[]>({
    queryKey: ["notificacao-destinatarios", role],
    enabled: !!user,
    queryFn: async () => {
      if (gerente) {
        const { data, error } = await db.from("mecanicos").select("id, nome, user_id").is("deleted_at", null).eq("ativo", true).order("nome");
        if (error) throw error;
        return (data ?? []).filter((m: Destinatario) => m.user_id);
      }
      const { data: roles, error: rolesError } = await db.from("user_roles").select("user_id").eq("role", "gerente");
      if (rolesError) throw rolesError;
      const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await db.from("profiles").select("id, nome").in("id", ids).order("nome");
      if (error) throw error;
      return (data ?? []).map((p: { id: string; nome: string }) => ({ id: p.id, user_id: p.id, nome: p.nome || "Gerência" }));
    },
  });

  const { data: servicos } = useQuery<ServicoOption[]>({
    queryKey: ["notificacao-servicos-abertos"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await db.from("atendimento_servicos").select("id, nome, atendimento_id, atendimentos(numero, cliente_nome, placa)").neq("status", "concluido").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!destinatarioId && destinatarios?.[0]) setDestinatarioId(destinatarios[0].user_id);
  }, [destinatarios, destinatarioId]);

  const ativarNotificacoes = async () => {
    setPushStatus("ativando");
    try {
      const resultado = await pedirPermissaoNotificacoes();
      setPermissao(resultado);
      if (resultado !== "granted") { setPushStatus("idle"); if (resultado === "denied") toast.error("Permissão negada. A conversa continuará funcionando dentro do sistema."); return; }
      if (!user?.id || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este navegador não oferece Web Push compatível.");
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const current = await registration.pushManager.getSubscription();
      const subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) });
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("O navegador não retornou uma subscription completa.");
      const { error } = await db.from("webpush_subscriptions").upsert({ user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent, device_label: /Android/i.test(navigator.userAgent) ? "Celular Android" : "Navegador atual", ativo: true, ultimo_erro_at: null }, { onConflict: "endpoint" });
      if (error) throw error;
      setPushStatus("ativo");
      toast.success("Este dispositivo foi ativado para alertas em segundo plano");
    } catch (error) { setPushStatus("erro"); toast.error(error instanceof Error ? error.message : "Não foi possível ativar o alerta no celular."); }
  };

  const { data, isLoading, error } = useQuery<Notificacao[]>({
    queryKey: ["notificacoes-internas", user?.id, role, filtro, mesFiltro],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error: queryError } = await db.from("notificacoes_internas").select("id, tipo, titulo, mensagem, destinatario_user_id, atendimento_id, atendimento_servico_id, criado_por, criado_por_nome, created_at, lido_at, arquivado_at, thread_id, reply_to_id, editado_at, excluido_at, mes_referencia").is("excluido_at", null).order("created_at", { ascending: false }).limit(300);
      if (queryError) throw queryError;
      return (rows ?? []) as Notificacao[];
    },
  });

  const visiveis = useMemo(() => (data ?? []).filter((n) => {
    const mesAtual = n.mes_referencia === new Date().toISOString().slice(0, 7) + "-01";
    const statusOk = filtro === "todas" || (filtro === "nao_lidas" ? !n.lido_at && n.destinatario_user_id === user?.id : !!n.lido_at);
    return (mesFiltro === "todos" || mesAtual) && statusOk;
  }), [data, filtro, mesFiltro, user?.id]);

  const enviar = useMutation({
    mutationFn: async ({ destinatario, tituloEnvio, mensagemEnvio, threadId, replyTo }: { destinatario: string; tituloEnvio: string; mensagemEnvio: string; threadId?: string; replyTo?: string }) => {
      const servico = servicos?.find((s) => s.id === servicoId);
      const { error } = await db.rpc("enviar_notificacao_manual", { _destinatario_user_id: destinatario, _titulo: tituloEnvio, _mensagem: mensagemEnvio, _tipo: tipo, _atendimento_id: servico?.atendimento_id ?? null, _atendimento_servico_id: servico?.id ?? null, _thread_id: threadId ?? null, _reply_to_id: replyTo ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setTitulo(""); setMensagem(""); setResponder(null); setServiçoIdSeguro(); toast.success("Mensagem enviada"); void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setServiçoIdSeguro = () => setServicoId("nenhum");

  const marcarLeitura = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("notificacoes_internas").update({ lido_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] }); void qc.invalidateQueries({ queryKey: ["notificacoes-internas-pendentes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editarMensagem = useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => { const { error } = await db.from("notificacoes_internas").update({ mensagem: texto.trim(), editado_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { setEditando(null); toast.success("Mensagem editada"); void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMensagem = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("notificacoes_internas").update({ excluido_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { setAberta(null); toast.success("Mensagem removida da central"); void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirMensagem = (n: Notificacao) => {
    setAberta(n);
    if (n.destinatario_user_id === user?.id && !n.lido_at) marcarLeitura.mutate(n.id);
  };

  const pendentes = (data ?? []).filter((n) => n.destinatario_user_id === user?.id && !n.lido_at && !n.excluido_at).length;
  const nomeDestinatario = (id: string) => destinatarios?.find((d) => d.user_id === id)?.nome ?? "Usuário";

  return (
    <AppShell>
      <PageHeader title="Notificações" subtitle="Conversa direta entre gerente e mecânicos">
        <div className="flex flex-wrap items-center gap-2">
          {pushStatus === "ativo" ? <Badge variant="secondary"><i className="fa-solid fa-bell mr-1" /> Celular ativado</Badge> : <Button size="sm" variant="outline" disabled={pushStatus === "ativando"} onClick={() => void ativarNotificacoes()}><i className="fa-solid fa-bell mr-1" /> {pushStatus === "ativando" ? "Ativando..." : "Ativar alerta no celular"}</Button>}
          <Button size="sm" variant={filtro === "nao_lidas" ? "default" : "outline"} onClick={() => setFiltro("nao_lidas")}>Não lidas {pendentes > 0 && <Badge variant="secondary" className="ml-1">{pendentes}</Badge>}</Button>
          <Button size="sm" variant={filtro === "lidas" ? "default" : "outline"} onClick={() => setFiltro("lidas")}>Lidas</Button>
          <Button size="sm" variant={filtro === "todas" ? "default" : "outline"} onClick={() => setFiltro("todas")}>Todas</Button>
          <Button size="sm" variant={mesFiltro === "atual" ? "default" : "outline"} onClick={() => setMesFiltro("atual")}>Este mês</Button>
          <Button size="sm" variant={mesFiltro === "todos" ? "default" : "outline"} onClick={() => setMesFiltro("todos")}>Histórico</Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        {gerente ? (
          <div className="card-surface space-y-3 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Nova mensagem para o mecânico</h2>
            <div className="space-y-1.5"><Label>Destinatário</Label><Select value={destinatarioId} onValueChange={setDestinatarioId}><SelectTrigger><SelectValue placeholder="Escolha o mecânico" /></SelectTrigger><SelectContent>{(destinatarios ?? []).map((d) => <SelectItem key={d.user_id} value={d.user_id}>{d.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Tipo</Label><Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mensagem">Mensagem</SelectItem><SelectItem value="lembrete_servico">Lembrete de serviço</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Vincular a serviço (opcional)</Label><Select value={servicoId} onValueChange={setServicoId}><SelectTrigger><SelectValue placeholder="Mensagem geral" /></SelectTrigger><SelectContent><SelectItem value="nenhum">Mensagem geral</SelectItem>{(servicos ?? []).map((s) => <SelectItem key={s.id} value={s.id}>OS #{s.atendimentos?.numero ?? "—"} · {s.nome} · {s.atendimentos?.placa ?? "sem placa"}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: revisar o veículo da OS 104" /></div>
            <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva a mensagem..." /></div>
            <Button className="w-full" disabled={!destinatarioId || !titulo.trim() || !mensagem.trim() || enviar.isPending} onClick={() => enviar.mutate({ destinatario: destinatarioId, tituloEnvio: titulo, mensagemEnvio: mensagem })}><i className="fa-solid fa-paper-plane" /> Enviar para o mecânico</Button>
          </div>
        ) : (
          <div className="card-surface p-5"><h2 className="font-display text-xl font-bold uppercase">Mensagens da gerência</h2><p className="mt-2 text-sm text-muted-foreground">Você recebe mensagens e lembretes da gerência aqui. Abra uma mensagem para registrar a leitura e, se necessário, responda na mesma conversa.</p></div>
        )}

        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando mensagens...</p>}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar as mensagens: {(error as Error).message}</p>}
          {visiveis.map((n) => {
            const souDestinatario = n.destinatario_user_id === user?.id;
            const souRemetente = n.criado_por === user?.id;
            return <div key={n.id} className={`card-surface flex flex-wrap items-start justify-between gap-4 p-4 ${souDestinatario && !n.lido_at ? "border-primary/40 bg-primary/5" : ""}`}>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{n.titulo}</p>{souDestinatario && !n.lido_at && <Badge>Nova</Badge>}{n.tipo === "lembrete_servico" && <Badge variant="outline">Serviço</Badge>}</div><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.mensagem}</p><p className="mt-2 text-xs text-muted-foreground">{souRemetente ? `Para ${nomeDestinatario(n.destinatario_user_id)}` : `De ${n.criado_por_nome ?? "gerência"}`} · {dt(n.created_at)}{n.editado_at ? " · editada" : ""}{n.lido_at ? ` · lida em ${dt(n.lido_at)}` : " · não lida"}</p></div>
              <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => abrirMensagem(n)}><i className="fa-solid fa-folder-open" /> Abrir</Button>{n.atendimento_id && <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/atendimento/$id", params: { id: n.atendimento_id! } })}>Abrir OS</Button>}{gerente && <Button size="sm" variant="ghost" onClick={() => setEditando(n)}><i className="fa-solid fa-pen" /></Button>}{gerente && <ConfirmActionDialog trigger={<Button size="sm" variant="ghost" title="Excluir mensagem"><i className="fa-solid fa-trash" /></Button>} title="Excluir mensagem" description="A mensagem será ocultada da central, sem apagar o registro técnico." confirmLabel="Excluir" destructive onConfirm={() => excluirMensagem.mutateAsync(n.id)} />}</div>
            </div>;
          })}
          {!isLoading && visiveis.length === 0 && <div className="card-surface p-12 text-center text-muted-foreground"><i className="fa-solid fa-comments mb-3 text-3xl" /><p>Nenhuma mensagem neste filtro.</p><Link to="/avisos" className="mt-2 inline-block text-sm text-primary hover:underline">Ver avisos de serviço</Link></div>}
        </div>
      </div>

      {aberta && <Dialog open onOpenChange={(open) => !open && setAberta(null)}><DialogContent><DialogHeader><DialogTitle>{aberta.titulo}</DialogTitle></DialogHeader><div className="space-y-3"><div className="rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{aberta.mensagem}</div><p className="text-xs text-muted-foreground">{aberta.criado_por_nome ?? "Usuário"} · {dt(aberta.created_at)}{aberta.lido_at ? ` · lida em ${dt(aberta.lido_at)}` : " · aguardando leitura do destinatário"}</p></div><DialogFooter><Button variant="outline" onClick={() => setResponder(aberta)}>Responder</Button>{aberta.atendimento_id && <Button onClick={() => void navigate({ to: "/atendimento/$id", params: { id: aberta.atendimento_id! } })}>Abrir OS</Button>}</DialogFooter></DialogContent></Dialog>}
      {editando && <EditarMensagemDialog mensagem={editando} onClose={() => setEditando(null)} saving={editarMensagem.isPending} onSave={(texto) => editarMensagem.mutate({ id: editando.id, texto })} />}
      {responder && <ResponderDialog mensagem={responder} destinatario={responder.criado_por === user?.id ? responder.destinatario_user_id : responder.criado_por ?? ""} saving={enviar.isPending} onClose={() => setResponder(null)} onSend={(texto) => enviar.mutate({ destinatario: responder.criado_por === user?.id ? responder.destinatario_user_id : responder.criado_por ?? "", tituloEnvio: `Re: ${responder.titulo}`, mensagemEnvio: texto, threadId: responder.thread_id, replyTo: responder.id })} />}
    </AppShell>
  );
}

function EditarMensagemDialog({ mensagem, onClose, saving, onSave }: { mensagem: Notificacao; onClose: () => void; saving: boolean; onSave: (texto: string) => void }) {
  const [texto, setTexto] = useState(mensagem.mensagem);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Editar mensagem</DialogTitle></DialogHeader><Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} /><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!texto.trim() || saving} onClick={() => onSave(texto)}>Salvar</Button></DialogFooter></DialogContent></Dialog>;
}

function ResponderDialog({ mensagem, destinatario, saving, onClose, onSend }: { mensagem: Notificacao; destinatario: string; saving: boolean; onClose: () => void; onSend: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Responder: {mensagem.titulo}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">A resposta ficará na mesma conversa e será enviada ao outro participante.</p><Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva sua resposta..." /><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!destinatario || !texto.trim() || saving} onClick={() => onSend(texto)}>Enviar resposta</Button></DialogFooter></DialogContent></Dialog>;
}
