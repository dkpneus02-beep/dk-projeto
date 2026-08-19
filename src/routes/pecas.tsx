import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { BarcodeCameraDialog } from "@/components/BarcodeCameraDialog";

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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaPecaId, setEntradaPecaId] = useState("");
  const [entradaQuantidade, setEntradaQuantidade] = useState(1);
  const [favoritos, setFavoritos] = useState<string[]>([]);

  useEffect(() => {
    try {
      setFavoritos(
        JSON.parse(localStorage.getItem("dk-pneus-pecas-favoritas") ?? "[]") as string[],
      );
    } catch {
      setFavoritos([]);
    }
  }, []);

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
          (tab === "todos" || (tab === "favoritos" ? favoritos.includes(p.id) : p.tipo === tab)) &&
          matches(busca, [p.nome, p.sku, p.marca, p.medida, p.modelo_desenho]),
      ),
    [data, busca, tab, favoritos],
  );

  const aplicarCodigo = (codigoBruto: string) => {
    const codigo = codigoBruto.trim();
    if (!codigo) return;
    setBusca(codigo);
    const achada = (data ?? []).find((p) => p.sku?.trim().toLowerCase() === codigo.toLowerCase());
    if (achada) {
      toast.success(`Item encontrado: ${achada.nome}`);
      abrir(achada);
      return;
    }

    // Código novo: já abre o cadastro com o SKU preenchido, sem exigir redigitação.
    setEdit({ ...vazio, sku: codigo });
    toast.info(`Código ${codigo} preenchido. Complete nome, preço e estoque para salvar.`);
  };

  // Leitor USB/Bluetooth: funciona como teclado e cai na mesma busca inteligente da câmera.
  useBarcodeScanner(aplicarCodigo);

  const salvar = useMutation({
    mutationFn: async (p: typeof vazio & { id?: string }) => {
      const sku = p.sku.trim();
      if (sku) {
        const { data: duplicado, error: erroDuplicado } = await supabase
          .from("pecas")
          .select("id, nome")
          .eq("sku", sku)
          .is("deleted_at", null)
          .neq("id", p.id ?? "00000000-0000-0000-0000-000000000000")
          .maybeSingle();
        if (erroDuplicado) throw erroDuplicado;
        if (duplicado)
          throw new Error(`Já existe um item ativo com o código ${sku}: ${duplicado.nome}.`);
      }

      const payload = {
        sku: sku || null,
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

  const entradaEstoque = useMutation({
    mutationFn: async () => {
      if (!entradaPecaId || entradaQuantidade <= 0) {
        throw new Error("Informe o item e uma quantidade maior que zero.");
      }
      const { data: item, error } = await supabase.rpc("adicionar_entrada_estoque", {
        _peca_id: entradaPecaId,
        _quantidade: entradaQuantidade,
      });
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => {
      toast.success(`Entrada registrada: +${entradaQuantidade} em ${item.nome}.`);
      setEntradaOpen(false);
      setEntradaPecaId("");
      setEntradaQuantidade(1);
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEntradaOpen(true)}>
            <i className="fa-solid fa-boxes-stacked" /> Entrada rápida
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEdit({ ...vazio });
              setCameraOpen(true);
            }}
          >
            <i className="fa-solid fa-barcode" /> Cadastrar por código
          </Button>
          <Button onClick={() => abrir()}>
            <i className="fa-solid fa-plus" /> Novo item
          </Button>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código, marca ou medida"
          className="max-w-sm"
        />
        <Button variant="outline" onClick={() => setCameraOpen(true)}>
          <i className="fa-solid fa-camera" /> Ler pela câmera
        </Button>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="peca">Peças</TabsTrigger>
            <TabsTrigger value="pneu">Pneus</TabsTrigger>
            <TabsTrigger value="favoritos">Favoritos</TabsTrigger>
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
                  <button
                    className="mr-3 text-muted-foreground hover:text-foreground"
                    title="Favoritar item"
                    onClick={() => {
                      const proximo = favoritos.includes(p.id)
                        ? favoritos.filter((id) => id !== p.id)
                        : [...favoritos, p.id];
                      setFavoritos(proximo);
                      localStorage.setItem("dk-pneus-pecas-favoritas", JSON.stringify(proximo));
                    }}
                  >
                    <i
                      className={`${favoritos.includes(p.id) ? "fa-solid" : "fa-regular"} fa-star`}
                    />
                  </button>
                  <button
                    className="mr-3 text-muted-foreground hover:text-foreground"
                    onClick={() => abrir(p)}
                    title="Editar item"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <ConfirmActionDialog
                    trigger={
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title={`Excluir ${p.nome}`}
                      >
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    }
                    title="Excluir item do estoque"
                    description={
                      <>
                        Tem certeza que deseja excluir{" "}
                        <strong className="text-foreground">{p.nome}</strong>? O item será ocultado
                        do estoque, mas os registros já usados em OS serão preservados.
                      </>
                    }
                    confirmLabel="Excluir item"
                    destructive
                    onConfirm={() => remover.mutateAsync(p.id)}
                  />
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

      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase">
              Entrada rápida de estoque
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Escolha o item, informe a quantidade recebida e o sistema somará ao saldo atual sem
            alterar preço ou cadastro.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item do estoque</Label>
              <select
                value={entradaPecaId}
                onChange={(event) => setEntradaPecaId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione uma peça ou pneu</option>
                {(data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.sku ? ` · ${p.sku}` : ""} · saldo {Number(p.estoque)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade recebida</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={entradaQuantidade}
                onChange={(event) => setEntradaQuantidade(Number(event.target.value) || 0)}
                className="num"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!entradaPecaId || entradaQuantidade <= 0 || entradaEstoque.isPending}
              onClick={() => entradaEstoque.mutate()}
            >
              {entradaEstoque.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
              Registrar entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeCameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onDetected={aplicarCodigo}
      />

      {edit && (
        <Dialog open onOpenChange={() => setEdit(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">
                {edit.id ? "Editar item" : "Novo item"}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                Use câmera ou scanner USB para preencher o código automaticamente.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
                <i className="fa-solid fa-camera" /> Ler código
              </Button>
            </div>

            <Tabs value={edit.tipo} onValueChange={(v) => setEdit({ ...edit, tipo: v })}>
              <TabsList>
                <TabsTrigger value="peca">Peça</TabsTrigger>
                <TabsTrigger value="pneu">Pneu</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                label="Nome"
                value={edit.nome}
                onChange={(v) => setEdit({ ...edit, nome: v })}
              />
              <Campo
                label="Código / SKU"
                value={edit.sku}
                onChange={(v) => setEdit({ ...edit, sku: v })}
              />
              <Campo
                label="Marca"
                value={edit.marca}
                onChange={(v) => setEdit({ ...edit, marca: v })}
              />
              {edit.tipo === "pneu" && (
                <>
                  <Campo
                    label="Medida"
                    value={edit.medida}
                    onChange={(v) => setEdit({ ...edit, medida: v })}
                  />
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
