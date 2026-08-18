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

type Retorno = Tables<"notificacoes_retorno">;

function Notificacoes() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const gerente = isGerente(role);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("pendente");
  const [somenteVencidos, setSomenteVencidos] = useState(false);
  const [editando, setEditando] = useState<Retorno | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["retornos"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("notificacoes_retorno")
        .select("*")
        .order("vencimento", { ascending: true })
        .order("created_at", { ascending: false });
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
                  <Button
                    size="sm"
                    variant={pendente ? "ghost" : "outline"}
                    onClick={() => marcar.mutate({ id: n.id, status: pendente ? "concluido" : "pendente" })}
                    disabled={marcar.isPending}
                  >
                    <i className={`fa-solid ${pendente ? "fa-check" : "fa-rotate-left"}`} /> {pendente ? "Resolver" : "Reabrir"}
                  </Button>
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
