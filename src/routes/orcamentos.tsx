/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl, matches } from "@/lib/format";

export const Route = createFileRoute("/orcamentos")({
  head: () => ({
    meta: [
      { title: "Orçamentos | DK Auto Center" },
      {
        name: "description",
        content: "Orçamentos rápidos da DK Auto Center com peças, mão de obra e PDF.",
      },
    ],
  }),
  component: Orcamentos,
});

type TipoItem = "peca" | "mao_de_obra";
type Peca = {
  id: string;
  nome: string;
  sku: string | null;
  marca: string | null;
  preco_venda: number;
  estoque: number;
  deleted_at: string | null;
};
type Catalogo = {
  id: string;
  nome: string;
  preco_padrao: number;
  ativo: boolean;
  deleted_at: string | null;
  retorno_meses: number;
  garantia_km: number | null;
};
type Item = {
  id?: string;
  tipo: TipoItem;
  peca_id?: string | null;
  servico_id?: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  ordem: number;
};
type Orcamento = {
  id: string;
  numero: number;
  status: "aberto" | "convertido";
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_cpf: string | null;
  placa: string | null;
  fabricante: string | null;
  modelo: string | null;
  cor: string | null;
  observacao: string | null;
  desconto: number;
  subtotal_pecas: number;
  subtotal_mao_de_obra: number;
  total: number;
  os_id: string | null;
  created_at: string;
  expires_at: string;
  orcamento_itens: Item[];
};

type Draft = Omit<
  Orcamento,
  | "id"
  | "numero"
  | "status"
  | "created_at"
  | "expires_at"
  | "orcamento_itens"
  | "os_id"
  | "subtotal_pecas"
  | "subtotal_mao_de_obra"
  | "total"
> & {
  id?: string;
  numero?: number;
  status?: "aberto" | "convertido";
  created_at?: string;
  expires_at?: string;
  os_id?: string | null;
  itens: Item[];
};

const novoDraft = (): Draft => ({
  cliente_nome: "",
  cliente_telefone: "",
  cliente_cpf: "",
  placa: "",
  fabricante: "",
  modelo: "",
  cor: "",
  observacao: "",
  desconto: 0,
  itens: [],
});

