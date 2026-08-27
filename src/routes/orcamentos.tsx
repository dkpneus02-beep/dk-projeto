/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl, matches } from "@/lib/format";
import { maskDocument, maskPhone } from "@/lib/masks";

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
  cliente_endereco: string | null;
  cliente_bairro_cidade: string | null;
  cliente_email: string | null;
  placa: string | null;
  placa_anterior: string | null;
  fabricante: string | null;
  modelo: string | null;
  veiculo_especie_tipo: string | null;
  ano_fabricacao_modelo: string | null;
  cilindrada: string | null;
  cor: string | null;
  chassi: string | null;
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
  pagamento_pix?: boolean;
};

const novoDraft = (): Draft => ({
  cliente_nome: "",
  cliente_telefone: "",
  cliente_cpf: "",
  cliente_endereco: "",
  cliente_bairro_cidade: "",
  cliente_email: "",
  placa: "",
  placa_anterior: "",
  fabricante: "",
  modelo: "",
  veiculo_especie_tipo: "",
  ano_fabricacao_modelo: "",
  cilindrada: "",
  cor: "",
  chassi: "",
  observacao: "",
  desconto: 0,
  itens: [],
  pagamento_pix: false,
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
  const [editorOpen, setEditorOpen] = useState(false);

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
    () => pecas.filter((p) => matches(pecaBusca, [p.nome, p.sku, p.marca])),
    [pecas, pecaBusca],
  );
  const servicosFiltrados = useMemo(
    () => catalogo.filter((s) => matches(servicoBusca, [s.nome])),
    [catalogo, servicoBusca],
  );

  const totais = useMemo(() => {
    const pecasTotal = valorItens(draft.itens, "peca");
    const maoDeObraTotal = valorItens(draft.itens, "mao_de_obra");
    const desconto = draft.pagamento_pix ? pecasTotal * 0.25 : 0;
    return {
      pecasTotal,
      maoDeObraTotal,
      bruto: pecasTotal + maoDeObraTotal,
      desconto,
      total: Math.max(pecasTotal + maoDeObraTotal - desconto, 0),
    };
  }, [draft.itens, draft.pagamento_pix]);

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
        cliente_endereco: draft.cliente_endereco?.trim() || null,
        cliente_bairro_cidade: draft.cliente_bairro_cidade?.trim() || null,
        cliente_email: draft.cliente_email?.trim() || null,
        placa: draft.placa?.trim() || null,
        placa_anterior: draft.placa_anterior?.trim() || null,
        fabricante: draft.fabricante?.trim() || null,
        modelo: draft.modelo?.trim() || null,
        veiculo_especie_tipo: draft.veiculo_especie_tipo?.trim() || null,
        ano_fabricacao_modelo: draft.ano_fabricacao_modelo?.trim() || null,
        cilindrada: draft.cilindrada?.trim() || null,
        cor: draft.cor?.trim() || null,
        chassi: draft.chassi?.trim() || null,
        observacao: draft.observacao?.trim() || null,
        desconto: totais.desconto,
        pagamento_pix: Boolean(draft.pagamento_pix),
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
      setEditorOpen(false);
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
  const editar = (item: Orcamento) => {
    setDraft({
      ...item,
      pagamento_pix: Number(item.desconto || 0) > 0,
      itens: (item.orcamento_itens ?? []).sort((a, b) => a.ordem - b.ordem),
    });
    setEditorOpen(true);
  };

  const gerarPdf = async () => {
    const currentDraft = draft;
    let pdfDraft = currentDraft;
    try {
      const saved = await salvar.mutateAsync();
      pdfDraft = { ...currentDraft, ...saved, itens: currentDraft.itens };
    } catch {
      return;
    }
    const now = new Date();
    const numero = pdfDraft.numero ?? "novo";
    const display = (value: string | null | undefined) => esc(value?.trim() || "Não informado");
    let itemNumber = 0;
    const rows = (tipo: TipoItem) =>
      pdfDraft.itens
        .filter((item) => item.tipo === tipo)
        .map((item) => {
          itemNumber += 1;
          return `<tr><td class="item-no">${String(itemNumber).padStart(2, "0")}</td><td class="description">${esc(item.descricao)}</td><td class="center">${item.quantidade}</td><td class="money">${brl(item.valor_unitario)}</td><td class="money">${brl(item.valor_total)}</td></tr>`;
        })
        .join("");
    const section = (tipo: TipoItem, title: string, empty: string) => {
      const content = rows(tipo);
      return `<div class="section-title">${title}</div><table><thead><tr><th class="item-no">ITEM</th><th>DESCRIÇÃO</th><th class="center">QTD</th><th class="money">VALOR UNIT.<br>(R$)</th><th class="money">VALOR TOTAL<br>(R$)</th></tr></thead><tbody>${content || `<tr><td colspan="5" class="empty">${empty}</td></tr>`}</tbody></table>`;
    };
    const descontoLabel = pdfDraft.pagamento_pix ? "Desconto especial Pix (25%)" : "Desconto Pix";
    const descontoText = pdfDraft.pagamento_pix
      ? `Aplicado exclusivamente sobre o valor original das peças (${brl(totais.pecasTotal)}), reduzindo o subtotal das peças para ${brl(Math.max(totais.pecasTotal - totais.desconto, 0))}. A mão de obra (${brl(totais.maoDeObraTotal)}) não participa da base de cálculo.`
      : "Não aplicado neste orçamento. Quando selecionado, incide exclusivamente sobre peças.";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento #${numero}</title><style>
      @page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,"Helvetica Neue",sans-serif;color:#26313d;font-size:10px;line-height:1.35;margin:0;background:#fff}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #a62f38;padding:2px 0 10px;margin-bottom:12px}header img{width:72px;height:auto}header .office{text-align:right;line-height:1.45;color:#374151}header h1{font-size:17px;letter-spacing:.5px;color:#9d2933;margin:0 0 2px;text-transform:uppercase}header strong{color:#26313d}.band{background:#1d1d1d;color:#fff;border-radius:3px;padding:10px 14px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:700;letter-spacing:.4px}.band span{font-size:10px;font-weight:400;line-height:1.55;text-align:right;letter-spacing:0}.boxes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.box{border:1px solid #d7dbe0;border-radius:2px;padding:10px 12px;min-height:136px}.box strong,.section-title{display:block;color:#9d2933;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.box strong{font-size:11px;border-bottom:1px solid #dfe3e7;padding-bottom:6px;margin-bottom:7px}.box p{margin:3px 0;font-size:10px}.section-title{font-size:11px;margin:11px 0 0;padding:6px 9px;border:1px solid #d7dbe0;border-bottom:0;background:#fff}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 7px}th,td{border:1px solid #d7dbe0;padding:6px 7px;vertical-align:middle}th{background:#25364d;color:#fff;font-size:8.5px;text-align:left;letter-spacing:.25px}td{font-size:10px}tbody tr:nth-child(even){background:#f7f9fb}.item-no{width:45px;text-align:center}.center{width:52px;text-align:center}.money{width:92px;text-align:right;white-space:nowrap}.description{overflow-wrap:anywhere}.empty{text-align:center;color:#687482;padding:10px}.bottom{display:grid;grid-template-columns:1.22fr .78fr;gap:12px;margin-top:11px}.conditions,.summary{border:1px solid #d7dbe0;border-radius:2px;padding:10px 12px}.conditions .section-title,.summary .section-title{border:0;background:transparent;margin:0 0 7px;padding:0}.conditions p{margin:6px 0;font-size:10px}.pix-note{background:#e8f6ef;border-left:4px solid #42a879;border-radius:3px;padding:8px 9px;color:#30634b;margin-top:8px}.summary div{display:flex;justify-content:space-between;gap:10px;margin:7px 0;font-size:10px}.summary .discount{color:#a62f38}.summary .total{border-top:2px solid #a62f38;color:#9d2933;font-size:17px;font-weight:700;padding-top:9px;margin-top:9px}.foot{border-top:1px solid #d7dbe0;text-align:center;color:#7b8490;font-size:8px;margin-top:14px;padding-top:7px}.no-print{margin-top:12px;text-align:center}.no-print button{border:1px solid #9d2933;background:#9d2933;color:#fff;border-radius:3px;padding:7px 13px}@media print{.no-print{display:none}}
    </style></head><body><header><img src="${location.origin}/dk-logo.webp"><div class="office"><h1>${esc(config?.nome_oficina || "DK Auto Center")}</h1><div><strong>CNPJ:</strong> ${display(config?.cnpj)}</div><div><strong>Endereço:</strong> ${display(config?.endereco)}</div><div><strong>Telefone / WhatsApp:</strong> ${display(config?.telefone)}</div></div></header><div class="band">ORÇAMENTO Nº ${numero}<span>Data de Emissão: ${now.toLocaleDateString("pt-BR")}<br>Validade: 15 dias</span></div><div class="boxes"><div class="box"><strong>Dados do cliente</strong><p><b>Razão Social/Nome:</b> ${display(pdfDraft.cliente_nome)}</p><p><b>CPF/CNPJ:</b> ${display(pdfDraft.cliente_cpf)}</p><p><b>Endereço:</b> ${display(pdfDraft.cliente_endereco)}</p><p><b>Bairro/Cidade:</b> ${display(pdfDraft.cliente_bairro_cidade)}</p><p><b>E-mail:</b> ${display(pdfDraft.cliente_email)}</p><p><b>Telefone:</b> ${display(pdfDraft.cliente_telefone)}</p></div><div class="box"><strong>Dados do veículo</strong><p><b>Modelo:</b> ${display([pdfDraft.fabricante, pdfDraft.modelo].filter(Boolean).join(" "))}</p><p><b>Espécie / Tipo:</b> ${display(pdfDraft.veiculo_especie_tipo)}</p><p><b>Placa Atual:</b> ${display(pdfDraft.placa)}</p><p><b>Placa Anterior:</b> ${display(pdfDraft.placa_anterior)}</p><p><b>Ano Fab. / Modelo:</b> ${display(pdfDraft.ano_fabricacao_modelo)}</p><p><b>Cilindrada:</b> ${display(pdfDraft.cilindrada)}</p><p><b>Cor:</b> ${display(pdfDraft.cor)}</p><p><b>Chassi:</b> ${display(pdfDraft.chassi)}</p></div></div>${section("peca", "Produtos / peças", "Nenhuma peça adicionada.")}${section("mao_de_obra", "Mão de obra / serviços", "Nenhum serviço adicionado.")}<div class="bottom"><div class="conditions"><strong class="section-title">Observações e condições</strong><p>${esc(pdfDraft.observacao || "Orçamento válido por 15 dias a partir da data de emissão.")}</p><p><b>Emissão de NF-e:</b> As notas fiscais são emitidas mediante a confirmação do pagamento.</p><p><b>${descontoLabel}:</b> ${descontoText}</p><div class="pix-note"><b>${pdfDraft.pagamento_pix ? "Desconto especial Pix (25%)" : "Condição de desconto"}:</b> ${descontoText}</div></div><div class="summary"><strong class="section-title">Resumo financeiro</strong><div><span>Valor bruto:</span><span>${brl(totais.bruto)}</span></div><div><span>Peças:</span><span>${brl(totais.pecasTotal)}</span></div><div><span>Mão de obra:</span><span>${brl(totais.maoDeObraTotal)}</span></div><div class="discount"><span>${descontoLabel}:</span><span>- ${brl(totais.desconto)}</span></div><div><span>Peças após desconto:</span><span>${brl(Math.max(totais.pecasTotal - totais.desconto, 0))}</span></div><div class="total"><span>Subtotal:</span><span>${brl(totais.total)}</span></div></div></div><div class="foot">DK Auto Center · ${display(config?.endereco)} · Tel: ${display(config?.telefone)}</div><p class="no-print"><button onclick="window.print()">Imprimir / salvar como PDF</button></p></body></html>`;
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
        <Button
          onClick={() => {
            setDraft(novoDraft());
            setEditorOpen(true);
          }}
        >
          <i className="fa-solid fa-plus" /> Criar orçamento
        </Button>
      </PageHeader>
      <div className="max-w-3xl">
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
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">
                {draft.numero ? `Editar orçamento #${draft.numero}` : "Novo orçamento"}
              </DialogTitle>
              <DialogDescription>
                Preencha somente o que já estiver disponível. Cliente e veículo são opcionais.
              </DialogDescription>
            </DialogHeader>
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
                    <Label>Razão Social/Nome</Label>
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
                      onChange={(e) =>
                        setDraft({ ...draft, cliente_telefone: maskPhone(e.target.value) })
                      }
                      placeholder="(87) 99999-0000"
                    />
                  </div>
                  <div>
                    <Label>CPF/CNPJ</Label>
                    <Input
                      value={draft.cliente_cpf ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, cliente_cpf: maskDocument(e.target.value) })
                      }
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={draft.cliente_email ?? ""}
                      onChange={(e) => setDraft({ ...draft, cliente_email: e.target.value })}
                      placeholder="cliente@exemplo.com"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Endereço</Label>
                    <Input
                      value={draft.cliente_endereco ?? ""}
                      onChange={(e) => setDraft({ ...draft, cliente_endereco: e.target.value })}
                      placeholder="Rua, número e complemento"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Bairro/Cidade</Label>
                    <Input
                      value={draft.cliente_bairro_cidade ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, cliente_bairro_cidade: e.target.value })
                      }
                      placeholder="Bairro, cidade e UF"
                    />
                  </div>
                  <div>
                    <Label>Placa Atual</Label>
                    <Input
                      value={draft.placa ?? ""}
                      onChange={(e) => setDraft({ ...draft, placa: e.target.value.toUpperCase() })}
                      placeholder="ABC1D23"
                    />
                  </div>
                  <div>
                    <Label>Placa Anterior</Label>
                    <Input
                      value={draft.placa_anterior ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, placa_anterior: e.target.value.toUpperCase() })
                      }
                      placeholder="Opcional"
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
                    <Label>Espécie / Tipo</Label>
                    <Input
                      value={draft.veiculo_especie_tipo ?? ""}
                      onChange={(e) => setDraft({ ...draft, veiculo_especie_tipo: e.target.value })}
                      placeholder="Automóvel"
                    />
                  </div>
                  <div>
                    <Label>Ano Fab. / Modelo</Label>
                    <Input
                      value={draft.ano_fabricacao_modelo ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, ano_fabricacao_modelo: e.target.value })
                      }
                      placeholder="2022 / 2023"
                    />
                  </div>
                  <div>
                    <Label>Cilindrada</Label>
                    <Input
                      value={draft.cilindrada ?? ""}
                      onChange={(e) => setDraft({ ...draft, cilindrada: e.target.value })}
                      placeholder="1.0"
                    />
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <Input
                      value={draft.cor ?? ""}
                      onChange={(e) => setDraft({ ...draft, cor: e.target.value })}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Chassi</Label>
                    <Input
                      value={draft.chassi ?? ""}
                      onChange={(e) => setDraft({ ...draft, chassi: e.target.value.toUpperCase() })}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 lg:col-span-2">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.pagamento_pix)}
                        onChange={(e) => setDraft({ ...draft, pagamento_pix: e.target.checked })}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span>
                        <strong className="block text-sm">Pagamento via Pix</strong>
                        <span className="text-xs text-muted-foreground">
                          Desconto de 25% aplicado somente sobre peças. A mão de obra não recebe
                          desconto.
                        </span>
                      </span>
                    </label>
                  </div>
                </CardContent>
              </Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display text-lg uppercase">
                      Produtos / peças
                    </CardTitle>
                    <Input
                      value={pecaBusca}
                      onChange={(e) => setPecaBusca(e.target.value)}
                      placeholder="Buscar peça, código ou marca"
                    />
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
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
                    </div>
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
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
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
                    </div>
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
                  <CardTitle className="font-display text-lg uppercase">
                    Itens do orçamento
                  </CardTitle>
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
                          onChange={(e) =>
                            editarItem(index, { quantidade: Number(e.target.value) })
                          }
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
                      <span>{draft.pagamento_pix ? "Desconto Pix (25% peças)" : "Desconto"}</span>
                      <strong>- {brl(totais.desconto)}</strong>
                    </div>
                    {draft.pagamento_pix && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Desconto exclusivo para pagamento via Pix e aplicado somente nas peças.
                      </p>
                    )}
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
          </DialogContent>
        </Dialog>
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
