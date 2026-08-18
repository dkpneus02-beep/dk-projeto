import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
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
import { d, diasEntre, matches, whatsappLink } from "@/lib/format";
import { isGerente } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Retornos de clientes | DK Auto Center" },
      {
        name: "description",
        content: "Acompanhamento de retornos, revisões e contatos da oficina.",
      },
      { property: "og:title", content: "Retornos de clientes | DK Auto Center" },
      { property: "og:description", content: "Follow-up organizado de clientes da oficina." },
    ],
  }),
  component: Notificacoes,
});

type Retorno = Tables<"notificacoes_retorno"> & { excluido_at?: string | null };
type ContatoRetorno = {
  id: string;
  retorno_id: string;
  resultado: string;
  observacao: string | null;
  contatado_em: string;
  contatado_por_nome: string | null;
};

const resultadoContatoLabel: Record<string, string> = {
  contatado_agendou: "Cliente contatado e agendou",
  contatado_nao_quis: "Cliente contatado, mas não quis",
  nao_atendeu: "Não atendeu",
  numero_invalido: "Número inválido",
  sem_contato: "Ainda não contatado",
  outro: "Outro resultado",
};

function dtCurta(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function Notificacoes() {
  const qc = useQueryClient();
  const { role, user, nome } = useAuth();
  const gerente = isGerente(role);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("pendente");
  const [somenteVencidos, setSomenteVencidos] = useState(false);
  const [editando, setEditando] = useState<Retorno | null>(null);
  const [contatoAberto, setContatoAberto] = useState<Retorno | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["retornos"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("notificacoes_retorno")
        .select("*")
        .is("excluido_at", null)
        .order("vencimento", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  const { data: contatos } = useQuery<ContatoRetorno[]>({
    queryKey: ["retorno-contatos"],
    enabled: gerente,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("notificacoes_retorno_contatos")
        .select("id, retorno_id, resultado, observacao, contatado_em, contatado_por_nome")
        .order("contatado_em", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("notificacoes_retorno").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === "concluido" ? "Retorno marcado como resolvido" : "Retorno reaberto");
      void qc.invalidateQueries({ queryKey: ["retornos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("notificacoes_retorno")
        .update({ excluido_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retorno ocultado com segurança.");
      void qc.invalidateQueries({ queryKey: ["retornos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const registrarContato = useMutation({
    mutationFn: async ({ retornoId, resultado, observacao }: { retornoId: string; resultado: string; observacao: string }) => {
      if (!user?.id) throw new Error("Sessão do gerente não encontrada.");
      const { error } = await (supabase as any).from("notificacoes_retorno_contatos").insert({
        retorno_id: retornoId,
        resultado,
        observacao: observacao.trim() || null,
        contatado_por: user.id,
        contatado_por_nome: nome || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato registrado com data, horário e responsável.");
      setContatoAberto(null);
      void qc.invalidateQueries({ queryKey: ["retorno-contatos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"notificacoes_retorno"> }) => {
      const { error } = await supabase.from("notificacoes_retorno").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retorno atualizado");
      setEditando(null);
      void qc.invalidateQueries({ queryKey: ["retornos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const registros = useMemo(() => {
    return (data ?? []).filter((n) => {
      const dias = diasEntre(n.vencimento);
      const statusOk = statusFiltro === "todos" || n.status === statusFiltro;
      const vencidoOk = !somenteVencidos || (n.status === "pendente" && dias <= 0);
      const buscaOk = matches(busca, [n.cliente_nome, n.telefone, n.veiculo, n.servico]);
      return statusOk && vencidoOk && buscaOk;
    });
  }, [data, busca, statusFiltro, somenteVencidos]);

  const pendentes = (data ?? []).filter((n) => n.status === "pendente");
  const vencidos = pendentes.filter((n) => diasEntre(n.vencimento) <= 0);
  const resolvidos = (data ?? []).filter((n) => n.status === "concluido");

  return (
    <AppShell>
      <PageHeader
        title="Retornos de clientes"
        subtitle={`${vencidos.length} vencidos · ${pendentes.length} pendentes · ${resolvidos.length} resolvidos`}
      />

      <div className="card-surface mb-5 space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_190px_auto]">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, telefone, veículo ou serviço..."
            aria-label="Buscar retornos"
          />
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger aria-label="Filtrar retornos por status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="concluido">Resolvidos</SelectItem>
              <SelectItem value="todos">Todos os retornos</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={somenteVencidos ? "default" : "outline"}
            onClick={() => setSomenteVencidos((current) => !current)}
          >
            <i className="fa-solid fa-triangle-exclamation" /> Apenas vencidos
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A prioridade é calculada automaticamente: retornos vencidos ficam em destaque; os demais mostram quantos dias faltam.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando retornos…</p>}
      <div className="space-y-3">
        {registros.map((n) => {
          const dias = diasEntre(n.vencimento);
          const pendente = n.status === "pendente";
          const vencido = pendente && dias <= 0;
          return (
            <div key={n.id} className={`card-surface flex flex-wrap items-center justify-between gap-4 p-4 ${vencido ? "border-destructive/60" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{n.cliente_nome}</p>
                  <Badge variant={vencido ? "destructive" : pendente ? "secondary" : "outline"}>
                    {vencido ? `Prioridade alta · vencido há ${Math.abs(dias)} dias` : pendente ? `Faltam ${dias} dias` : "Resolvido"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Veículo: {n.veiculo || "não informado"}</p>
                <p className="text-sm text-muted-foreground">Serviço: {n.servico} · Data prevista: {d(n.vencimento)}</p>
                {n.telefone && <p className="text-xs text-muted-foreground">Telefone: {n.telefone}</p>}
                {(() => {
                  const ultimoContato = (contatos ?? []).find((contato) => contato.retorno_id === n.id);
                  return ultimoContato ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Último contato: {resultadoContatoLabel[ultimoContato.resultado] ?? ultimoContato.resultado} em {dtCurta(ultimoContato.contatado_em)}{ultimoContato.contatado_por_nome ? ` por ${ultimoContato.contatado_por_nome}` : ""}
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendente && n.telefone && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={whatsappLink(n.telefone, `Olá ${n.cliente_nome}! Aqui é da DK Auto Center. Já faz um tempo desde o serviço de ${n.servico} no seu ${n.veiculo || "veículo"}. Que tal agendar uma revisão?`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fa-brands fa-whatsapp" /> Avisar
                    </a>
                  </Button>
                )}
                {gerente && (
                  <Button variant="outline" size="sm" onClick={() => setEditando(n)}>
                    <i className="fa-solid fa-pen-to-square" /> Editar
                  </Button>
                )}
                {gerente && (
                  <Button variant="outline" size="sm" onClick={() => setContatoAberto(n)}>
                    <i className="fa-solid fa-phone" /> Registrar contato
                  </Button>
                )}
                {gerente && (
                  <Button
                    size="sm"
                    variant={pendente ? "ghost" : "outline"}
                    onClick={() => marcar.mutate({ id: n.id, status: pendente ? "concluido" : "pendente" })}
                    disabled={marcar.isPending}
                  >
                    <i className={`fa-solid ${pendente ? "fa-check" : "fa-rotate-left"}`} /> {pendente ? "Resolver" : "Reabrir"}
                  </Button>
                )}
                {gerente && (
                  <ConfirmActionDialog
                    trigger={<button className="text-muted-foreground hover:text-destructive" title="Excluir retorno de teste"><i className="fa-solid fa-trash-can" /></button>}
                    title="Excluir retorno"
                    description={<>Tem certeza absoluta de que deseja ocultar o retorno de <strong className="text-foreground">{n.cliente_nome}</strong>? O registro não será apagado do banco, apenas retirado da lista.</>}
                    confirmLabel="Sim, excluir retorno"
                    destructive
                    onConfirm={() => excluir.mutateAsync(n.id)}
                  />
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && registros.length === 0 && (
          <div className="card-surface p-12 text-center text-muted-foreground">
            <i className="fa-solid fa-bell-slash mb-3 text-3xl" />
            <p>Nenhum retorno encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>

      {gerente && contatoAberto && (
        <RegistrarContatoDialog
          retorno={contatoAberto}
          open
          saving={registrarContato.isPending}
          onClose={() => setContatoAberto(null)}
          onSave={(resultado, observacao) => registrarContato.mutate({ retornoId: contatoAberto.id, resultado, observacao })}
        />
      )}

      {gerente && editando && (
        <EditarRetornoDialog
          retorno={editando}
          open
          saving={editar.isPending}
          onClose={() => setEditando(null)}
          onSave={(patch) => editar.mutate({ id: editando.id, patch })}
        />
      )}
    </AppShell>
  );
}

function RegistrarContatoDialog({
  retorno,
  open,
  saving,
  onClose,
  onSave,
}: {
  retorno: Retorno;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (resultado: string, observacao: string) => void;
}) {
  const [resultado, setResultado] = useState("sem_contato");
  const [observacao, setObservacao] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Registrar contato</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {retorno.cliente_nome} · {retorno.telefone || "telefone não informado"}. A data, o horário e o usuário serão gravados automaticamente.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Resultado do contato</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(resultadoContatoLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observação do contato</Label>
            <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Ex.: Cliente informou que não deseja realizar o retorno neste momento." rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => onSave(resultado, observacao)} disabled={saving}>
            {saving && <i className="fa-solid fa-circle-notch fa-spin" />} Salvar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarRetornoDialog({
  retorno,
  open,
  saving,
  onClose,
  onSave,
}: {
  retorno: Retorno;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: TablesUpdate<"notificacoes_retorno">) => void;
}) {
  const [form, setForm] = useState({
    cliente_nome: retorno.cliente_nome,
    telefone: retorno.telefone ?? "",
    veiculo: retorno.veiculo ?? "",
    servico: retorno.servico,
    vencimento: retorno.vencimento,
  });

  useEffect(() => {
    setForm({
      cliente_nome: retorno.cliente_nome,
      telefone: retorno.telefone ?? "",
      veiculo: retorno.veiculo ?? "",
      servico: retorno.servico,
      vencimento: retorno.vencimento,
    });
  }, [retorno]);

  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Editar retorno</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Cliente</Label><Input value={form.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Veículo</Label><Input value={form.veiculo} onChange={(e) => set("veiculo", e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Serviço</Label><Input value={form.servico} onChange={(e) => set("servico", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Data prevista</Label><Input type="date" value={form.vencimento} onChange={(e) => set("vencimento", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={() => onSave({
              cliente_nome: form.cliente_nome.trim(),
              telefone: form.telefone.trim() || null,
              veiculo: form.veiculo.trim() || null,
              servico: form.servico.trim(),
              vencimento: form.vencimento,
            })}
            disabled={saving || !form.cliente_nome.trim() || !form.servico.trim() || !form.vencimento}
          >
            {saving && <i className="fa-solid fa-circle-notch fa-spin" />}
            Salvar retorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
