import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { d, diasEntre, whatsappLink } from "@/lib/format";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Retornos de clientes | DK Auto Center" },
      {
        name: "description",
        content: "Avisos automáticos de retorno de serviços por tempo e quilometragem.",
      },
      { property: "og:title", content: "Retornos de clientes | DK Auto Center" },
      { property: "og:description", content: "Follow-up automático de clientes da oficina." },
    ],
  }),
  component: Notificacoes,
});

function Notificacoes() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["retornos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes_retorno")
        .select("*")
        .order("vencimento");
      if (error) throw error;
      return data;
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("notificacoes_retorno")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["retornos"] }),
  });

  const pendentes = (data ?? []).filter((n) => n.status === "pendente");
  const vencidos = pendentes.filter((n) => diasEntre(n.vencimento) <= 0);

  return (
    <AppShell>
      <PageHeader
        title="Retornos de clientes"
        subtitle={`${vencidos.length} retornos vencidos · ${pendentes.length} pendentes no total`}
      />

      <div className="space-y-3">
        {pendentes.map((n) => {
          const dias = diasEntre(n.vencimento);
          const vencido = dias <= 0;
          return (
            <div
              key={n.id}
              className="card-surface flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div>
                <p className="font-semibold">
                  {n.cliente_nome}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {n.veiculo}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {n.servico} · vencimento {d(n.vencimento)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={vencido ? "destructive" : "secondary"}>
                  {vencido ? `Vencido há ${Math.abs(dias)} dias` : `Faltam ${dias} dias`}
                </Badge>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={whatsappLink(
                      n.telefone,
                      `Olá ${n.cliente_nome}! Aqui é da DK Auto Center. Já faz um tempo desde o serviço de ${n.servico} no seu ${n.veiculo}. Que tal agendar uma revisão?`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <i className="fa-brands fa-whatsapp" /> Avisar
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => marcar.mutate({ id: n.id, status: "concluido" })}
                >
                  <i className="fa-solid fa-check" /> Resolvido
                </Button>
              </div>
            </div>
          );
        })}
        {pendentes.length === 0 && (
          <div className="card-surface p-12 text-center text-muted-foreground">
            <i className="fa-solid fa-bell-slash mb-3 text-3xl" />
            <p>Nenhum retorno pendente.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
