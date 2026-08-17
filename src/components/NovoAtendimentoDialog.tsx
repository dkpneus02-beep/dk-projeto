import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { maskCPF, maskPhone, isValidCPF, onlyDigits } from "@/lib/masks";

const AVARIAS = [
  "Farol trincado",
  "Amortecedor vazando óleo",
  "Luz de injeção acesa",
  "Riscos na pintura",
  "Pneu careca",
  "Para-choque danificado",
  "Vidro trincado",
  "Escapamento furado",
];

export function NovoAtendimentoDialog({ lotado }: { lotado: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    placa: "",
    fabricante: "",
    modelo: "",
    cor: "",
    cliente_nome: "",
    cliente_telefone: "",
    cliente_cpf: "",
    km: "",
    observacao: "",
    alertas_tecnicos: "",
  });
  const [avarias, setAvarias] = useState<string[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cpfInvalido = onlyDigits(form.cliente_cpf).length > 0 && !isValidCPF(form.cliente_cpf);

  const criar = useMutation({
    mutationFn: async () => {
      const fotos: string[] = [];
      for (const file of arquivos) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
        const { error } = await supabase.storage.from("vistorias").upload(path, file);
        if (error) throw error;
        const { data } = await supabase.storage.from("vistorias").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (data?.signedUrl) fotos.push(data.signedUrl);
      }
      const { data, error } = await supabase
        .from("atendimentos")
        .insert({
          placa: form.placa.toUpperCase(),
          fabricante: form.fabricante,
          modelo: form.modelo,
          cor: form.cor,
          cliente_nome: form.cliente_nome,
          cliente_telefone: form.cliente_telefone,
          cliente_cpf: form.cliente_cpf,
          km: form.km ? Number(form.km) : null,
          observacao: form.observacao,
          alertas_tecnicos: form.alertas_tecnicos,
          avarias,
          fotos,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Atendimento aberto");
      void qc.invalidateQueries();
      setOpen(false);
      void navigate({ to: "/atendimento/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={lotado}>
          <i className="fa-solid fa-plus" /> Novo atendimento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Novo atendimento</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Placa" required>
            <Input
              value={form.placa}
              onChange={(e) => set("placa", e.target.value.toUpperCase())}
              placeholder="ABC-1234"
            />
          </Field>
          <Field label="Fabricante">
            <Input value={form.fabricante} onChange={(e) => set("fabricante", e.target.value)} />
          </Field>
          <Field label="Modelo">
            <Input value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
          </Field>
          <Field label="Cor">
            <Input value={form.cor} onChange={(e) => set("cor", e.target.value)} />
          </Field>
          <Field label="Proprietário" required>
            <Input
              value={form.cliente_nome}
              onChange={(e) => set("cliente_nome", e.target.value)}
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.cliente_telefone}
              onChange={(e) => set("cliente_telefone", maskPhone(e.target.value))}
              placeholder="(87) 99999-0000"
              inputMode="numeric"
            />
          </Field>
          <Field label="CPF">
            <Input
              value={form.cliente_cpf}
              onChange={(e) => set("cliente_cpf", maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className={cpfInvalido ? "border-destructive" : undefined}
            />
            {cpfInvalido && <p className="mt-1 text-xs text-destructive">CPF inválido.</p>}
          </Field>
          <Field label="KM atual">
            <Input
              type="number"
              value={form.km}
              onChange={(e) => set("km", e.target.value)}
              className="num"
            />
          </Field>
        </div>

        <Field label="Observação geral">
          <Textarea
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            rows={2}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">
            <i className="fa-solid fa-clipboard-check mr-2 text-primary" />
            Vistoria de entrada — avarias prévias
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {AVARIAS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={avarias.includes(a)}
                  onCheckedChange={(c) =>
                    setAvarias((prev) => (c ? [...prev, a] : prev.filter((x) => x !== a)))
                  }
                />
                {a}
              </label>
            ))}
          </div>
        </div>

        <Field label="Alertas técnicos / recusa do cliente">
          <Textarea
            value={form.alertas_tecnicos}
            onChange={(e) => set("alertas_tecnicos", e.target.value)}
            rows={2}
            placeholder="Cliente alertado sobre suspensão dianteira folgada e recusou o conserto."
          />
        </Field>

        <Field label="Fotos da vistoria">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {arquivos.length > 0
              ? `${arquivos.length} arquivo(s) selecionado(s)`
              : "Toque para tirar foto pela câmera ou escolher da galeria."}
          </p>
        </Field>

        <DialogFooter>
          <Button
            onClick={() => criar.mutate()}
            disabled={!form.placa || !form.cliente_nome || cpfInvalido || criar.isPending}
          >
            {criar.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            Abrir atendimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
    </div>
  );
}
