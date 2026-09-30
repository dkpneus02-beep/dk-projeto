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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, matches, norm } from "@/lib/format";
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
type PecaReferencia = Tables<"peca_referencias">;

type ReferenciaForm = {
  id?: string;
  chave: string;
  marca: string;
  referencia: string;
  observacao: string;
  principal: boolean;
};

type PecaForm = {
  id?: string;
  sku: string;
  nome: string;
  marca: string;
  tipo: string;
  aceita_desconto_pix: boolean;
  estoque: number;
  estoque_minimo: number;
  preco_custo: number;
  margem: number;
  preco_venda: number;
  medida: string;
  indice_carga: string;
  simbolo_velocidade: string;
  modelo_desenho: string;
  construcao: string;
  aplicacao: string;
  observacoes: string;
  referencias: ReferenciaForm[];
};

type AjusteEstoqueForm = {
  pecaId: string;
  pecaNome: string;
  estoqueAtual: number;
  estoqueAlvo: number;
  custoUnitario: number;
  motivo: string;
};

let referenciaChave = 0;
const novaReferencia = (): ReferenciaForm => ({
  chave: `referencia-${++referenciaChave}`,
  marca: "",
  referencia: "",
  observacao: "",
  principal: false,
});

const novoFormulario = (): PecaForm => ({
  sku: "",
  nome: "",
  marca: "",
  tipo: "peca",
  aceita_desconto_pix: true,
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
  aplicacao: "",
  observacoes: "",
  referencias: [novaReferencia()],
});

