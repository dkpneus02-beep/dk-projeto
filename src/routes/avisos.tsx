import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dt } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos internos | DK Auto Center" },
      { name: "description", content: "Recados da gerência para a equipe, com confirmação de leitura." },
      { property: "og:title", content: "Avisos internos | DK Auto Center" },
      { property: "og:description", content: "Comunicação interna da oficina." },
    ],
  }),
  component: Avisos,
});

function Avisos() {
  const qc = useQueryClient();
  const { user, nome, role } = useAuth();
  const isGerente = role === "gerente";
  const [mensagem, setMensagem] = useState("");
  const [destino, setDestino] = useState("todos");

  const { data: mecanicos } = useQuery({
    queryKey: ["mecanicos-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mecanicos")
        .select("id, nome")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: avisos } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*, aviso_leituras(id, user_id, user_nome, lido_at), mecanicos(nome)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const publicar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("avisos").insert({
        mensagem,
        mecanico_id: destino === "todos" ? null : destino,
        criado_por: user?.id ?? null,
        criado_por_nome: nome,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso publicado");
      setMensagem("");
      void qc.invalidateQueries({ queryKey: ["avisos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmar = useMutation({
    mutationFn: async (avisoId: string) => {
      const { error } = await supabase.from("aviso_leituras").insert({
        aviso_id: avisoId,
        user_id: user!.id,
        user_nome: nome,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["avisos"] }),
  });

  return (
    <AppShell>
      <PageHeader title="Avisos internos" subtitle="Recados da gerência com confirmação de leitura" />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {isGerente && (
          <div className="card-surface space-y-3 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Novo aviso</h2>
            <div className="space-y-1.5">
              <Label>Destinatário</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(mecanicos ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                rows={4}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Ex.: reunião amanhã às 8h"
              />
            </div>
            <Button
              className="w-full"
              disabled={!mensagem.trim() || publicar.isPending}
              onClick={() => publicar.mutate()}
            >
              <i className="fa-solid fa-bullhorn" /> Publicar
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {(avisos ?? []).map((a) => {
            const leituras = a.aviso_leituras ?? [];
            const jaLi = leituras.some((l) => l.user_id === user?.id);
            return (
              <div key={a.id} className="card-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="whitespace-pre-wrap">{a.mensagem}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.criado_por_nome ?? "Gerência"} · {dt(a.created_at)} ·{" "}
                      {a.mecanicos?.nome ? `para ${a.mecanicos.nome}` : "para toda a equipe"}
                    </p>
                  </div>
                  {jaLi ? (
                    <Badge variant="secondary">
                      <i className="fa-solid fa-check mr-1" /> Lido
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => confirmar.mutate(a.id)}>
                      Marcar como lido
                    </Button>
                  )}
                </div>
                {leituras.length > 0 && (
                  <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                    Leram: {leituras.map((l) => l.user_nome ?? "Usuário").join(", ")}
                  </p>
                )}
              </div>
            );
          })}
          {(avisos ?? []).length === 0 && (
            <div className="card-surface p-12 text-center text-muted-foreground">
              <i className="fa-solid fa-bullhorn mb-3 text-3xl" />
              <p>Nenhum aviso publicado.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
