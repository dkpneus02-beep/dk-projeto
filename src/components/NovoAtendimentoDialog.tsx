import { useEffect, useMemo, useRef, useState } from "react";
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
import { uploadVistoriaImgBB } from "@/lib/imgbb";

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

type FotoEnviada = { url: string; deleteUrl: string | null };
type FalhaEnvioFoto = { file: File; mensagem: string };

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
  const [fotoInputKey, setFotoInputKey] = useState(0);
  const [falhasFotos, setFalhasFotos] = useState<FalhaEnvioFoto[]>([]);
  const fotosEnviadas = useRef(new Map<File, FotoEnviada>());
  const previews = useMemo(
    () => arquivos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [arquivos],
  );
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cpfInvalido = onlyDigits(form.cliente_cpf).length > 0 && !isValidCPF(form.cliente_cpf);

  const criar = useMutation({
    mutationFn: async ({ continuarSemFalhas }: { continuarSemFalhas: boolean }) => {
      const atendimentoId = crypto.randomUUID();
      const falhas: FalhaEnvioFoto[] = [];
      const falhasAnteriores = continuarSemFalhas ? falhasFotos : [];
      for (const [index, file] of arquivos.entries()) {
        if (fotosEnviadas.current.has(file)) continue;
        if (falhasAnteriores.some((falha) => falha.file === file)) continue;
        try {
          const foto = await uploadVistoriaImgBB(file, `vistoria-${form.placa}-${index + 1}`);
          fotosEnviadas.current.set(file, { url: foto.url, deleteUrl: foto.deleteUrl });
        } catch (error) {
          falhas.push({
            file,
            mensagem: error instanceof Error ? error.message : "Não foi possível enviar esta foto.",
          });
        }
      }
      setFalhasFotos(falhas);
      if (falhas.length > 0 && !continuarSemFalhas) {
        return { status: "falha-upload" as const, falhas };
      }

      const fotos = arquivos.flatMap((file) => {
        const foto = fotosEnviadas.current.get(file);
        return foto ? [{ url: foto.url, deleteUrl: foto.deleteUrl }] : [];
      });
      const { error } = await supabase.from("atendimentos").insert({
        id: atendimentoId,
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
      });
      if (error) throw error;
      return {
        status: "aberto" as const,
        id: atendimentoId,
        fotosPublicadas: fotos.length,
        fotosIgnoradas: falhasAnteriores.length + falhas.length,
      };
    },
    onSuccess: (resultado) => {
      if (resultado.status === "falha-upload") {
        toast.error(
          "Uma ou mais fotos não foram enviadas. Tente novamente ou abra sem as fotos que falharam.",
        );
        return;
      }
      toast.success(
        resultado.fotosPublicadas > 0
          ? `Atendimento aberto. ${resultado.fotosPublicadas} foto(s) publicada(s) no ImgBB.`
          : "Atendimento aberto",
      );
      if (resultado.fotosIgnoradas > 0) {
        toast.warning(
          `A OS foi aberta sem ${resultado.fotosIgnoradas} foto(s) que não puderam ser enviadas.`,
        );
      }
      void qc.invalidateQueries();
      setOpen(false);
      setArquivos([]);
      setFalhasFotos([]);
      fotosEnviadas.current.clear();
      void navigate({ to: "/atendimento/$id", params: { id: resultado.id } });
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
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <i className="fa-solid fa-camera" /> Tirar foto
              <Input
                key={`camera-${fotoInputKey}`}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  setFalhasFotos([]);
                  setArquivos((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                  setFotoInputKey((key) => key + 1);
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <i className="fa-solid fa-images" /> Escolher da galeria
              <Input
                key={`gallery-${fotoInputKey}`}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  setFalhasFotos([]);
                  setArquivos((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                  setFotoInputKey((key) => key + 1);
                }}
              />
            </label>
          </div>
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {previews.map(({ file, url }, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="relative overflow-hidden rounded-md border bg-muted/20"
                >
                  <img
                    src={url}
                    alt={`Prévia da foto ${index + 1}`}
                    className="h-24 w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow"
                    onClick={() => {
                      const fotoEnviada = fotosEnviadas.current.get(file);
                      if (fotoEnviada?.deleteUrl) {
                        void fetch(fotoEnviada.deleteUrl, { method: "GET" }).catch(() => {});
                      }
                      fotosEnviadas.current.delete(file);
                      setArquivos((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                      setFalhasFotos((prev) => prev.filter((falha) => falha.file !== file));
                    }}
                    aria-label={`Remover foto ${index + 1}`}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {arquivos.length > 0
              ? `${arquivos.length} foto(s) selecionada(s). Você pode visualizar e remover antes de abrir a OS.`
              : "Escolha entre tirar uma foto ou selecionar várias da galeria."}
          </p>
        </Field>

        {falhasFotos.length > 0 && (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <p className="font-semibold">Não foi possível enviar estas fotos:</p>
            <ul className="list-inside list-disc space-y-1">
              {falhasFotos.map(({ file, mensagem }, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <strong>{file.name}:</strong> {mensagem}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              As fotos enviadas com sucesso serão mantidas. Você pode tentar novamente ou abrir a OS
              sem as fotos que falharam.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => criar.mutate({ continuarSemFalhas: false })}
            disabled={!form.placa || !form.cliente_nome || cpfInvalido || criar.isPending}
          >
            {criar.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            {criar.isPending
              ? arquivos.length > 0
                ? "Publicando fotos e abrindo atendimento..."
                : "Abrindo atendimento..."
              : falhasFotos.length > 0
                ? "Tentar enviar fotos novamente"
                : "Abrir atendimento"}
          </Button>
          {falhasFotos.length > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={!form.placa || !form.cliente_nome || cpfInvalido || criar.isPending}
              onClick={() => criar.mutate({ continuarSemFalhas: true })}
            >
              Abrir OS sem as fotos que falharam
            </Button>
          )}
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