function Pecas() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tab, setTab] = useState("todos");
  const [edit, setEdit] = useState<PecaForm | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaPecaId, setEntradaPecaId] = useState("");
  const [entradaQuantidade, setEntradaQuantidade] = useState(1);
  const [entradaCusto, setEntradaCusto] = useState(0);
  const [ajuste, setAjuste] = useState<AjusteEstoqueForm | null>(null);
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

  const { data: referencias = [] } = useQuery({
    queryKey: ["peca-referencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peca_referencias")
        .select("*")
        .is("deleted_at", null)
        .order("principal", { ascending: false })
        .order("marca")
        .order("referencia");
      if (error) throw error;
      return data;
    },
  });

  const referenciasPorPeca = useMemo(() => {
    const agrupadas = new Map<string, PecaReferencia[]>();
    referencias.forEach((referencia) => {
      const atuais = agrupadas.get(referencia.peca_id) ?? [];
      atuais.push(referencia);
      agrupadas.set(referencia.peca_id, atuais);
    });
    return agrupadas;
  }, [referencias]);

  const referenciasEncontradas = (p: Peca) => {
    return referenciasPorPeca.get(p.id) ?? [];
  };

  const lista = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          (tab === "todos" || (tab === "favoritos" ? favoritos.includes(p.id) : p.tipo === tab)) &&
          matches(busca, [
            p.nome,
            p.sku,
            p.marca,
            p.medida,
            p.modelo_desenho,
            ...(referenciasPorPeca.get(p.id) ?? []).flatMap((ref) => [
              ref.marca,
              ref.referencia,
              ref.observacao,
            ]),
          ]),
      ),
    [data, busca, tab, favoritos, referenciasPorPeca],
  );
  const ajusteDelta = ajuste
    ? Math.round((ajuste.estoqueAlvo - ajuste.estoqueAtual) * 100) / 100
    : 0;

  const aplicarCodigo = (codigoBruto: string) => {
    const codigo = codigoBruto.trim();
    if (!codigo) return;
    setBusca(codigo);
    const codigoNormalizado = norm(codigo);
    const achada = (data ?? []).find(
      (p) =>
        norm(p.sku) === codigoNormalizado ||
        (referenciasPorPeca.get(p.id) ?? []).some((ref) =>
          norm(ref.referencia).includes(codigoNormalizado),
        ),
    );
    if (achada) {
      toast.success(`Item encontrado: ${achada.nome}`);
      abrir(achada);
      return;
    }

    // Código novo: já abre o cadastro com o SKU preenchido, sem exigir redigitação.
    setEdit({ ...novoFormulario(), sku: codigo });
    toast.info(`Código ${codigo} preenchido. Complete nome, preço e estoque para salvar.`);
  };

  // Leitor USB/Bluetooth: funciona como teclado e cai na mesma busca inteligente da câmera.
  useBarcodeScanner(aplicarCodigo);

  const salvar = useMutation({
    mutationFn: async (p: PecaForm) => {
      const sku = p.sku.trim();
      const referenciasPreenchidas = p.referencias.filter(
        (referencia) =>
          referencia.marca.trim() || referencia.referencia.trim() || referencia.observacao.trim(),
      );
      const referenciasInvalidas = referenciasPreenchidas.filter(
        (referencia) => !referencia.marca.trim() || !referencia.referencia.trim(),
      );
      if (referenciasInvalidas.length > 0) {
        throw new Error("Preencha marca e referência ou remova a linha incompleta.");
      }

      const referenciasNormalizadas = new Set<string>();
      for (const referencia of referenciasPreenchidas) {
        const normalizada = norm(referencia.referencia);
        if (referenciasNormalizadas.has(normalizada)) {
          throw new Error(`A referência ${referencia.referencia.trim()} está repetida neste item.`);
        }
        referenciasNormalizadas.add(normalizada);
      }
      if (referenciasPreenchidas.filter((referencia) => referencia.principal).length > 1) {
        throw new Error("Selecione no máximo uma referência principal.");
      }
      if (!Number.isFinite(p.estoque) || p.estoque < 0) {
        throw new Error("O estoque inicial não pode ser negativo.");
      }
      if (!Number.isFinite(p.preco_custo) || p.preco_custo < 0) {
        throw new Error("O custo unitário inicial não pode ser negativo.");
      }

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
        aceita_desconto_pix: p.aceita_desconto_pix,
        categoria: p.tipo,
        estoque_minimo: p.estoque_minimo,
        margem: p.margem,
        preco_venda: p.preco_venda,
        medida: p.medida || null,
        indice_carga: p.indice_carga || null,
        simbolo_velocidade: p.simbolo_velocidade || null,
        modelo_desenho: p.modelo_desenho || null,
        construcao: p.construcao || null,
        aplicacao: p.aplicacao || null,
        observacoes: p.observacoes || null,
      };

      const pecaResult = p.id
        ? await supabase.from("pecas").update(payload).eq("id", p.id).select("id").single()
        : await supabase
            .from("pecas")
            .insert({ ...payload, estoque: 0, preco_custo: Number(p.preco_custo.toFixed(2)) })
            .select("id")
            .single();
      if (pecaResult.error) throw pecaResult.error;
      const pecaId = pecaResult.data.id;
      let erroEstoqueInicial: string | null = null;
      if (!p.id && p.estoque > 0) {
        const { error } = await supabase.rpc("ajustar_estoque_com_lotes", {
          _peca_id: pecaId,
          _estoque_alvo: Number(p.estoque.toFixed(2)),
          _motivo: "Estoque inicial do cadastro",
          _custo_unitario_entrada: Number(p.preco_custo.toFixed(2)),
        });
        if (error) erroEstoqueInicial = error.message;
      }

      const { data: referenciasAtuais, error: erroReferenciasAtuais } = await supabase
        .from("peca_referencias")
        .select("id")
        .eq("peca_id", pecaId)
        .is("deleted_at", null);
      if (erroReferenciasAtuais) throw erroReferenciasAtuais;

      // Marca as linhas atuais como inativas antes de reaplicar o conjunto
      // editado. Isso evita conflitos ao trocar duas referências entre si e
      // mantém os IDs existentes quando a linha continua no formulário.
      if ((referenciasAtuais ?? []).length > 0) {
        const { error } = await supabase
          .from("peca_referencias")
          .update({ deleted_at: new Date().toISOString(), principal: false })
          .eq("peca_id", pecaId)
          .is("deleted_at", null);
        if (error) throw error;
      }

      const idsPorChave = new Map<string, string>();
      for (const referencia of referenciasPreenchidas) {
        const referenciaPayload = {
          peca_id: pecaId,
          marca: referencia.marca.trim(),
          referencia: referencia.referencia.trim(),
          observacao: referencia.observacao.trim() || null,
          principal: false,
          deleted_at: null,
        };
        const resultado = referencia.id
          ? await supabase
              .from("peca_referencias")
              .update(referenciaPayload)
              .eq("id", referencia.id)
              .eq("peca_id", pecaId)
          : await supabase.from("peca_referencias").insert(referenciaPayload).select("id").single();
        if (resultado.error) throw resultado.error;
        const referenciaId = referencia.id ?? resultado.data?.id;
        if (!referenciaId) throw new Error("Não foi possível identificar a referência salva.");
        idsPorChave.set(referencia.chave, referenciaId);
      }

      const principal = referenciasPreenchidas.find((referencia) => referencia.principal);
      if (principal) {
        const principalId = idsPorChave.get(principal.chave);
        const { error } = await supabase
          .from("peca_referencias")
          .update({ principal: true })
          .eq("id", principalId ?? "00000000-0000-0000-0000-000000000000")
          .eq("peca_id", pecaId);
        if (error) throw error;
      }

      const idsMantidos = new Set(
        referenciasPreenchidas.map((referencia) => referencia.id).filter(Boolean),
      );
      const idsRemovidos = (referenciasAtuais ?? [])
        .map((referencia) => referencia.id)
        .filter((id) => !idsMantidos.has(id));
      if (idsRemovidos.length > 0) {
        const { error } = await supabase
          .from("peca_referencias")
          .update({ deleted_at: new Date().toISOString(), principal: false })
          .in("id", idsRemovidos);
        if (error) throw error;
      }
      return { erroEstoqueInicial };
    },
    onSuccess: ({ erroEstoqueInicial }) => {
      if (erroEstoqueInicial) {
        toast.error(
          `Item salvo, mas o estoque inicial não foi registrado: ${erroEstoqueInicial}. Use Ajustar estoque para tentar novamente.`,
        );
      } else {
        toast.success("Item salvo");
      }
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["pecas"] });
      void qc.invalidateQueries({ queryKey: ["peca-referencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entradaEstoque = useMutation({
    mutationFn: async () => {
      if (!entradaPecaId || entradaQuantidade <= 0) {
        throw new Error("Informe o item e uma quantidade maior que zero.");
      }
      const { data: item, error } = await supabase.rpc("adicionar_entrada_estoque_com_custo", {
        _peca_id: entradaPecaId,
        _quantidade: entradaQuantidade,
        _preco_custo: Math.round(entradaCusto * 100) / 100,
      });
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => {
      toast.success(`Entrada registrada: +${entradaQuantidade} em ${item.nome}.`);
      setEntradaOpen(false);
      setEntradaPecaId("");
      setEntradaQuantidade(1);
      setEntradaCusto(0);
      void qc.invalidateQueries({ queryKey: ["pecas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ajustarEstoque = useMutation({
    mutationFn: async (form: AjusteEstoqueForm) => {
      const estoqueAlvo = Math.round(form.estoqueAlvo * 100) / 100;
      const diferenca = Math.round((estoqueAlvo - form.estoqueAtual) * 100) / 100;
      if (!Number.isFinite(estoqueAlvo) || estoqueAlvo < 0) {
        throw new Error("O estoque final deve ser zero ou maior.");
      }
      if (Math.abs(diferenca) < 0.01) {
        throw new Error("Informe uma quantidade final diferente do estoque atual.");
      }
      if (!form.motivo.trim()) throw new Error("Informe o motivo do ajuste.");
      const custoUnitario = Math.round(form.custoUnitario * 100) / 100;
      if (diferenca > 0 && (!Number.isFinite(custoUnitario) || custoUnitario < 0)) {
        throw new Error("Informe um custo unitário válido para a entrada.");
      }
      const { data: item, error } = await supabase.rpc("ajustar_estoque_com_lotes", {
        _peca_id: form.pecaId,
        _estoque_alvo: estoqueAlvo,
        _motivo: form.motivo.trim(),
        ...(diferenca > 0 ? { _custo_unitario_entrada: custoUnitario } : {}),
      });
      if (error) throw error;
      return { item, diferenca };
    },
    onSuccess: ({ item, diferenca }) => {
      const sinal = diferenca > 0 ? "+" : "";
      toast.success(`Ajuste registrado: ${sinal}${diferenca.toFixed(2)} em ${item.nome}.`);
      setAjuste(null);
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

  const abrir = (p?: Peca) => {
    if (!p) {
      setEdit(novoFormulario());
      return;
    }
    const referenciasDaPeca = (referenciasPorPeca.get(p.id) ?? []).map((referencia) => ({
      id: referencia.id,
      chave: referencia.id,
      marca: referencia.marca,
      referencia: referencia.referencia,
      observacao: referencia.observacao ?? "",
      principal: referencia.principal,
    }));
    setEdit({
      id: p.id,
      sku: p.sku ?? "",
      nome: p.nome,
      marca: p.marca ?? "",
      tipo: p.tipo,
      aceita_desconto_pix: p.aceita_desconto_pix,
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
      aplicacao: p.aplicacao ?? "",
      observacoes: p.observacoes ?? "",
      referencias: referenciasDaPeca.length > 0 ? referenciasDaPeca : [novaReferencia()],
    });
  };

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
              setEdit(novoFormulario());
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
                  {referenciasEncontradas(p).length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Referências:</span>{" "}
                      {referenciasEncontradas(p)
                        .map((referencia) => `${referencia.marca} ${referencia.referencia}`)
                        .join(" · ")}
                    </p>
                  )}
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
                    title="Ajustar estoque"
                    aria-label={`Ajustar estoque de ${p.nome}`}
                    onClick={() =>
                      setAjuste({
                        pecaId: p.id,
                        pecaNome: p.nome,
                        estoqueAtual: Number(p.estoque),
                        estoqueAlvo: Number(p.estoque),
                        custoUnitario: Number(p.preco_custo),
                        motivo: "",
                      })
                    }
                  >
                    <i className="fa-solid fa-boxes-stacked" />
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
            Escolha o item, informe quantidade e custo da entrada. O saldo e o custo médio serão
            atualizados e o lote ficará preservado.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item do estoque</Label>
              <select
                value={entradaPecaId}
                onChange={(event) => {
                  const id = event.target.value;
                  setEntradaPecaId(id);
                  const peca = (data ?? []).find((item) => item.id === id);
                  setEntradaCusto(Number(peca?.preco_custo ?? 0));
                }}
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
            <div className="space-y-1.5">
              <Label>Custo unitário da entrada (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entradaCusto}
                onChange={(event) => setEntradaCusto(Number(event.target.value) || 0)}
                className="num"
              />
              <p className="text-xs text-muted-foreground">
                O sistema criará um lote e recalculará o custo médio ponderado do item.
              </p>
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

      <Dialog
        open={Boolean(ajuste)}
        onOpenChange={(open) => {
          if (!open && !ajustarEstoque.isPending) setAjuste(null);
        }}
      >
        {ajuste && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">
                Ajuste de estoque
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O ajuste será registrado com motivo e custo, preservando a trilha de lotes. Entradas
              criam um lote e recalculam o custo médio; saídas consomem lotes pelo FIFO.
            </p>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-medium">{ajuste.pecaNome}</p>
                <p className="text-sm text-muted-foreground">
                  Estoque atual: <span className="num">{ajuste.estoqueAtual.toFixed(2)}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Estoque físico confirmado</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="num"
                  value={ajuste.estoqueAlvo}
                  onChange={(event) =>
                    setAjuste({
                      ...ajuste,
                      estoqueAlvo: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              {ajusteDelta > 0 && (
                <div className="space-y-1.5">
                  <Label>Custo unitário da entrada (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="num"
                    value={ajuste.custoUnitario}
                    onChange={(event) =>
                      setAjuste({
                        ...ajuste,
                        custoUnitario: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    A quantidade adicionada será um novo lote; o custo médio será recalculado.
                  </p>
                </div>
              )}
              {ajusteDelta < 0 && (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  A redução consumirá os lotes mais antigos primeiro e registrará o custo FIFO e o
                  motivo. O custo médio atual não será alterado pela saída.
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Motivo do ajuste</Label>
                <Textarea
                  value={ajuste.motivo}
                  onChange={(event) => setAjuste({ ...ajuste, motivo: event.target.value })}
                  placeholder="Ex.: conferência física do estoque"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAjuste(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  ajustarEstoque.isPending || Math.abs(ajusteDelta) < 0.01 || !ajuste.motivo.trim()
                }
                onClick={() => ajustarEstoque.mutate(ajuste)}
              >
                {ajustarEstoque.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
                Registrar ajuste
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
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

            <Tabs
              value={edit.tipo}
              onValueChange={(v) =>
                setEdit({
                  ...edit,
                  tipo: v,
                  aceita_desconto_pix: v === "pneu" ? false : edit.aceita_desconto_pix,
                })
              }
            >
              <TabsList>
                <TabsTrigger value="peca">Peça</TabsTrigger>
                <TabsTrigger value="pneu">Pneu</TabsTrigger>
              </TabsList>
            </Tabs>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <input
                type="checkbox"
                checked={edit.aceita_desconto_pix}
                onChange={(event) =>
                  setEdit({ ...edit, aceita_desconto_pix: event.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <strong className="block">Aceita desconto Pix de 25%</strong>
                <span className="text-xs text-muted-foreground">
                  Desmarque para óleo, pneus ou itens comprados fora do fornecedor.
                </span>
              </span>
            </label>

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
              <CampoArea
                label="Aplicação"
                value={edit.aplicacao}
                onChange={(v) => setEdit({ ...edit, aplicacao: v })}
                placeholder="Veículos, motores ou aplicações compatíveis"
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
              {edit.id ? (
                <div className="space-y-1.5">
                  <Label>Estoque atual</Label>
                  <Input type="number" className="num" value={edit.estoque} readOnly />
                  <p className="text-xs text-muted-foreground">
                    Use Ajustar estoque para corrigir o saldo com registro de lote e motivo.
                  </p>
                </div>
              ) : (
                <CampoNum
                  label="Estoque inicial"
                  value={edit.estoque}
                  onChange={(v) => setEdit({ ...edit, estoque: v })}
                />
              )}
              <CampoNum
                label="Estoque mínimo"
                value={edit.estoque_minimo}
                onChange={(v) => setEdit({ ...edit, estoque_minimo: v })}
              />
              {edit.id ? (
                <div className="space-y-1.5">
                  <Label>Custo médio ponderado</Label>
                  <Input type="number" className="num" value={edit.preco_custo} readOnly />
                  <p className="text-xs text-muted-foreground">
                    Atualizado pelas entradas registradas em lote.
                  </p>
                </div>
              ) : (
                <CampoNum
                  label="Custo unitário inicial (R$)"
                  value={edit.preco_custo}
                  onChange={(v) =>
                    setEdit({
                      ...edit,
                      preco_custo: v,
                      preco_venda: Number((v * (1 + edit.margem / 100)).toFixed(2)),
                    })
                  }
                />
              )}
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

            <CampoArea
              label="Observações da peça"
              value={edit.observacoes}
              onChange={(v) => setEdit({ ...edit, observacoes: v })}
              placeholder="Informações adicionais sobre este cadastro"
            />

            <section
              aria-labelledby="referencias-title"
              className="space-y-3 rounded-md border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="referencias-title" className="font-medium">
                    Referências equivalentes
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cadastre códigos de marcas diferentes para a mesma peça. A linha é opcional.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEdit({ ...edit, referencias: [...edit.referencias, novaReferencia()] })
                  }
                >
                  <i className="fa-solid fa-plus" /> Adicionar referência
                </Button>
              </div>

              <div className="space-y-3">
                {edit.referencias.map((referencia, indice) => (
                  <div key={referencia.chave} className="rounded-md bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Referência {indice + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover referência ${indice + 1}`}
                        onClick={() =>
                          setEdit({
                            ...edit,
                            referencias: edit.referencias.filter(
                              (item) => item.chave !== referencia.chave,
                            ),
                          })
                        }
                      >
                        <i className="fa-solid fa-trash-can text-destructive" /> Remover
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo
                        label="Marca da referência"
                        value={referencia.marca}
                        onChange={(valor) =>
                          setEdit({
                            ...edit,
                            referencias: edit.referencias.map((item) =>
                              item.chave === referencia.chave ? { ...item, marca: valor } : item,
                            ),
                          })
                        }
                      />
                      <Campo
                        label="Referência / código"
                        value={referencia.referencia}
                        onChange={(valor) =>
                          setEdit({
                            ...edit,
                            referencias: edit.referencias.map((item) =>
                              item.chave === referencia.chave
                                ? { ...item, referencia: valor }
                                : item,
                            ),
                          })
                        }
                      />
                      <Campo
                        label="Observação da referência"
                        value={referencia.observacao}
                        onChange={(valor) =>
                          setEdit({
                            ...edit,
                            referencias: edit.referencias.map((item) =>
                              item.chave === referencia.chave
                                ? { ...item, observacao: valor }
                                : item,
                            ),
                          })
                        }
                      />
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <input
                          type="checkbox"
                          checked={referencia.principal}
                          onChange={(evento) =>
                            setEdit({
                              ...edit,
                              referencias: edit.referencias.map((item) => ({
                                ...item,
                                principal:
                                  item.chave === referencia.chave ? evento.target.checked : false,
                              })),
                            })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        Referência principal
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

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

function CampoArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
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
