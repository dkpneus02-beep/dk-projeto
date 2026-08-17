import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, matches } from "@/lib/format";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

export const Route = createFileRoute("/pecas")({
  head: () => ({
    meta: [
      { title: "Peças e pneus | DK Auto Center" },
      { name: "description", content: "Estoque de peças e pneus com cálculo de margem e venda." },
      { property: "og:title", content: "Peças e pneus | DK Auto Center" },
      { property: "og:description", content: "Controle de estoque da oficina." },
    ],
  }),
  component: Pecas,
});

type Peca = Tables<"pecas">;

const vazio = {
  sku: "",
  nome: "",
  marca: "",
  tipo: "peca",
  estoque: 0,
  estoque_minimo: 0,
  preco_custo: 0,
  margem: 40,
  preco_venda: 0,
  medida: "",
  indice_carga: "",
  simbolo_velocidade: "",
  modelo_desenho: "",
  construcao: "",
};

function Pecas() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tab, setTab] = useState("todos");
  const [edit, setEdit] = useState<null | (typeof vazio & { id?: string })>(null);

  const { data } = useQuery({
    queryKey: ["pecas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pecas")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          (tab === "todos" || p.tipo === tab) &&
          matches(busca, [p.nome, p.sku, p.marca, p.medida]),
      ),
    [data, busca, tab],
  );

  // Leitor físico de código de barras (USB/Bluetooth): ao ler, joga o
  // código direto na busca por SKU — sem precisar clicar em nada.
  useBarcodeScanner((codigo) => {
    setBusca(codigo);
    const achada = (data ?? []).find((p) => p.sku === codigo);
    if (achada) toast.success(`Peça encontrada: ${achada.nome}`);
    else toast.info(`Nenhuma peça com o código "${codigo}" — use "Nova peça" para cadastrar.`);
  });

  const salvar = useMutation({
    mutationFn: async (p: typeof vazio & { id?: string }) => {
      const payload = {
        sku: p.sku || null,
        nome: p.nome,
        marca: p.marca || null,
        tipo: p.tipo,
        categoria: p.tipo,
        estoque: p.estoque,
        estoque_minimo: p.estoque_minimo,
        preco_custo: p.preco_custo,
        margem: p.margem,
        preco_venda: p.preco_venda,
        medida: p.medida || null,
        indice_carga: p.indice_carga || null,
        simbolo_velocidade: p.simbolo_velocidade || null,
        modelo_desenho: p.modelo_desenho || null,
        construcao: p.construcao || null,
      };
      const { error } = p.id
        ? await supabase.from("pecas").update(payload).eq("id", p.id)
        : await supabase.from("pecas").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item salvo");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["pecas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pecas")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pecas"] }),
  });

  const abrir = (p?: Peca) =>
    setEdit(
      p
        ? {
            id: p.id,
            sku: p.sku ?? "",
            nome: p.nome,
            marca: p.marca ?? "",
            tipo: p.tipo,
            estoque: Number(p.estoque),
            estoque_minimo: Number(p.estoque_minimo),
            preco_custo: Number(p.preco_custo),
            margem: Number(p.margem),
            preco_venda: Number(p.preco_venda),
            medida: p.medida ?? "",
            indice_carga: p.indice_carga ?? "",
            simbolo_velocidade: p.simbolo_velocidade ?? "",
            modelo_desenho: p.modelo_desenho ?? "",
            construcao: p.construcao ?? "",
          }
        : { ...vazio },
    );

  return (
    <AppShell>
      <PageHeader title="Peças e pneus" subtitle="Estoque, custo e precificação">
        <Button onClick={() => abrir()}>
          <i className="fa-solid fa-plus" /> Novo item
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código, marca ou medida"
          className="max-w-sm"
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="peca">Peças</TabsTrigger>
            <TabsTrigger value="pneu">Pneus</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Estoque</th>
              <th className="p-3">Custo</th>
              <th className="p-3">Margem</th>
              <th className="p-3">Venda</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3">
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.sku, p.marca, p.medida, p.modelo_desenho].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="num p-3">
                  {Number(p.estoque)}
                  {Number(p.estoque) <= Number(p.estoque_minimo) && (
                    <Badge variant="destructive" className="ml-2">
                      Baixo
                    </Badge>
                  )}
                </td>
                <td className="num p-3">{brl(p.preco_custo)}</td>
                <td className="num p-3">{Number(p.margem)}%</td>
                <td className="num p-3 font-semibold">{brl(p.preco_venda)}</td>
                <td className="p-3 text-right">
                  <button className="mr-3 text-muted-foreground hover:text-foreground" onClick={() => abrir(p)}>
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remover.mutate(p.id)}
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">
                {edit.id ? "Editar item" : "Novo item"}
              </DialogTitle>
            </DialogHeader>

            <Tabs value={edit.tipo} onValueChange={(v) => setEdit({ ...edit, tipo: v })}>
              <TabsList>
                <TabsTrigger value="peca">Peça</TabsTrigger>
                <TabsTrigger value="pneu">Pneu</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome" value={edit.nome} onChange={(v) => setEdit({ ...edit, nome: v })} />
              <Campo label="Código / SKU" value={edit.sku} onChange={(v) => setEdit({ ...edit, sku: v })} />
              <Campo label="Marca" value={edit.marca} onChange={(v) => setEdit({ ...edit, marca: v })} />
              {edit.tipo === "pneu" && (
                <>
                  <Campo label="Medida" value={edit.medida} onChange={(v) => setEdit({ ...edit, medida: v })} />
                  <Campo
                    label="Índice de carga"
                    value={edit.indice_carga}
                    onChange={(v) => setEdit({ ...edit, indice_carga: v })}
                  />
                  <Campo
                    label="Símbolo de velocidade"
                    value={edit.simbolo_velocidade}
                    onChange={(v) => setEdit({ ...edit, simbolo_velocidade: v })}
                  />
                  <Campo
                    label="Modelo / desenho"
                    value={edit.modelo_desenho}
                    onChange={(v) => setEdit({ ...edit, modelo_desenho: v })}
                  />
                  <Campo
                    label="Construção"
                    value={edit.construcao}
                    onChange={(v) => setEdit({ ...edit, construcao: v })}
                  />
                </>
              )}
              <CampoNum
                label="Estoque"
                value={edit.estoque}
                onChange={(v) => setEdit({ ...edit, estoque: v })}
              />
              <CampoNum
                label="Estoque mínimo"
                value={edit.estoque_minimo}
                onChange={(v) => setEdit({ ...edit, estoque_minimo: v })}
              />
              <CampoNum
                label="Preço de custo"
                value={edit.preco_custo}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    preco_custo: v,
                    preco_venda: Number((v * (1 + edit.margem / 100)).toFixed(2)),
                  })
                }
              />
              <CampoNum
                label="Margem (%)"
                value={edit.margem}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    margem: v,
                    preco_venda: Number((edit.preco_custo * (1 + v / 100)).toFixed(2)),
                  })
                }
              />
              <CampoNum
                label="Preço de venda"
                value={edit.preco_venda}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    preco_venda: v,
                    margem: edit.preco_custo
                      ? Number(((v / edit.preco_custo - 1) * 100).toFixed(2))
                      : edit.margem,
                  })
                }
              />
              <div className="flex items-end">
                <p className="text-sm text-muted-foreground">
                  Lucro por unidade:{" "}
                  <span className="num font-semibold text-foreground">
                    {brl(edit.preco_venda - edit.preco_custo)}
                  </span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!edit.nome.trim() || salvar.isPending}
                onClick={() => salvar.mutate(edit)}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

function Campo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CampoNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        className="num"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}
