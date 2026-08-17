import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskPhone } from "@/lib/masks";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | DK Auto Center" },
      { name: "description", content: "Horário de fechamento, garantia padrão e alertas do sistema." },
      { property: "og:title", content: "Configurações | DK Auto Center" },
      { property: "og:description", content: "Ajustes gerais do sistema da oficina." },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome_oficina: "DK Auto Center",
    endereco: "",
    telefone: "",
    cnpj: "",
    horario_fechamento: "17:30",
    aviso_antecedencia_min: 15,
    garantia_dias: 90,
  });
  const [permissao, setPermissao] = useState<string>("default");

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermissao(Notification.permission);
  }, []);

  const { data } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        nome_oficina: data.nome_oficina,
        endereco: data.endereco ?? "",
        telefone: data.telefone ?? "",
        cnpj: data.cnpj ?? "",
        horario_fechamento: data.horario_fechamento.slice(0, 5),
        aviso_antecedencia_min: data.aviso_antecedencia_min,
        garantia_dias: data.garantia_dias,
      });
    }
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ id: true, ...form, horario_fechamento: `${form.horario_fechamento}:00` });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      void qc.invalidateQueries({ queryKey: ["configuracoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <PageHeader title="Configurações" subtitle="Ajustes gerais da oficina" />

      <div className="grid max-w-3xl gap-6">
        <div className="card-surface space-y-4 p-5">
          <h2 className="font-display text-xl font-bold uppercase">Oficina</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome da oficina</Label>
              <Input
                value={form.nome_oficina}
                onChange={(e) => setForm({ ...form, nome_oficina: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço (recibo)</Label>
              <Input
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone (recibo)</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })}
                placeholder="(87) 99999-0000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ (recibo)</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horário de fechamento</Label>
              <Input
                type="time"
                className="num"
                value={form.horario_fechamento}
                onChange={(e) => setForm({ ...form, horario_fechamento: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aviso antes do fechamento (minutos)</Label>
              <Input
                type="number"
                className="num"
                value={form.aviso_antecedencia_min}
                onChange={(e) =>
                  setForm({ ...form, aviso_antecedencia_min: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Garantia padrão (dias)</Label>
              <Input
                type="number"
                className="num"
                value={form.garantia_dias}
                onChange={(e) => setForm({ ...form, garantia_dias: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <i className="fa-solid fa-floppy-disk" /> Salvar
          </Button>
        </div>

        <div className="card-surface space-y-3 p-5">
          <h2 className="font-display text-xl font-bold uppercase">Notificações</h2>
          <p className="text-sm text-muted-foreground">
            Alertas de fechamento do pátio e de retornos de clientes são enviados pelo navegador.
            Status atual: <strong>{permissao}</strong>
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              const p = await Notification.requestPermission();
              setPermissao(p);
              if (p === "granted") toast.success("Notificações ativadas");
            }}
            disabled={permissao === "granted"}
          >
            <i className="fa-solid fa-bell" /> Ativar notificações
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
