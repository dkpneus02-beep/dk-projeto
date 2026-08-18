import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dt } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { pedirPermissaoNotificacoes } from "@/hooks/useAlertas";

export const Route = createFileRoute("/notificacoes-internas")({
  head: () => ({
    meta: [
      { title: "Notificações internas | DK Auto Center" },
      { name: "description", content: "Eventos e tarefas da equipe da oficina." },
    ],
  }),
  component: NotificacoesInternas,
});

type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  atendimento_id: string | null;
  criado_por_nome: string | null;
  created_at: string;
  lido_at: string | null;
  arquivado_at: string | null;
};

function NotificacoesInternas() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");
  const [permissao, setPermissao] = useState<string>("unsupported");
  const db = supabase as any;

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPermissao(Notification.permission);
  }, []);

  const ativarNotificacoes = async () => {
    const resultado = await pedirPermissaoNotificacoes();
    setPermissao(resultado);
    if (resultado === "granted") toast.success("Notificações do navegador ativadas");
    else if (resultado === "denied") toast.error("Permissão negada. A central interna continuará funcionando.");
  };

  const { data, isLoading, error } = useQuery<Notificacao[]>({
    queryKey: ["notificacoes-internas", user?.id, role, filtro],
    enabled: !!user,
    queryFn: async () => {
      let query = db
        .from("notificacoes_internas")
        .select("id, tipo, titulo, mensagem, atendimento_id, criado_por_nome, created_at, lido_at, arquivado_at")
        .is("arquivado_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (filtro === "pendentes") query = query.is("lido_at", null);
      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      return (rows ?? []) as Notificacao[];
    },
  });

  const marcar = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await db
        .from("notificacoes_internas")
        .update({ lido_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] });
      void qc.invalidateQueries({ queryKey: ["notificacoes-internas-pendentes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await db
        .from("notificacoes_internas")
        .update({ arquivado_at: new Date().toISOString(), lido_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = data?.filter((n) => !n.lido_at).length ?? 0;

  return (
    <AppShell>
      <PageHeader title="Notificações internas" subtitle="Tarefas e eventos da equipe">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {permissao === "granted" ? (
            <Badge variant="secondary"><i className="fa-solid fa-bell mr-1" /> Navegador ativado</Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void ativarNotificacoes()}>
              <i className="fa-solid fa-bell mr-1" /> Ativar alerta no navegador
            </Button>
          )}
          <div className="flex items-center gap-2">
          <Button size="sm" variant={filtro === "pendentes" ? "default" : "outline"} onClick={() => setFiltro("pendentes")}>
            Pendentes {pendentes > 0 && <Badge variant="secondary" className="ml-1">{pendentes}</Badge>}
          </Button>
            <Button size="sm" variant={filtro === "todas" ? "default" : "outline"} onClick={() => setFiltro("todas")}>
              Todas
            </Button>
          </div>
        </div>
      </PageHeader>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando notificações...</p>}
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível carregar as notificações: {(error as Error).message}</p>}

      <div className="space-y-3">
        {(data ?? []).map((n) => (
          <div key={n.id} className={`card-surface flex flex-wrap items-start justify-between gap-4 p-4 ${!n.lido_at ? "border-primary/40 bg-primary/5" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{n.titulo}</p>
                {!n.lido_at && <Badge variant="default">Novo</Badge>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.mensagem}</p>
              <p className="mt-2 text-xs text-muted-foreground">{dt(n.created_at)}{n.criado_por_nome ? ` · ${n.criado_por_nome}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!n.lido_at && <Button size="sm" variant="outline" disabled={marcar.isPending} onClick={() => marcar.mutate(n.id)}>Marcar como lida</Button>}
              {n.atendimento_id && <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/atendimento/$id", params: { id: n.atendimento_id! } })}>Abrir OS</Button>}
              <Button size="sm" variant="ghost" onClick={() => arquivar.mutate(n.id)}>Arquivar</Button>
            </div>
          </div>
        ))}
        {!isLoading && (data ?? []).length === 0 && (
          <div className="card-surface p-12 text-center text-muted-foreground">
            <i className="fa-solid fa-bell-slash mb-3 text-3xl" />
            <p>Nenhuma notificação {filtro === "pendentes" ? "pendente" : "encontrada"}.</p>
            <Link to="/avisos" className="mt-2 inline-block text-sm text-primary hover:underline">Ver avisos manuais da equipe</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