function diasRestantes(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

function valorItens(itens: Item[], tipo: TipoItem) {
  return itens
    .filter((item) => item.tipo === tipo)
    .reduce((total, item) => total + Number(item.valor_total || 0), 0);
}

function Orcamentos() {
  const { role, user } = useAuth();
  const gerente = role === "gerente";
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [pecaBusca, setPecaBusca] = useState("");
  const [servicoBusca, setServicoBusca] = useState("");
  const [draft, setDraft] = useState<Draft>(novoDraft());

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ["orcamentos"],
    enabled: gerente,
    queryFn: async () => {
      await (supabase as any).rpc("limpar_orcamentos_expirados");
      const { data, error } = await (supabase as any)
        .from("orcamentos")
        .select("*, orcamento_itens(*)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Orcamento[];
    },
  });

  const { data: pecas = [] } = useQuery({
    queryKey: ["orcamentos-pecas"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pecas")
        .select("id,nome,sku,marca,preco_venda,estoque,deleted_at")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Peca[];
    },
  });

  const { data: config } = useQuery({
    queryKey: ["orcamentos-config"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("nome_oficina,endereco,telefone,cnpj")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: catalogo = [] } = useQuery({
    queryKey: ["orcamentos-servicos"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos_catalogo")
        .select("id,nome,preco_padrao,ativo,deleted_at,retorno_meses,garantia_km")
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Catalogo[];
    },
  });

  const lista = useMemo(
    () =>
      (orcamentos as Orcamento[]).filter((item) =>
        matches(busca, [
          String(item.numero),
          item.cliente_nome,
          item.cliente_telefone,
          item.placa,
          item.modelo,
        ]),
      ),
    [orcamentos, busca],
  );
  const pecasFiltradas = useMemo(
    () => pecas.filter((p) => matches(pecaBusca, [p.nome, p.sku, p.marca])).slice(0, 8),
    [pecas, pecaBusca],
  );
  const servicosFiltrados = useMemo(
    () => catalogo.filter((s) => matches(servicoBusca, [s.nome])).slice(0, 8),
    [catalogo, servicoBusca],
  );

  const totais = useMemo(() => {
    const pecasTotal = valorItens(draft.itens, "peca");
    const maoDeObraTotal = valorItens(draft.itens, "mao_de_obra");
    const desconto = Math.max(Number(draft.desconto || 0), 0);
    return {
      pecasTotal,
      maoDeObraTotal,
      bruto: pecasTotal + maoDeObraTotal,
      desconto,
      total: Math.max(pecasTotal + maoDeObraTotal - desconto, 0),
    };
  }, [draft.itens, draft.desconto]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (draft.status === "convertido")
        throw new Error("Este orçamento já foi convertido em OS e não pode mais ser editado.");
      if (draft.itens.length === 0)
        throw new Error("Adicione pelo menos uma peça ou serviço ao orçamento.");
      if (!user?.id) throw new Error("Sessão expirada. Entre novamente para salvar o orçamento.");
      const dados = {
        cliente_nome: draft.cliente_nome?.trim() || null,
        cliente_telefone: draft.cliente_telefone?.trim() || null,
        cliente_cpf: draft.cliente_cpf?.trim() || null,
        placa: draft.placa?.trim() || null,
        fabricante: draft.fabricante?.trim() || null,
        modelo: draft.modelo?.trim() || null,
        cor: draft.cor?.trim() || null,
        observacao: draft.observacao?.trim() || null,
        desconto: totais.desconto,
      };
      const itens = draft.itens.map((item, index) => ({
        tipo: item.tipo,
        peca_id: item.peca_id ?? null,
        servico_id: item.servico_id ?? null,
        descricao: item.descricao,
        quantidade: Number(item.quantidade),
        valor_unitario: Number(item.valor_unitario),
        ordem: index,
      }));
      const result = await (supabase as any).rpc("salvar_orcamento", {
        _orcamento_id: draft.id ?? null,
        _dados: dados,
        _itens: itens,
      });
      if (result.error) throw result.error;
      return result.data as Orcamento;
    },
    onSuccess: (saved) => {
      toast.success(`Orçamento #${saved.numero} salvo por 15 dias.`);
      setDraft(novoDraft());
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const iniciarServico = useMutation({
    mutationFn: async (id: string) => {
      const result = await (supabase as any).rpc("iniciar_atendimento_orcamento", {
        _orcamento_id: id,
      });
      if (result.error) throw result.error;
      return result.data as string;
    },
    onSuccess: (osId) => {
      toast.success("Serviço iniciado a partir do orçamento.");
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
      if (osId) window.location.assign(`/atendimento/${osId}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const result = await (supabase as any).from("orcamentos").delete().eq("id", id);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Orçamento excluído definitivamente.");
      if (draft.id) setDraft(novoDraft());
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const adicionarItem = (tipo: TipoItem, dados: Partial<Item>) => {
    const quantidade = Number(dados.quantidade ?? 1);
    const valorUnitario = Number(dados.valor_unitario ?? 0);
    setDraft((atual) => ({
      ...atual,
      itens: [
        ...atual.itens,
        {
          tipo,
          descricao: dados.descricao ?? "",
          quantidade,
          valor_unitario: valorUnitario,
          valor_total: quantidade * valorUnitario,
          ordem: atual.itens.length,
          peca_id: dados.peca_id ?? null,
          servico_id: dados.servico_id ?? null,
        },
      ],
    }));
  };

  const editarItem = (index: number, patch: Partial<Item>) =>
    setDraft((atual) => ({
      ...atual,
      itens: atual.itens.map((item, i) => {
        if (i !== index) return item;
        const novo = { ...item, ...patch };
        return {
          ...novo,
          quantidade: Number(novo.quantidade),
          valor_unitario: Number(novo.valor_unitario),
          valor_total: Number(novo.quantidade) * Number(novo.valor_unitario),
        };
      }),
    }));
  const removerItem = (index: number) =>
    setDraft((atual) => ({ ...atual, itens: atual.itens.filter((_, i) => i !== index) }));
  const editar = (item: Orcamento) =>
    setDraft({ ...item, itens: (item.orcamento_itens ?? []).sort((a, b) => a.ordem - b.ordem) });

  const gerarPdf = () => {
    const now = new Date();
    const numero = draft.numero ?? "novo";
    const rows = (tipo: TipoItem) =>
      draft.itens
        .filter((item) => item.tipo === tipo)
        .map(
          (item, index) =>
            `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${esc(item.descricao)}</td><td>${item.quantidade}</td><td>${brl(item.valor_unitario)}</td><td>${brl(item.valor_total)}</td></tr>`,
        )
        .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento #${numero}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#242424;font-size:10px;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #a31525;padding-bottom:8px}header img{width:70px}header .office{text-align:right;font-size:9px;line-height:1.45}h1{font-size:12px;margin:0;text-transform:uppercase}.band{background:#171717;color:#fff;padding:8px 10px;margin:10px 0;display:flex;justify-content:space-between;font-weight:bold}.band span{font-weight:normal;font-size:9px;line-height:1.4;text-align:right}.boxes{display:grid;grid-template-columns:1fr 1fr;gap:8px}.box{border:1px solid #cfcfcf;padding:7px;min-height:70px}.box strong,.section-title{display:block;color:#a31525;font-size:9px;text-transform:uppercase;margin-bottom:5px}.box p{margin:2px 0}.section-title{border:1px solid #cfcfcf;border-bottom:0;padding:5px;margin:10px 0 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d5d5d5;padding:4px;text-align:left}th{font-size:8px;text-transform:uppercase;background:#f6f6f6}th:nth-child(1),td:nth-child(1){width:28px;text-align:center}th:nth-child(3),td:nth-child(3){width:42px;text-align:center}th:nth-child(n+4),td:nth-child(n+4){text-align:right}.bottom{display:grid;grid-template-columns:1.2fr .8fr;gap:8px;margin-top:10px}.conditions{border:1px solid #cfcfcf;padding:7px;min-height:90px}.conditions p{margin:4px 0}.summary{border:1px solid #cfcfcf;padding:7px}.summary div{display:flex;justify-content:space-between;margin:6px 0}.summary .total{border-top:1px solid #a31525;color:#a31525;font-size:14px;font-weight:bold;padding-top:7px}.foot{border-top:1px solid #cfcfcf;text-align:center;color:#777;font-size:8px;margin-top:14px;padding-top:5px}@media print{.no-print{display:none}}</style></head><body><header><img src="${location.origin}/dk-logo.webp"><div class="office"><h1>${esc(config?.nome_oficina || "DK Auto Center")}</h1><div>${config?.cnpj ? `CNPJ: ${esc(config.cnpj)}` : ""}</div><div>${esc(config?.endereco || "")}</div><div>${config?.telefone ? `Tel: ${esc(config.telefone)}` : ""}</div></div></header><div class="band">ORÇAMENTO Nº ${numero}<span>Data de emissão: ${now.toLocaleDateString("pt-BR")}<br>Validade: 15 dias</span></div><div class="boxes"><div class="box"><strong>Dados do cliente</strong><p>Razão Social: ${esc(draft.cliente_nome || "")}</p><p>CPF/CNPJ: ${esc(draft.cliente_cpf || "")}</p><p>Telefone: ${esc(draft.cliente_telefone || "")}</p></div><div class="box"><strong>Dados do veículo</strong><p>Modelo: ${esc([draft.fabricante, draft.modelo].filter(Boolean).join(" "))}</p><p>Placa: ${esc(draft.placa || "")}</p><p>Cor: ${esc(draft.cor || "")}</p></div></div><div class="section-title">Produtos / peças</div><table><thead><tr><th>Item</th><th>Descrição dos produtos</th><th>Qtd</th><th>Valor unit.</th><th>Valor total</th></tr></thead><tbody>${rows("peca") || '<tr><td colspan="5">Nenhuma peça adicionada.</td></tr>'}</tbody></table><div class="section-title">Mão de obra / serviços</div><table><thead><tr><th>Item</th><th>Descrição do serviço</th><th>Qtd</th><th>Valor unit.</th><th>Valor total</th></tr></thead><tbody>${rows("mao_de_obra") || '<tr><td colspan="5">Nenhum serviço adicionado.</td></tr>'}</tbody></table><div class="bottom"><div class="conditions"><strong class="section-title" style="border:0;padding:0;margin:0">Observações e condições</strong><p>${esc(draft.observacao || "Orçamento válido por 15 dias a partir da data de emissão.")}</p><p>Os valores e condições devem ser confirmados no momento da aprovação do serviço.</p></div><div class="summary"><strong class="section-title" style="border:0;padding:0;margin:0">Resumo financeiro</strong><div><span>Valor bruto:</span><span>${brl(totais.bruto)}</span></div><div><span>Desconto:</span><span>- ${brl(totais.desconto)}</span></div><div class="total"><span>Subtotal:</span><span>${brl(totais.total)}</span></div></div></div><div class="foot">DK Auto Center · Gestão de oficina · Documento para orçamento</div><p class="no-print" style="text-align:center"><button onclick="window.print()">Imprimir / salvar como PDF</button></p></body></html>`;
    const win = window.open("", "_blank", "width=900,height=900");
    if (!win) {
      toast.error("Permita janelas pop-up para gerar o PDF.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  if (!gerente)
    return (
      <AppShell>
        <PageHeader title="Orçamentos" subtitle="Acesso restrito" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Somente o gerente pode criar e consultar orçamentos.
          </CardContent>
        </Card>
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader title="Orçamentos" subtitle="Composição rápida, clara e válida por 15 dias">
        <Button variant="outline" onClick={() => setDraft(novoDraft())}>
          <i className="fa-solid fa-plus" /> Novo orçamento
        </Button>
        <Button variant="outline" onClick={gerarPdf} disabled={draft.itens.length === 0}>
          <i className="fa-solid fa-file-pdf" /> PDF
        </Button>
        <Button
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending || draft.status === "convertido" || draft.itens.length === 0}
        >
          {salvar.isPending ? "Salvando…" : "Salvar orçamento"}
        </Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="font-display text-xl uppercase">Salvos</CardTitle>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar número, cliente ou placa"
            />
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!isLoading && lista.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum orçamento válido.</p>
            )}
            {lista.map((item) => {
              const dias = diasRestantes(item.expires_at);
              return (
                <div
                  key={item.id}
                  className={`rounded-md border p-3 transition-colors ${draft.id === item.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <button type="button" onClick={() => editar(item)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <strong>#{item.numero}</strong>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {dias <= 2 && (
                          <i
                            title="Expira em até 2 dias"
                            className="fa-solid fa-circle text-[8px] text-destructive"
                          />
                        )}
                        {item.status === "convertido" ? "Convertido" : `${dias} dias`}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm">
                      {item.cliente_nome || item.placa || "Sem identificação"}
                    </p>
                    <p className="text-xs text-muted-foreground">{brl(item.total)}</p>
                  </button>
                  <div className="mt-2 flex gap-2 border-t pt-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => editar(item)}>
                      <i className="fa-solid fa-pen-to-square" /> Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Excluir este orçamento definitivamente? Esta ação não pode ser desfeita.",
                          )
                        )
                          excluir.mutate(item.id);
                      }}
                    >
                      <i className="fa-solid fa-trash" /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl uppercase">
                Dados do orçamento {draft.numero ? `#${draft.numero}` : "novo"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cliente e veículo são opcionais. Preencha somente o que já estiver disponível.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Cliente</Label>
                <Input
                  value={draft.cliente_nome ?? ""}
                  onChange={(e) => setDraft({ ...draft, cliente_nome: e.target.value })}
                  placeholder="Nome ou razão social"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={draft.cliente_telefone ?? ""}
                  onChange={(e) => setDraft({ ...draft, cliente_telefone: e.target.value })}
                  placeholder="(87) 99999-0000"
                />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input
                  value={draft.cliente_cpf ?? ""}
                  onChange={(e) => setDraft({ ...draft, cliente_cpf: e.target.value })}
                />
              </div>
              <div>
                <Label>Placa</Label>
                <Input
                  value={draft.placa ?? ""}
                  onChange={(e) => setDraft({ ...draft, placa: e.target.value })}
                  placeholder="ABC1D23"
                />
              </div>
              <div>
                <Label>Fabricante</Label>
                <Input
                  value={draft.fabricante ?? ""}
                  onChange={(e) => setDraft({ ...draft, fabricante: e.target.value })}
                  placeholder="Fiat"
                />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input
                  value={draft.modelo ?? ""}
                  onChange={(e) => setDraft({ ...draft, modelo: e.target.value })}
                  placeholder="Modelo do veículo"
                />
              </div>
              <div>
                <Label>Cor</Label>
                <Input
                  value={draft.cor ?? ""}
                  onChange={(e) => setDraft({ ...draft, cor: e.target.value })}
                />
              </div>
              <div>
                <Label>Desconto (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.desconto}
                  onChange={(e) => setDraft({ ...draft, desconto: Number(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg uppercase">Produtos / peças</CardTitle>
                <Input
                  value={pecaBusca}
                  onChange={(e) => setPecaBusca(e.target.value)}
                  placeholder="Buscar peça, código ou marca"
                />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {pecasFiltradas.map((peca) => (
                  <button
                    key={peca.id}
                    onClick={() => {
                      adicionarItem("peca", {
                        peca_id: peca.id,
                        descricao: [peca.nome, peca.marca].filter(Boolean).join(" · "),
                        valor_unitario: Number(peca.preco_venda),
                      });
                      setPecaBusca("");
                    }}
                    className="flex w-full items-center justify-between rounded border p-2 text-left text-sm hover:border-primary"
                  >
                    <span>
                      <strong>{peca.nome}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {peca.sku || "Sem código"} · estoque {peca.estoque}
                      </span>
                    </span>
                    <span className="font-semibold">{brl(peca.preco_venda)}</span>
                  </button>
                ))}
                {pecaBusca && pecasFiltradas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg uppercase">
                  Mão de obra / serviços
                </CardTitle>
                <Input
                  value={servicoBusca}
                  onChange={(e) => setServicoBusca(e.target.value)}
                  placeholder="Buscar serviço"
                />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {servicosFiltrados.map((servico) => (
                  <button
                    key={servico.id}
                    onClick={() => {
                      adicionarItem("mao_de_obra", {
                        servico_id: servico.id,
                        descricao: servico.nome,
                        valor_unitario: Number(servico.preco_padrao),
                      });
                      setServicoBusca("");
                    }}
                    className="flex w-full items-center justify-between rounded border p-2 text-left text-sm hover:border-primary"
                  >
                    <span>{servico.nome}</span>
                    <span className="font-semibold">{brl(servico.preco_padrao)}</span>
                  </button>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Outro serviço"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                        adicionarItem("mao_de_obra", {
                          descricao: e.currentTarget.value.trim(),
                          valor_unitario: 0,
                        });
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                  <Badge variant="outline">Enter para adicionar</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg uppercase">Itens do orçamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.itens.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Selecione peças ou serviços acima para começar.
                </p>
              )}
              {draft.itens.map((item, index) => (
                <div
                  key={`${item.id ?? "novo"}-${index}`}
                  className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_90px_120px_120px_auto] md:items-end"
                >
                  <div>
                    <Badge variant="outline" className="mb-1">
                      {item.tipo === "peca" ? "Peça" : "Mão de obra"}
                    </Badge>
                    <Input
                      value={item.descricao}
                      onChange={(e) => editarItem(index, { descricao: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Qtd.</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantidade}
                      onChange={(e) => editarItem(index, { quantidade: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Unitário</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.valor_unitario}
                      onChange={(e) =>
                        editarItem(index, { valor_unitario: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Total</Label>
                    <Input value={brl(item.valor_total)} readOnly />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover item"
                    onClick={() => removerItem(index)}
                  >
                    <i className="fa-solid fa-trash" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_280px]">
              <div>
                <Label>Observações e condições</Label>
                <Textarea
                  value={draft.observacao ?? ""}
                  onChange={(e) => setDraft({ ...draft, observacao: e.target.value })}
                  placeholder="Condições, prazo, observações para o cliente…"
                />
              </div>
              <div className="rounded-md border bg-muted/20 p-4 text-sm">
                <div className="flex justify-between">
                  <span>Produtos / peças</span>
                  <strong>{brl(totais.pecasTotal)}</strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Mão de obra</span>
                  <strong>{brl(totais.maoDeObraTotal)}</strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Desconto</span>
                  <strong>- {brl(totais.desconto)}</strong>
                </div>
                <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold text-primary">
                  <span>Total</span>
                  <strong>{brl(totais.total)}</strong>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={gerarPdf} disabled={!draft.itens.length}>
                    <i className="fa-solid fa-file-pdf" /> Gerar PDF
                  </Button>
                  {draft.id && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Excluir este orçamento definitivamente? Esta ação não pode ser desfeita.",
                          )
                        )
                          excluir.mutate(draft.id!);
                      }}
                    >
                      <i className="fa-solid fa-trash" /> Excluir
                    </Button>
                  )}
                  {draft.id && draft.status !== "convertido" && (
                    <Button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Iniciar uma OS com os dados deste orçamento? O orçamento não baixará estoque nem lançará caixa.",
                          )
                        )
                          iniciarServico.mutate(draft.id!);
                      }}
                      disabled={iniciarServico.isPending}
                    >
                      {iniciarServico.isPending ? "Iniciando…" : "Iniciar serviço"}
                    </Button>
                  )}
                  {draft.id && draft.status === "convertido" && (
                    <Button variant="outline" disabled>
                      OS já iniciada
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
