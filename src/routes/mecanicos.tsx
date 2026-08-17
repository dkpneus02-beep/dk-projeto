import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { criarMecanico } from "@/lib/mecanicos.server";
import { maskPhone, onlyDigits } from "@/lib/masks";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/mecanicos")({
  head: () => ({
    meta: [
      { title: "Mecânicos | DK Auto Center" },
      { name: "description", content: "Cadastro e disponibilidade da equipe de mecânicos." },
      { property: "og:title", content: "Mecânicos | DK Auto Center" },
      { property: "og:description", content: "Equipe de mecânicos da oficina." },
    ],
  }),
  component: Mecanicos,
});

const formVazio = { nome: "", email: "", telefone: "", senha: "" };

function Mecanicos() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formVazio);

  const { data } = useQuery({
    queryKey: ["mecanicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mecanicos")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      await criarMecanico({
        data: {
          nome: form.nome.trim(),
          email: form.email.trim(),
          telefone: form.telefone,
          senha: form.senha,
        },
      });
    },
    onSuccess: () => {
      toast.success("Mecânico cadastrado — já pode entrar com o e-mail e a senha definidos.");
      setForm(formVazio);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["mecanicos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("mecanicos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mecanicos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mecanicos")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mecânico removido da equipe");
      void qc.invalidateQueries({ queryKey: ["mecanicos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const senhaValida = form.senha.length >= 6;
  const podeSalvar =
    form.nome.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    onlyDigits(form.telefone).length >= 10 &&
    senhaValida &&
    !criar.isPending;

  return (
    <AppShell>
      <PageHeader title="Mecânicos" subtitle="Equipe disponível para execução de serviços">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setForm(formVazio);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <i className="fa-solid fa-user-plus" /> Novo mecânico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">Novo mecânico</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O acesso do mecânico é criado diretamente aqui. Ele poderá entrar com o e-mail e a
              senha temporária definidos abaixo (e depois trocar a senha em "Esqueceu sua senha?").
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })}
                  placeholder="(87) 99999-0000"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha temporária</Label>
                <Input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!podeSalvar} onClick={() => criar.mutate()}>
                {criar.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
                Salvar e criar acesso
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((m) => (
          <div key={m.id} className="card-surface flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">{m.nome}</p>
              <p className="num text-sm text-muted-foreground">{m.telefone || "—"}</p>
              {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={m.ativo}
                onCheckedChange={(v) => alternar.mutate({ id: m.id, ativo: v })}
              />
              <ConfirmActionDialog
                trigger={
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${m.nome}`}
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                }
                title="Remover mecânico"
                description={
                  <>
                    Tem certeza que deseja remover <strong className="text-foreground">{m.nome}</strong>{" "}
                    da equipe? Ele deixa de aparecer para atribuição de serviços. O login não é
                    excluído, apenas desativado aqui.
                  </>
                }
                confirmLabel="Remover"
                destructive
                onConfirm={() => remover.mutateAsync(m.id)}
              />
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="card-surface col-span-full p-12 text-center text-muted-foreground">
            <i className="fa-solid fa-screwdriver-wrench mb-3 text-3xl" />
            <p>Nenhum mecânico cadastrado ainda.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
