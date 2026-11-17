import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  brl,
  d,
  dt,
  FORMAS_PAGAMENTO,
  matches,
  norm,
  statusLabel,
  whatsappLink,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { isGerente, canEditServico } from "@/lib/permissions";
import { printReceipt } from "@/lib/receipt";
import { uploadVistoriaImgBB } from "@/lib/imgbb";
import { normalizarFotos, type VistoriaFoto } from "@/lib/vistoria";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { BarcodeCameraDialog } from "@/components/BarcodeCameraDialog";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/atendimento/$id")({
  head: () => ({
    meta: [
      { title: "Atendimento | DK Auto Center" },
      { name: "description", content: "Ordem de serviço com checklist, mecânicos e pagamento." },
      { property: "og:title", content: "Atendimento | DK Auto Center" },
      { property: "og:description", content: "Ordem de serviço da oficina DK Auto Center." },
    ],
  }),
  component: AtendimentoPage,
});

function AtendimentoPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, user, nome, mecanicoId } = useAuth();
  const gerente = isGerente(role);
  const pecaRapidaStorageKey = user?.id ? `dk:peca-rapida:${user.id}:${id}` : null;
  const pecaRapidaStorageKeyRef = useRef(pecaRapidaStorageKey);
  const [finalizando, setFinalizando] = useState(false);
  const [pecaRapidaOpen, setPecaRapidaOpen] = useState(false);
  const [pecaRapida, setPecaRapida] = useState({ nome: "", quantidade: 1, precoUnitario: 0, descontoPercentual: 20 });
  const [pecaRapidaRequestId, setPecaRapidaRequestId] = useState<string>(() => crypto.randomUUID());
  const [pecaRapidaRestaurada, setPecaRapidaRestaurada] = useState(false);
  const [pecaRapidaProntaPara, setPecaRapidaProntaPara] = useState<string | null>(null);
  const [editarDadosOpen, setEditarDadosOpen] = useState(false);
  const [novaAvaria, setNovaAvaria] = useState("");
  const [fotoBusy, setFotoBusy] = useState(false);
  const [fotoInputKey, setFotoInputKey] = useState(0);
  const [fotoSelecionada, setFotoSelecionada] = useState<string | null>(null);
  const [filtrosPeca, setFiltrosPeca] = useState<
    Record<string, { busca: string; tipo: string; codigoExato?: string | null }>
  >({});
  const [cameraServicoId, setCameraServicoId] = useState<string | null>(null);
  const [scannerServicoId, setScannerServicoId] = useState<string | null>(null);
  const [reciboPergunta, setReciboPergunta] = useState<null | {
    atendimento: Parameters<typeof printReceipt>[0];
    servicos: Parameters<typeof printReceipt>[1];
    pagamentos: Parameters<typeof printReceipt>[2];
  }>(null);

  useEffect(() => {
    pecaRapidaStorageKeyRef.current = pecaRapidaStorageKey;
  }, [pecaRapidaStorageKey]);

  useEffect(() => {
    if (!pecaRapidaStorageKey) {
      setPecaRapidaProntaPara(null);
      return;
    }
    setPecaRapidaProntaPara(null);
    setPecaRapidaOpen(false);
    setPecaRapida({ nome: "", quantidade: 1, precoUnitario: 0, descontoPercentual: 20 });
    setPecaRapidaRequestId(crypto.randomUUID());
    setPecaRapidaRestaurada(false);
    try {
      const salvo = sessionStorage.getItem(pecaRapidaStorageKey);
      if (salvo) {
        const rascunho: unknown = JSON.parse(salvo);
        if (!rascunho || typeof rascunho !== "object") throw new Error("Rascunho inválido");
        const item = rascunho as Record<string, unknown>;
        if (
          typeof item["requestId"] !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(item["requestId"] as string) ||
          typeof item["nome"] !== "string" ||
          !Number.isFinite(Number(item["quantidade"])) ||
          !Number.isFinite(Number(item["precoUnitario"])) ||
          !Number.isFinite(Number(item["descontoPercentual"]))
        ) throw new Error("Rascunho inválido");
        setPecaRapidaRequestId(item["requestId"] as string);
        setPecaRapida({
          nome: item["nome"] as string,
          quantidade: Number(item["quantidade"]),
          precoUnitario: Number(item["precoUnitario"]),
          descontoPercentual: Number(item["descontoPercentual"]),
        });
        setPecaRapidaRestaurada(true);
      }
    } catch {
      try { sessionStorage.removeItem(pecaRapidaStorageKey); } catch { /* storage indisponível */ }
    } finally {
      setPecaRapidaProntaPara(pecaRapidaStorageKey);
    }
  }, [pecaRapidaStorageKey]);
  const pecaRapidaPronta = !!pecaRapidaStorageKey && pecaRapidaProntaPara === pecaRapidaStorageKey;

  const aplicarCodigoNaBuscaPeca = (codigo: string, servicoId = cameraServicoId) => {
    const busca = codigo.trim();
    if (!servicoId || !busca) return;
    setFiltrosPeca((atual) => {
      const filtro = atual[servicoId] ?? { busca: "", tipo: "todos" };
      return {
        ...atual,
        [servicoId]: { ...filtro, busca, tipo: "todos", codigoExato: norm(busca) },
      };
    });
  };

  const aplicarCodigoDoLeitor = (codigo: string) => {
    if (scannerServicoId) aplicarCodigoNaBuscaPeca(codigo, scannerServicoId);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["atendimento", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, atendimento_servicos(*), pagamentos(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: mecanicos } = useQuery({
    queryKey: ["mecanicos-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mecanicos")
        .select("*")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: catalogo } = useQuery({
    queryKey: ["catalogo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos_catalogo")
        .select("*")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: pecas } = useQuery({
    queryKey: ["pecas-ativas-atendimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pecas")
        .select("*")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!role,
  });

  const { data: referenciasPecas = [] } = useQuery({
    queryKey: ["peca-referencias-atendimento", role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peca_referencias")
        .select("peca_id, marca, referencia, observacao")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: gerente,
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("*").maybeSingle();
      return data;
    },
  });

  const servicos = useMemo(
    () => [...(data?.atendimento_servicos ?? [])].sort((a, b) => a.nome.localeCompare(b.nome)),
    [data],
  );
  const referenciasPecaPorId = useMemo(() => {
    const agrupadas = new Map<
      string,
      { marca: string; referencia: string; observacao: string | null }[]
    >();
    referenciasPecas.forEach((referencia) => {
      const atuais = agrupadas.get(referencia.peca_id) ?? [];
      atuais.push(referencia);
      agrupadas.set(referencia.peca_id, atuais);
    });
    return agrupadas;
  }, [referenciasPecas]);
  const total = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const todosConcluidos = servicos.length > 0 && servicos.every((s) => s.status === "concluido");
  const finalizado = data?.status === "finalizado";
  const aguardandoGerente = data?.status === "aguardando_gerente";
  const servicoScanner = servicos.find((servico) => servico.id === scannerServicoId);
  const scannerHabilitado = Boolean(
    role &&
    !finalizado &&
    !cameraServicoId &&
    servicoScanner &&
    (gerente || canEditServico(role, servicoScanner.mecanico_id, mecanicoId)),
  );
  useBarcodeScanner(aplicarCodigoDoLeitor, scannerHabilitado);

  const marcarPronto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("atendimentos")
        .update({
          status: "aguardando_gerente",
          pronto_at: new Date().toISOString(),
          pronto_por: user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço marcado como pronto — o gerente foi avisado.");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addServico = useMutation({
    mutationFn: async (payload: {
      nome: string;
      retorno_meses: number;
      garantia_km: number | null;
      valor: number;
      peca_id?: string | null;
      quantidade?: number;
    }) => {
      const { error } = await supabase.from("atendimento_servicos").insert({
        atendimento_id: id,
        nome: payload.nome,
        valor: payload.valor,
        retorno_meses: payload.retorno_meses,
        garantia_km: payload.garantia_km,
        peca_id: payload.peca_id ?? null,
        quantidade: payload.quantidade ?? 1,
        mecanico_id: gerente ? null : mecanicoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço adicionado e total da OS recalculado.");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updServico = useMutation({
    mutationFn: async ({
      sid,
      patch,
    }: {
      sid: string;
      patch: TablesUpdate<"atendimento_servicos">;
    }) => {
      const { error } = await supabase.from("atendimento_servicos").update(patch).eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço atualizado e total da OS recalculado.");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delServico = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase.from("atendimento_servicos").delete().eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço excluído e total da OS recalculado.");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarAtendimento = useMutation({
    mutationFn: async (patch: TablesUpdate<"atendimentos">) => {
      const { error } = await supabase.from("atendimentos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento atualizado");
      void qc.invalidateQueries({ queryKey: ["atendimento", id] });
    },
  });

  const atualizarPecaRapida = (patch: Partial<typeof pecaRapida>) => {
    const atualizada = { ...pecaRapida, ...patch };
    const requestId = crypto.randomUUID();
    setPecaRapida(atualizada);
    setPecaRapidaRequestId(requestId);
    setPecaRapidaRestaurada(false);
    if (pecaRapidaStorageKey) {
      try {
        sessionStorage.setItem(pecaRapidaStorageKey, JSON.stringify({ requestId, ...atualizada }));
      } catch {
        // A operação ainda funciona nesta sessão; a restauração após reload fica indisponível.
      }
    }
  };

  const adicionarPecaRapida = useMutation({
    mutationFn: async (solicitacao: {
      atendimentoId: string;
      storageKey: string;
      requestId: string;
      nome: string;
      quantidade: number;
      precoUnitario: number;
      descontoPercentual: number;
    }) => {
      if (!solicitacao.storageKey || solicitacao.storageKey !== pecaRapidaStorageKeyRef.current) {
        throw new Error("A OS mudou durante a operação. Confira os dados e tente novamente.");
      }
      if (!solicitacao.nome.trim()) throw new Error("Informe o nome da peça como deve aparecer na nota.");
      if (solicitacao.quantidade <= 0 || solicitacao.precoUnitario < 0) {
        throw new Error("Informe quantidade maior que zero e preço unitário válido.");
      }
      if (solicitacao.descontoPercentual < 0 || solicitacao.descontoPercentual > 100) {
        throw new Error("O desconto deve ficar entre 0% e 100%.");
      }
      const { data, error } = await supabase.rpc("adicionar_peca_rapida_atendimento", {
        _atendimento_id: solicitacao.atendimentoId,
        _nome: solicitacao.nome.trim(),
        _quantidade: solicitacao.quantidade,
        _preco_unitario: solicitacao.precoUnitario,
        _desconto_percentual: solicitacao.descontoPercentual,
        _request_id: solicitacao.requestId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, solicitacao) => {
      toast.success("Peça provisória vinculada à OS. Configure o cadastro e confira o estoque depois.");
      try { sessionStorage.removeItem(solicitacao.storageKey); } catch { /* ignorar indisponibilidade do storage */ }
      if (solicitacao.storageKey === pecaRapidaStorageKeyRef.current) {
        setPecaRapidaOpen(false);
        setPecaRapida({ nome: "", quantidade: 1, precoUnitario: 0, descontoPercentual: 20 });
        setPecaRapidaRequestId(crypto.randomUUID());
        setPecaRapidaRestaurada(false);
      }
      void qc.invalidateQueries({ queryKey: ["atendimento", solicitacao.atendimentoId] });
      void qc.invalidateQueries({ queryKey: ["pecas"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const marcarAtendimentoPago = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("marcar_atendimento_pago", { _atendimento_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recebimento registrado no caixa.");
      void qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Carregando atendimento…</p>
      </AppShell>
    );
  }

  const avarias = (data.avarias as string[]) ?? [];
  const fotos = normalizarFotos(data.fotos);

  const adicionarAvaria = async () => {
    const avaria = novaAvaria.trim();
    if (!avaria || avarias.includes(avaria)) return;
    await salvarAtendimento.mutateAsync({ avarias: [...avarias, avaria] });
    setNovaAvaria("");
  };

  const removerAvaria = async (avaria: string) => {
    await salvarAtendimento.mutateAsync({ avarias: avarias.filter((item) => item !== avaria) });
  };

  const anexarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setFotoBusy(true);
    try {
      const novasFotos: VistoriaFoto[] = [];
      for (const [index, file] of Array.from(files).entries()) {
        const foto = await uploadVistoriaImgBB(file, `vistoria-${data.placa}-${fotos.length + index + 1}`);
        novasFotos.push({ url: foto.url, deleteUrl: foto.deleteUrl });
      }
      if (novasFotos.length) {
        await salvarAtendimento.mutateAsync({ fotos: [...fotos, ...novasFotos] });
        toast.success(`${novasFotos.length} foto(s) publicada(s) no ImgBB e adicionada(s) à vistoria`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anexar as fotos.");
    } finally {
      setFotoBusy(false);
    }
  };

  const removerFoto = async (foto: VistoriaFoto) => {
    await salvarAtendimento.mutateAsync({ fotos: fotos.filter((item) => item.url !== foto.url) });
    if (foto.deleteUrl) {
      try {
        await fetch(foto.deleteUrl, { method: "GET" });
      } catch {
        // A foto já foi removida da OS; o ImgBB pode manter um arquivo órfão antigo.
      }
    }
    if (fotoSelecionada === foto.url) setFotoSelecionada(null);
    toast.success("Foto removida da vistoria.");
  };

  const gerarRecibo = async (marcarComoPago: boolean) => {
    if (!reciboPergunta) return;
    const win = window.open("", "_blank", "width=420,height=760");
    if (!win) {
      toast.error("Permita a abertura da janela para gerar a nota.");
      return;
    }
    win.document.write("<p style='font:16px Arial;padding:24px'>Preparando a nota…</p>");
    try {
      if (marcarComoPago) await marcarAtendimentoPago.mutateAsync();
      const pagamentos = reciboPergunta.pagamentos.map((pagamento) => ({
        ...pagamento,
        pago: marcarComoPago,
      }));
      const reciboGerado = await printReceipt(
        reciboPergunta.atendimento,
        reciboPergunta.servicos,
        pagamentos,
        {
          nome_oficina: config?.nome_oficina || "DK Auto Center",
          endereco: config?.endereco ?? "",
          telefone: config?.telefone ?? "",
          cnpj: config?.cnpj ?? "",
          pix_chave: config?.pix_chave ?? "32801574000155",
          pix_nome_recebedor: config?.pix_nome_recebedor ?? "DK AUTO CENTER",
          pix_cidade: config?.pix_cidade ?? "SALGUEIRO",
        },
        win,
      );
      if (!reciboGerado) {
        toast.error("Não foi possível preparar a nota. Confira a configuração Pix e tente novamente.");
        return;
      }
      setReciboPergunta(null);
      void navigate({ to: "/patio" });
    } catch (error) {
      win.document.body.textContent = error instanceof Error ? error.message : "Não foi possível gerar a nota.";
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o pagamento.");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`OS #${data.numero} · ${data.placa}`}
        subtitle={`${[data.fabricante, data.modelo, data.cor].filter(Boolean).join(" · ")} — ${data.cliente_nome}`}
      >
        <Button variant="outline" asChild>
          <Link to="/patio">
            <i className="fa-solid fa-arrow-left" /> Voltar
          </Link>
        </Button>
        {!finalizado && !aguardandoGerente && !gerente && (
          <Button
            disabled={!todosConcluidos || marcarPronto.isPending}
            onClick={() => marcarPronto.mutate()}
          >
            {marcarPronto.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            <i className="fa-solid fa-flag-checkered" /> Enviar para conferência do gerente
          </Button>
        )}
        {!finalizado && gerente && (
          <Button disabled={!todosConcluidos} onClick={() => setFinalizando(true)}>
            <i className="fa-solid fa-flag-checkered" /> Finalizar e entregar
          </Button>
        )}
      </PageHeader>

      {aguardandoGerente && !finalizado && (
        <div className="card-surface mb-6 flex items-center gap-3 p-4">
          <i className="fa-solid fa-bell text-xl text-primary" />
          <div>
            <p className="font-semibold">Aguardando finalização do gerente</p>
            <p className="text-sm text-muted-foreground">
              O mecânico marcou este atendimento como pronto
              {data?.pronto_at ? ` em ${dt(data.pronto_at)}` : ""}.
              {gerente
                ? ' Confira e clique em "Finalizar e entregar".'
                : " O gerente foi notificado."}
            </p>
          </div>
        </div>
      )}

      {finalizado && (
        <div className="card-surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              Finalizado em {dt(data.finalizado_at)} · Total {brl(data.total)}
            </p>
            <p className="mt-1 text-sm font-medium">
              {(data.pagamentos ?? []).some((pagamento) => pagamento.pago === false)
                ? "Pagamento pendente — ainda não lançado no caixa"
                : "Pagamento recebido"}
            </p>
            <GarantiaTag ate={data.garantia_ate} km={data.garantia_km} kmEntrada={data.km} />
          </div>
          {gerente && (data.pagamentos ?? []).some((pagamento) => pagamento.pago === false) && (
            <ConfirmActionDialog
              trigger={
                <Button disabled={marcarAtendimentoPago.isPending}>
                  <i className="fa-solid fa-cash-register" /> Confirmar recebimento
                </Button>
              }
              title="Confirmar recebimento da OS"
              description={<>Confirma que recebeu <strong className="text-foreground">{brl(data.total)}</strong>? Os pagamentos serão lançados no caixa aberto.</>}
              confirmLabel="Sim, registrar no caixa"
              onConfirm={() => marcarAtendimentoPago.mutateAsync()}
            />
          )}
          <Button variant="outline" asChild>
            <a
              href={whatsappLink(
                data.cliente_telefone,
                `Olá ${data.cliente_nome}, seu ${data.modelo ?? "veículo"} (${data.placa}) está pronto! Serviços: ${servicos.map((s) => s.nome).join(", ")}. Total ${brl(data.total)}. Termo de garantia válido até ${d(data.garantia_ate)}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <i className="fa-brands fa-whatsapp" /> Enviar OS por WhatsApp
            </a>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          <div className="card-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold uppercase">Serviços e peças</h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-sm text-muted-foreground">Total dos serviços: {brl(total)}</span>
                {!finalizado && gerente && (
                  <Button type="button" variant="outline" disabled={!pecaRapidaPronta} onClick={() => setPecaRapidaOpen(true)}>
                    <i className="fa-solid fa-bolt" /> Peça rápida
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {servicos.map((s) => {
                const filtroPeca = filtrosPeca[s.id] ?? { busca: "", tipo: "todos" };
                const pecasFiltradas = (pecas ?? []).filter((p) => {
                  if (p.cadastro_pendente) return false;
                  const referenciaPeca = referenciasPecaPorId.get(p.id) ?? [];
                  const correspondeAoCodigo = filtroPeca.codigoExato
                    ? norm(p.sku) === filtroPeca.codigoExato ||
                      referenciaPeca.some(
                        (referencia) => norm(referencia.referencia) === filtroPeca.codigoExato,
                      )
                    : matches(filtroPeca.busca, [
                        p.nome,
                        p.sku,
                        p.marca,
                        p.medida,
                        p.modelo_desenho,
                        ...referenciaPeca.flatMap((referencia) => [
                          referencia.marca,
                          referencia.referencia,
                          referencia.observacao,
                        ]),
                      ]);
                  return (
                    (filtroPeca.tipo === "todos" ||
                      p.tipo === filtroPeca.tipo ||
                      p.categoria === filtroPeca.tipo) &&
                    correspondeAoCodigo
                  );
                });
                const produtoVinculado = (pecas ?? []).find((produto) => produto.id === s.peca_id);
                const statusTone =
                  s.status === "concluido"
                    ? "border-l-success bg-success/5"
                    : s.status === "em_execucao"
                      ? "border-l-sky-500 bg-sky-500/5"
                      : "border-l-warning bg-warning/5";
                const statusIcon =
                  s.status === "concluido"
                    ? "fa-circle-check"
                    : s.status === "em_execucao"
                      ? "fa-screwdriver-wrench"
                      : "fa-hourglass-half";
                return (
                <div
                  key={s.id}
                  className={`min-w-0 overflow-hidden rounded-lg border border-l-4 bg-card p-4 shadow-sm ${statusTone}`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <i className={`fa-solid ${statusIcon} mr-1.5`} /> Serviço
                      </p>
                      <p className="truncate text-base font-semibold">{s.nome}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          <i className="fa-regular fa-clock mr-1" />
                          Início: {s.iniciado_at ? dt(s.iniciado_at) : "aguardando"}
                        </span>
                        <span>
                          <i className="fa-solid fa-flag-checkered mr-1" />
                          Fim: {s.concluido_at ? dt(s.concluido_at) : "em aberto"}
                        </span>
                      </div>
                      {s.peca_id && (
                        <div className="mt-1 min-w-0 space-y-0.5 text-xs text-muted-foreground">
                          <p className="break-words">
                            <i className="fa-solid fa-box-open mr-1" />
                            <strong>{produtoVinculado?.cadastro_pendente ? "Peça provisória (sem estoque configurado):" : "Produto do estoque:"}</strong>{" "}
                            {s.nome_peca_snapshot ?? produtoVinculado?.nome ?? "item do estoque"}
                          </p>
                          {produtoVinculado?.cadastro_pendente && (
                            <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 font-semibold text-amber-800">
                              Cadastro e contagem física pendentes. Esta peça não baixará estoque nem custo até o gerente concluir o cadastro.
                            </p>
                          )}
                          <p><strong>Quantidade:</strong> {Number(s.quantidade || 1)} · <strong>Valor registrado:</strong> {brl(s.valor)}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          s.status === "concluido"
                            ? "default"
                            : s.status === "em_execucao"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {statusLabel[s.status]}
                      </Badge>
                      {!finalizado && gerente && (
                        <ConfirmActionDialog
                          trigger={
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              title={`Excluir serviço ${s.nome}`}
                            >
                              <i className="fa-solid fa-trash-can text-xs" />
                            </button>
                          }
                          title="Excluir serviço da OS"
                          description={
                            <>
                              Tem certeza que deseja excluir <strong className="text-foreground">{s.nome}</strong> desta OS?
                              Essa ação remove o serviço do atendimento.
                            </>
                          }
                          confirmLabel="Excluir serviço"
                          destructive
                          onConfirm={() => delServico.mutateAsync(s.id)}
                        />
                      )}
                    </div>
                  </div>
                  {!finalizado &&
                    (gerente || canEditServico(role, s.mecanico_id, mecanicoId)) && (
                    <div className="mt-3 grid gap-2 rounded-md bg-muted/20 p-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>Status do serviço</Label>
                        <Select
                          value={s.status}
                          onValueChange={(v) =>
                            updServico.mutate({ sid: s.id, patch: { status: v } })
                          }
                        >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando">Aguardando</SelectItem>
                          <SelectItem value="em_execucao">Em execução</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Responsável pelo serviço</Label>
                        <Select
                          value={s.mecanico_id ?? "none"}
                          disabled={!gerente}
                          onValueChange={(v) =>
                            updServico.mutate({
                              sid: s.id,
                              patch: { mecanico_id: v === "none" ? null : v },
                            })
                          }
                        >
                        <SelectTrigger>
                          <SelectValue placeholder="Mecânico" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem mecânico</SelectItem>
                          {(mecanicos ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Preço da peça (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="num"
                          key={`${s.id}-preco-${s.preco_peca ?? 0}`}
                          defaultValue={Number(s.preco_peca ?? 0)}
                          onBlur={(e) =>
                            updServico.mutate({
                              sid: s.id,
                              patch: { preco_peca: Math.max(Number(e.target.value) || 0, 0) },
                            })
                          }
                        />
                        <Label>Mão de obra/adicional (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="num"
                          defaultValue={Number(s.mao_de_obra ?? 0)}
                          onBlur={(e) =>
                            updServico.mutate({
                              sid: s.id,
                              patch: { mao_de_obra: Math.max(Number(e.target.value) || 0, 0) },
                            })
                          }
                        />
                        <p className="text-xs font-semibold text-primary">Total: <span className="num">{brl(s.valor)}</span></p>
                      </div>
                      <div
                        className="grid min-w-0 gap-2 rounded-md border border-primary/10 bg-primary/5 p-3 sm:col-span-3 sm:grid-cols-[1fr_120px]"
                      >
                        <div className="space-y-1.5">
                          <Label>Produto/peça/óleo/pneu usado</Label>
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                            <Select
                              value={filtroPeca.tipo}
                              onValueChange={(tipo) =>
                                setFiltrosPeca((atual) => ({
                                  ...atual,
                                  [s.id]: { ...filtroPeca, tipo },
                                }))
                              }
                            >
                              <SelectTrigger aria-label="Filtrar estoque por tipo">
                                <SelectValue placeholder="Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todos">Todos os tipos</SelectItem>
                                <SelectItem value="pneu">Pneus</SelectItem>
                                <SelectItem value="peca">Peças e insumos</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex min-w-0 gap-2">
                              <Input
                                value={filtroPeca.busca}
                                onChange={(e) =>
                                  setFiltrosPeca((atual) => ({
                                    ...atual,
                                    [s.id]: {
                                      ...filtroPeca,
                                      busca: e.target.value,
                                      codigoExato: null,
                                    },
                                  }))
                                }
                                onFocus={() => setScannerServicoId(s.id)}
                                onBlur={() =>
                                  setScannerServicoId((atual) => (atual === s.id ? null : atual))
                                }
                                placeholder="Buscar por nome, SKU, código, marca ou medida..."
                                aria-label="Buscar item do estoque"
                                className="min-w-0 flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                aria-label="Ler código de barras pela câmera"
                                title="Ler código de barras pela câmera"
                                onClick={() => setCameraServicoId(s.id)}
                              >
                                <i className="fa-solid fa-camera" />
                                <span className="hidden sm:inline">Ler</span>
                              </Button>
                            </div>
                          </div>
                          <Select
                            value={s.peca_id ?? "none"}
                            onValueChange={(v) => {
                            const peca = (pecas ?? []).find((p) => p.id === v);
                            updServico.mutate({
                              sid: s.id,
                              patch: {
                                peca_id: v === "none" ? null : v,
                                quantidade: s.quantidade || 1,
                                preco_peca: peca && v !== "none" ? Number(peca.preco_venda) * Number(s.quantidade || 1) : 0,
                              },
                            });
                          }}
                        >
                          <SelectTrigger className="min-w-0 max-w-full">
                            <SelectValue
                              className="min-w-0 flex-1 truncate"
                              placeholder="Peça/óleo/pneu usado (opcional)"
                            />
                          </SelectTrigger>
                          <SelectContent
                            className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
                          >
                            <SelectItem value="none">Sem peça vinculada</SelectItem>
                            {pecasFiltradas.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                className="min-w-0 whitespace-normal"
                              >
                                <span className="block min-w-0 max-w-full break-words">
                                  {p.nome} · {p.tipo === "pneu" ? "pneu" : "peça/insumo"} ·
                                  estoque {Number(p.estoque)} · {brl(p.preco_venda)}
                                </span>
                              </SelectItem>
                            ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {scannerServicoId === s.id
                              ? "Leitor USB pronto: bipa o código para filtrar os itens."
                              : "Clique no campo e use o leitor USB, ou leia pela câmera."}{" "}
                            {pecasFiltradas.length} item(ns) encontrado(s) · a baixa ocorre somente na finalização da OS
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Quantidade usada</Label>
                        </div>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="num"
                          defaultValue={Number(s.quantidade || 1)}
                          disabled={!s.peca_id}
                          aria-label="Quantidade da peça"
                          onBlur={(e) => {
                            const quantidade = Math.max(Number(e.target.value) || 1, 0.01);
                            const pecaSelecionada = (pecas ?? []).find((p) => p.id === s.peca_id);
                            updServico.mutate({
                              sid: s.id,
                              patch: {
                                quantidade,
                                ...(pecaSelecionada
                                  ? { preco_peca: Number(pecaSelecionada.preco_venda) * quantidade }
                                  : {}),
                              },
                            });
                          }}
                        />
                        </div>
                      </div>
                    </div>
                  )}
                  {!finalizado &&
                    !gerente &&
                    !canEditServico(role, s.mecanico_id, mecanicoId) && (
                    <div className="mt-3 space-y-2 rounded-md border border-primary/10 bg-muted/20 p-3">
                      {/* Serviço de outro mecânico: somente status quando a regra permitir. */}
                      <Select
                        value={s.status}
                        disabled={!canEditServico(role, s.mecanico_id, mecanicoId)}
                        onValueChange={(v) =>
                          updServico.mutate({ sid: s.id, patch: { status: v } })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando">Aguardando</SelectItem>
                          <SelectItem value="em_execucao">Em execução</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                        </SelectContent>
                      </Select>
                      {!canEditServico(role, s.mecanico_id, mecanicoId) && (
                        <p className="text-xs text-muted-foreground">
                          <i className="fa-solid fa-lock mr-1" />
                          {s.mecanico_id
                            ? "Atribuído a outro mecânico — aguarde o gerente."
                            : "Ainda sem mecânico atribuído — peça ao gerente."}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        <strong>Responsável:</strong>{" "}
                        <span className="font-medium text-foreground">
                          {(mecanicos ?? []).find((m) => m.id === s.mecanico_id)?.nome ??
                            "sem mecânico atribuído"}
                        </span>{" "}
                      · <strong>Preço registrado:</strong> <span className="num">{brl(s.valor)}</span>
                    </p>
                    </div>
                  )}
                  {finalizado && (
                    <p className="mt-1 border-t pt-3 text-sm text-muted-foreground">
                      <strong>Responsável:</strong> {(mecanicos ?? []).find((m) => m.id === s.mecanico_id)?.nome ?? "—"}{" "}
                      · <span className="num">{brl(s.valor)}</span>
                    </p>
                  )}
                </div>
                );
              })}
              {servicos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum serviço adicionado ainda.</p>
              )}
            </div>

            {!finalizado && (
              <ChecklistServicos
                catalogo={catalogo ?? []}
                jaAdicionados={servicos.map((s) => s.nome)}
                onAdd={(item) => addServico.mutate(item)}
              />
            )}
          </div>

          <div className="card-surface space-y-4 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Vistoria de entrada</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="KM na entrada" value={data.km ? String(data.km) : "—"} />
              <Info label="Entrada" value={dt(data.entrada_at)} />
            </div>
            {(avarias.length > 0 || gerente) && (
              <div>
                <p className="mb-1 text-sm font-medium">Avarias registradas</p>
                <div className="flex flex-wrap gap-2">
                  {avarias.map((a) => (
                    <Badge key={a} variant="secondary" className="gap-1">
                      {a}
                      {gerente && !finalizado && (
                        <ConfirmActionDialog
                          trigger={<button type="button" className="ml-1 text-muted-foreground hover:text-destructive" title={`Remover avaria ${a}`}><i className="fa-solid fa-xmark" /></button>}
                          title="Remover avaria"
                          description={<>Tem certeza que deseja remover <strong className="text-foreground">{a}</strong> da vistoria?</>}
                          confirmLabel="Remover avaria"
                          destructive
                          onConfirm={() => removerAvaria(a)}
                        />
                      )}
                    </Badge>
                  ))}
                </div>
                {!finalizado && gerente && (
                  <div className="mt-3 flex gap-2">
                    <Input value={novaAvaria} onChange={(e) => setNovaAvaria(e.target.value)} placeholder="Adicionar nova avaria ou observação" />
                    <Button type="button" variant="outline" onClick={() => void adicionarAvaria()} disabled={!novaAvaria.trim() || salvarAtendimento.isPending}>
                      <i className="fa-solid fa-plus" /> Adicionar
                    </Button>
                  </div>
                )}
              </div>
            )}
            {fotos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {fotos.map((foto, index) => (
                  <div key={foto.url} className="relative overflow-hidden rounded-lg border bg-muted/20">
                    <button type="button" className="block w-full" onClick={() => setFotoSelecionada(foto.url)}>
                      <img
                        src={foto.url}
                        alt={`Foto ${index + 1} da vistoria do veículo`}
                        className="h-32 w-full object-cover transition hover:opacity-80 sm:h-36"
                        loading="lazy"
                      />
                    </button>
                    {!finalizado && gerente && (
                      <ConfirmActionDialog
                        trigger={
                          <button
                            type="button"
                            className="absolute right-1.5 top-1.5 rounded-full bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow"
                            title={`Excluir foto ${index + 1}`}
                            aria-label={`Excluir foto ${index + 1}`}
                          >
                            <i className="fa-solid fa-trash-can" />
                          </button>
                        }
                        title="Excluir foto da vistoria"
                        description="A foto será removida da OS. Deseja continuar?"
                        confirmLabel="Excluir foto"
                        destructive
                        onConfirm={() => removerFoto(foto)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            {!finalizado && gerente && (
              <div className="space-y-2">
                <Label>Adicionar fotos à vistoria</Label>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                    <i className="fa-solid fa-camera" /> Tirar foto
                    <Input
                      key={`camera-${fotoInputKey}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      disabled={fotoBusy}
                      onChange={(e) => {
                        const files = e.target.files;
                        setFotoInputKey((key) => key + 1);
                        void anexarFotos(files);
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
                      disabled={fotoBusy}
                      onChange={(e) => {
                        const files = e.target.files;
                        setFotoInputKey((key) => key + 1);
                        void anexarFotos(files);
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fotoBusy ? "Compactando e publicando as fotos…" : "Você pode adicionar várias fotos e visualizar qualquer uma tocando nela."}
                </p>
              </div>
            )}
            <Dialog open={Boolean(fotoSelecionada)} onOpenChange={(open) => !open && setFotoSelecionada(null)}>
              <DialogContent className="max-w-4xl p-2 sm:p-4">
                <DialogHeader>
                  <DialogTitle className="sr-only">Visualização da foto da vistoria</DialogTitle>
                </DialogHeader>
                {fotoSelecionada && (
                  <img src={fotoSelecionada} alt="Foto ampliada da vistoria" className="max-h-[75vh] w-full rounded-md object-contain" />
                )}
              </DialogContent>
            </Dialog>
            <div className="space-y-1.5">
              <Label>Alertas técnicos / recusa do cliente</Label>
              <Textarea
                defaultValue={data.alertas_tecnicos ?? ""}
                rows={3}
                onBlur={(e) => salvarAtendimento.mutate({ alertas_tecnicos: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação geral</Label>
              <Textarea
                defaultValue={data.observacao ?? ""}
                rows={2}
                onBlur={(e) => salvarAtendimento.mutate({ observacao: e.target.value })}
              />
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="card-surface space-y-2 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold uppercase">Cliente</h2>
              {!finalizado && gerente && (
                <Button variant="outline" size="sm" onClick={() => setEditarDadosOpen(true)}>
                  <i className="fa-solid fa-pen-to-square" /> Editar
                </Button>
              )}
            </div>
            <Info label="Nome" value={data.cliente_nome || "—"} />
            <Info label="Telefone" value={data.cliente_telefone || "—"} />
            <Info label="CPF" value={data.cliente_cpf || "—"} />
            {data.cliente_telefone && (
              <Button variant="outline" className="w-full" asChild>
                <a
                  href={whatsappLink(
                    data.cliente_telefone,
                    `Olá ${data.cliente_nome}, aqui é da DK Auto Center sobre o seu ${data.modelo ?? "veículo"} (${data.placa}).`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fa-brands fa-whatsapp" /> WhatsApp
                </a>
              </Button>
            )}
          </div>

          <div className="card-surface space-y-2 p-5">
            <h2 className="font-display text-xl font-bold uppercase">Resumo</h2>
            <Info
              label="Serviços"
              value={`${servicos.filter((s) => s.status === "concluido").length}/${servicos.length} concluídos`}
            />
            <Info label="Total dos serviços" value={brl(total)} />
            {finalizado && (
              <>
                <Info label="Desconto" value={brl(data.desconto)} />
                <Info label="Total da OS" value={brl(data.total)} />
                <div className="pt-2">
                  {(data.pagamentos ?? []).map((p) => (
                    <p key={p.id} className="num text-sm text-muted-foreground">
                      {p.forma}
                      {p.parcelas > 1 ? ` (${p.parcelas}x)` : ""} — {brl(p.valor)}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={pecaRapidaOpen}
        onOpenChange={(open) => {
          if (!adicionarPecaRapida.isPending) setPecaRapidaOpen(open);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">Peça rápida nesta OS</DialogTitle>
          </DialogHeader>
          {pecaRapidaRestaurada && (
            <p className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm">
              Uma tentativa interrompida foi recuperada. Reenvie sem alterar os dados para confirmar o resultado sem duplicar a peça.
            </p>
          )}
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Será criada ou reutilizada uma peça <strong>provisória</strong>, com o nome exatamente como aparecerá na nota. O valor informado fica nesta OS; o preço global do catálogo não é alterado. Ela não tem estoque/custo configurado e não dará baixa até o gerente concluir o cadastro e contar fisicamente o saldo.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome da peça (na nota)</Label>
              <Input
                autoFocus
                maxLength={150}
                disabled={!pecaRapidaPronta || adicionarPecaRapida.isPending}
                value={pecaRapida.nome}
                onChange={(event) => atualizarPecaRapida({ nome: event.target.value })}
                placeholder="Ex.: Filtro de óleo — marca/modelo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" min="0.01" step="0.01" disabled={!pecaRapidaPronta || adicionarPecaRapida.isPending} value={pecaRapida.quantidade} onChange={(event) => atualizarPecaRapida({ quantidade: Number(event.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço unitário (R$)</Label>
                <Input type="number" min="0" step="0.01" disabled={!pecaRapidaPronta || adicionarPecaRapida.isPending} value={pecaRapida.precoUnitario} onChange={(event) => atualizarPecaRapida({ precoUnitario: Number(event.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Desconto na peça (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" disabled={!pecaRapidaPronta || adicionarPecaRapida.isPending} value={pecaRapida.descontoPercentual} onChange={(event) => atualizarPecaRapida({ descontoPercentual: Number(event.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">Começa em 20%; pode ser alterado nesta peça e vale para qualquer forma de pagamento.</p>
            </div>
            <p className="num rounded-md bg-muted/30 p-3 text-sm">
              Total da peça antes do desconto: {brl(pecaRapida.quantidade * pecaRapida.precoUnitario)} · desconto: {brl(pecaRapida.quantidade * pecaRapida.precoUnitario * pecaRapida.descontoPercentual / 100)}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPecaRapidaOpen(false)} disabled={adicionarPecaRapida.isPending}>Cancelar</Button>
            <Button
              type="button"
              disabled={!pecaRapidaPronta || !pecaRapida.nome.trim() || pecaRapida.quantidade <= 0 || adicionarPecaRapida.isPending}
              onClick={() => adicionarPecaRapida.mutate({
                atendimentoId: id,
                storageKey: pecaRapidaStorageKey ?? "",
                requestId: pecaRapidaRequestId,
                nome: pecaRapida.nome,
                quantidade: pecaRapida.quantidade,
                precoUnitario: pecaRapida.precoUnitario,
                descontoPercentual: pecaRapida.descontoPercentual,
              })}
            >
              {adicionarPecaRapida.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
              Adicionar à OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!finalizado && gerente && (
        <EditarDadosOsDialog
          open={editarDadosOpen}
          atendimento={data}
          onClose={() => setEditarDadosOpen(false)}
          onSave={async (patch) => {
            await salvarAtendimento.mutateAsync(patch);
            setEditarDadosOpen(false);
          }}
        />
      )}

      {finalizando && gerente && (
        <FinalizarDialog
          atendimento={{
            id: data.id,
            numero: data.numero,
            placa: data.placa ?? "",
            modelo: data.modelo,
            cliente_nome: data.cliente_nome ?? "",
            cliente_telefone: data.cliente_telefone,
            km: data.km,
          }}
          servicos={servicos}
          pecas={pecas ?? []}
          mecanicos={(mecanicos ?? []).map((mecanico) => ({ id: mecanico.id, nome: mecanico.nome ?? "" }))}
          onClose={() => setFinalizando(false)}
          onDone={(resultado) => {
            setFinalizando(false);
            void qc.invalidateQueries();
            setReciboPergunta({
              atendimento: {
                numero: data.numero,
                placa: data.placa ?? "",
                modelo: data.modelo,
                fabricante: data.fabricante,
                km: data.km,
                cliente_nome: data.cliente_nome ?? "",
                cliente_telefone: data.cliente_telefone,
                desconto: resultado.desconto,
                total: resultado.total,
                finalizado_at: new Date().toISOString(),
                garantia_ate: resultado.garantia_ate,
              },
              servicos: servicos.map((s) => ({
                nome: s.tipo_item === "peca" || Boolean(s.peca_id)
                  ? s.nome_peca_snapshot ?? (pecas ?? []).find((p) => p.id === s.peca_id)?.nome ?? s.nome
                  : s.nome,
                valor: Number(s.valor),
                quantidade: Number(s.quantidade ?? 1),
              })),
              pagamentos: resultado.pagamentos.map((pagamento) => ({ ...pagamento, pago: false })),
            });
          }}
        />
      )}

      {reciboPergunta && (
        <AlertDialog open onOpenChange={() => {}}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display uppercase">
                Atendimento finalizado
              </AlertDialogTitle>
              <AlertDialogDescription>
                O cliente já pagou o valor da OS? Só confirme se o dinheiro foi efetivamente recebido. Se ainda não pagou, o recebimento continuará pendente e a nota mostrará QR Pix apenas para a parte Pix.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setReciboPergunta(null);
                  void navigate({ to: "/patio" });
                }}
              >
                Agora não
              </AlertDialogCancel>
              <Button
                type="button"
                variant="outline"
                disabled={marcarAtendimentoPago.isPending}
                onClick={() => void gerarRecibo(false)}
              >
                Ainda não pagou — {reciboPergunta.pagamentos.some((p) => p.forma.toLocaleLowerCase("pt-BR") === "pix") ? "QR Pix" : "nota pendente"}
              </Button>
              <Button
                type="button"
                disabled={marcarAtendimentoPago.isPending}
                onClick={() => void gerarRecibo(true)}
              >
                Já pagou — registrar no caixa
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <BarcodeCameraDialog
        open={cameraServicoId !== null}
        onOpenChange={(open) => {
          if (!open) setCameraServicoId(null);
        }}
        onDetected={aplicarCodigoNaBuscaPeca}
      />
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

export function GarantiaTag({
  ate,
  km,
  kmEntrada,
}: {
  ate: string | null;
  km: number | null;
  kmEntrada: number | null;
}) {
  if (!ate) return null;
  const dias = Math.round((new Date(ate).getTime() - Date.now()) / 86400000);
  const ativa = dias >= 0;
  return (
    <p className={`text-sm font-semibold ${ativa ? "text-success" : "text-destructive"}`}>
      <i className={`fa-solid ${ativa ? "fa-shield-halved" : "fa-triangle-exclamation"} mr-1`} />
      {ativa
        ? `Garantia ativa — faltam ${dias} dias (até ${d(ate)})`
        : `SERVIÇO FORA DA GARANTIA DESDE ${d(ate)}`}
      {km
        ? ` · limite ${km.toLocaleString("pt-BR")} km${kmEntrada ? ` (entrada ${kmEntrada.toLocaleString("pt-BR")} km)` : ""}`
        : ""}
    </p>
  );
}

function EditarDadosOsDialog({
  open,
  atendimento,
  onClose,
  onSave,
}: {
  open: boolean;
  atendimento: {
    cliente_nome: string | null;
    cliente_telefone: string | null;
    cliente_cpf: string | null;
    placa: string | null;
    fabricante: string | null;
    modelo: string | null;
    cor: string | null;
    km: number | null;
  };
  onClose: () => void;
  onSave: (patch: TablesUpdate<"atendimentos">) => Promise<void>;
}) {
  const [form, setForm] = useState({
    cliente_nome: atendimento.cliente_nome ?? "",
    cliente_telefone: atendimento.cliente_telefone ?? "",
    cliente_cpf: atendimento.cliente_cpf ?? "",
    placa: atendimento.placa ?? "",
    fabricante: atendimento.fabricante ?? "",
    modelo: atendimento.modelo ?? "",
    cor: atendimento.cor ?? "",
    km: atendimento.km == null ? "" : String(atendimento.km),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      cliente_nome: atendimento.cliente_nome ?? "",
      cliente_telefone: atendimento.cliente_telefone ?? "",
      cliente_cpf: atendimento.cliente_cpf ?? "",
      placa: atendimento.placa ?? "",
      fabricante: atendimento.fabricante ?? "",
      modelo: atendimento.modelo ?? "",
      cor: atendimento.cor ?? "",
      km: atendimento.km == null ? "" : String(atendimento.km),
    });
  }, [open, atendimento]);

  const setField = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    if (!form.cliente_nome.trim() || !form.placa.trim()) {
      toast.error("Nome do cliente e placa são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        cliente_nome: form.cliente_nome.trim(),
        cliente_telefone: form.cliente_telefone.trim() || null,
        cliente_cpf: form.cliente_cpf.trim() || null,
        placa: form.placa.trim().toUpperCase(),
        fabricante: form.fabricante.trim() || null,
        modelo: form.modelo.trim() || null,
        cor: form.cor.trim() || null,
        km: form.km.trim() ? Number(form.km) : null,
      });
      toast.success("Dados da OS atualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os dados.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Editar dados da OS</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Use esta tela para corrigir dados digitados na abertura ou completar o CPF depois. O histórico da OS, estoque e pagamentos permanecem preservados.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nome do cliente *</Label><Input value={form.cliente_nome} onChange={(e) => setField("cliente_nome", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.cliente_telefone} onChange={(e) => setField("cliente_telefone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>CPF</Label><Input value={form.cliente_cpf} onChange={(e) => setField("cliente_cpf", e.target.value)} placeholder="000.000.000-00" /></div>
          <div className="space-y-1.5"><Label>Placa *</Label><Input value={form.placa} onChange={(e) => setField("placa", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Quilometragem</Label><Input type="number" min="0" value={form.km} onChange={(e) => setField("km", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fabricante</Label><Input value={form.fabricante} onChange={(e) => setField("fabricante", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Modelo</Label><Input value={form.modelo} onChange={(e) => setField("modelo", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Cor</Label><Input value={form.cor} onChange={(e) => setField("cor", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <i className="fa-solid fa-circle-notch fa-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistServicos({
  catalogo,
  jaAdicionados,
  onAdd,
}: {
  catalogo: {
    id: string;
    nome: string;
    preco_padrao: number;
    retorno_meses: number;
    garantia_km: number | null;
  }[];
  jaAdicionados: string[];
  onAdd: (i: {
    nome: string;
    retorno_meses: number;
    garantia_km: number | null;
    valor: number;
  }) => void;
}) {
  const [outro, setOutro] = useState("");
  const [buscaServico, setBuscaServico] = useState("");
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const rapidos = ["Alinhamento", "Balanceamento", "Troca de óleo", "Troca de pneu"];

  useEffect(() => {
    try {
      setFavoritos(JSON.parse(localStorage.getItem("dk-pneus-servicos-favoritos") ?? "[]") as string[]);
    } catch {
      setFavoritos([]);
    }
  }, []);

  const disponiveis = catalogo.filter((c) => matches(buscaServico, [c.nome]));
  const adicionarRapido = (nome: string) => {
    const c = catalogo.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    if (!c || jaAdicionados.includes(c.nome)) return;
    onAdd({
      nome: c.nome,
      retorno_meses: c.retorno_meses,
      garantia_km: c.garantia_km,
      valor: Number(c.preco_padrao),
    });
  };

  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-3 text-sm font-medium">
        <i className="fa-solid fa-list-check mr-2 text-primary" /> Checklist de serviços
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {rapidos.map((nome) => (
          <Button key={nome} type="button" variant="outline" size="sm" onClick={() => adicionarRapido(nome)}>
            <i className="fa-solid fa-bolt" /> {nome}
          </Button>
        ))}
      </div>
      <Input
        value={buscaServico}
        onChange={(e) => setBuscaServico(e.target.value)}
        placeholder="Buscar serviço por nome..."
        className="mb-3"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {disponiveis.map((c) => {
          const marcado = jaAdicionados.includes(c.nome);
          const favorito = favoritos.includes(c.id);
          return (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox
                  checked={marcado}
                  disabled={marcado}
                  onCheckedChange={() =>
                    onAdd({
                      nome: c.nome,
                      retorno_meses: c.retorno_meses,
                      garantia_km: c.garantia_km,
                      valor: Number(c.preco_padrao),
                    })
                  }
                />
                <span className="truncate">{c.nome}</span>
              </label>
              <button
                type="button"
                className="text-muted-foreground hover:text-primary"
                title={favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                onClick={() => {
                  const proximo = favorito ? favoritos.filter((id) => id !== c.id) : [...favoritos, c.id];
                  setFavoritos(proximo);
                  localStorage.setItem("dk-pneus-servicos-favoritos", JSON.stringify(proximo));
                }}
              >
                <i className={`${favorito ? "fa-solid" : "fa-regular"} fa-star`} />
              </button>
            </div>
          );
        })}
        {disponiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          placeholder="Adicionar outro serviço"
        />
        <Button
          variant="outline"
          onClick={() => {
            if (!outro.trim()) return;
            onAdd({ nome: outro.trim(), retorno_meses: 6, garantia_km: null, valor: 0 });
            setOutro("");
          }}
        >
          <i className="fa-solid fa-plus" />
        </Button>
      </div>
    </div>
  );
}

type Servico = {
  id: string;
  nome: string;
  nome_peca_snapshot?: string | null;
  tipo_item?: string;
  valor: number;
  mecanico_id: string | null;
  peca_id: string | null;
  quantidade: number;
  preco_peca?: number | null;
  desconto_percentual?: number | null;
  retorno_meses: number;
  garantia_km: number | null;
};

type PecaDescontoPix = {
  id: string;
  nome: string;
  aceita_desconto_pix: boolean;
};

function FinalizarDialog({
  atendimento,
  servicos,
  pecas,
  mecanicos,
  onClose,
  onDone,
}: {
  atendimento: {
    id: string;
    numero: number;
    placa: string;
    modelo: string | null;
    cliente_nome: string;
    cliente_telefone: string | null;
    km: number | null;
  };
  servicos: Servico[];
  pecas: PecaDescontoPix[];
  mecanicos: { id: string; nome: string }[];
  onClose: () => void;
  onDone: (resultado: {
    desconto: number;
    total: number;
    garantia_ate: string | null;
    pagamentos: { forma: string; valor: number; parcelas: number }[];
  }) => void;
}) {
  const bruto = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const [descontoPorServico, setDescontoPorServico] = useState<Record<string, number>>({});
  const [configurarDescontoOpen, setConfigurarDescontoOpen] = useState(false);
  const elegivelNoCatalogo = (servico: Servico) =>
    Boolean(
      servico.peca_id && pecas.find((peca) => peca.id === servico.peca_id)?.aceita_desconto_pix,
    );
  const percentualDesconto = (servico: Servico) =>
    Object.prototype.hasOwnProperty.call(descontoPorServico, servico.id)
      ? Number(descontoPorServico[servico.id]) || 0
      : elegivelNoCatalogo(servico)
        ? Number(servico.desconto_percentual ?? 20)
        : 0;
  const pecasDaOs = servicos.filter((servico) => Boolean(servico.peca_id));
  const desconto = pecasDaOs.reduce((soma, servico) => {
    if (!elegivelNoCatalogo(servico)) return soma;
    return soma + Math.round(Number(servico.preco_peca ?? 0) * percentualDesconto(servico)) / 100;
  }, 0);

  useEffect(() => {
    const abrirConfiguracaoPix = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.code !== "KeyT"
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setConfigurarDescontoOpen(true);
    };

    window.addEventListener("keydown", abrirConfiguracaoPix, true);
    return () => window.removeEventListener("keydown", abrirConfiguracaoPix, true);
  }, []);

  const [pagamentos, setPagamentos] = useState([{ forma: "Dinheiro", valor: bruto, parcelas: 1 }]);
  const liquido = Math.max(bruto - desconto, 0);
  useEffect(() => {
    if (pagamentos.length !== 1 || pagamentos[0]?.valor === liquido) return;

    setPagamentos((atual) => {
      const unico = atual[0];
      if (atual.length !== 1 || !unico) return atual;
      return [{ ...unico, valor: liquido }];
    });
  }, [liquido, pagamentos]);
  const somaPag = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const ok = Math.abs(somaPag - liquido) < 0.01;
  const pagamentosParaEnviar =
    pagamentos.length === 1
      ? pagamentos.map((pagamento) => ({ ...pagamento, valor: Number(liquido.toFixed(2)) }))
      : pagamentos;
  const descontosParaEnviar = pecasDaOs.map((servico) => ({
    servico_id: servico.id,
    percentual: elegivelNoCatalogo(servico) ? percentualDesconto(servico) : 0,
  }));

  // Retorno agora é uma decisão manual do gerente, não mais gerado
  // automaticamente pelo sistema a partir do catálogo de serviços.
  const [necessitaRetorno, setNecessitaRetorno] = useState(false);
  const [dataRetorno, setDataRetorno] = useState("");

  const finalizar = useMutation({
    mutationFn: async () => {
      const { data: resultado, error } = await supabase.rpc("finalizar_atendimento_transacional", {
        _atendimento_id: atendimento.id,
        _descontos: descontosParaEnviar,
        _pagamentos: pagamentosParaEnviar.map((p) => ({
          forma: p.forma,
          valor: Number(p.valor),
          parcelas: p.parcelas,
        })),
        _necessita_retorno: necessitaRetorno,
        ...(necessitaRetorno && dataRetorno ? { _data_retorno_manual: dataRetorno } : {}),
      });
      if (error) throw error;
      const retorno = resultado as {
        garantia_ate?: string | null;
        desconto?: number;
        total?: number;
      } | null;
      return {
        garantiaAteStr: retorno?.garantia_ate ?? null,
        desconto: Number(retorno?.desconto ?? desconto),
        total: Number(retorno?.total ?? liquido),
      };
    },
    onSuccess: ({ garantiaAteStr, desconto: descontoFinal, total: totalFinal }) => {
      toast.success("OS finalizada; pagamentos ficaram pendentes até confirmar o recebimento.");
      onDone({
        desconto: descontoFinal,
        total: totalFinal,
        garantia_ate: garantiaAteStr,
        pagamentos: pagamentosParaEnviar.map((pagamento) => ({ ...pagamento, pago: false })),
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">
            Finalizar atendimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Cliente:</span> {atendimento.cliente_nome}
          </p>
          <p>
            <span className="text-muted-foreground">Veículo:</span> {atendimento.modelo}{" "}
            {atendimento.placa}
          </p>
        </div>

        <div className="rounded-md border">
          {servicos.map((s) => (
            <div
              key={s.id}
              className="flex justify-between border-b px-3 py-2 text-sm last:border-0"
            >
              <span>
                {s.tipo_item === "peca" || Boolean(s.peca_id)
                  ? s.nome_peca_snapshot ?? pecas.find((peca) => peca.id === s.peca_id)?.nome ?? s.nome
                  : s.nome}
                <span className="text-muted-foreground">
                  {" "}
                  · {mecanicos.find((m) => m.id === s.mecanico_id)?.nome ?? "sem mecânico"}
                </span>
              </span>
              <span className="num">{brl(s.valor)}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Desconto das peças</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-keyshortcuts="Alt+Shift+T"
                onClick={() => setConfigurarDescontoOpen(true)}
              >
                <i className="fa-solid fa-percent" /> Percentual por peça
                <kbd className="rounded border px-1.5 py-0.5 text-[10px]">Alt+Shift+T</kbd>
              </Button>
            </div>
            <p className="num font-semibold">{brl(desconto)}</p>
            <p className="text-xs text-muted-foreground">
              Percentuais definidos manualmente. O padrão para novas peças elegíveis é 20%; vale para qualquer forma de pagamento.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor final</Label>
            <p className="num font-display text-2xl font-bold">{brl(liquido)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pagamentos</Label>
          {pagamentos.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Select
                value={p.forma}
                onValueChange={(v) =>
                  setPagamentos((ps) => ps.map((x, j) => (i === j ? { ...x, forma: v } : x)))
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {p.forma === "Cartão de crédito" && (
                <Select
                  value={String(p.parcelas)}
                  onValueChange={(v) =>
                    setPagamentos((ps) =>
                      ps.map((x, j) => (i === j ? { ...x, parcelas: Number(v) } : x)),
                    )
                  }
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                type="number"
                step="0.01"
                className="num w-32"
                value={p.valor}
                onChange={(e) =>
                  setPagamentos((ps) =>
                    ps.map((x, j) => (i === j ? { ...x, valor: Number(e.target.value) } : x)),
                  )
                }
              />
              {pagamentos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}
                >
                  <i className="fa-solid fa-xmark" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPagamentos((ps) => [
                ...ps,
                { forma: "PIX", valor: Math.max(liquido - somaPag, 0), parcelas: 1 },
              ])
            }
          >
            <i className="fa-solid fa-plus" /> Adicionar pagamento
          </Button>
          {!ok && (
            <p className="text-sm text-destructive">
              A soma dos pagamentos ({brl(somaPag)}) precisa ser igual a {brl(liquido)}.
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <Label>Necessita de retorno?</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={necessitaRetorno ? "default" : "outline"}
              onClick={() => setNecessitaRetorno(true)}
            >
              Sim
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!necessitaRetorno ? "default" : "outline"}
              onClick={() => {
                setNecessitaRetorno(false);
                setDataRetorno("");
              }}
            >
              Não
            </Button>
          </div>
          {necessitaRetorno && (
            <div className="space-y-1.5 pt-1">
              <Label>Data de retorno</Label>
              <Input
                type="date"
                className="num"
                value={dataRetorno}
                onChange={(e) => setDataRetorno(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!ok || (necessitaRetorno && !dataRetorno) || finalizar.isPending}
            onClick={() => finalizar.mutate()}
          >
            {finalizar.isPending && <i className="fa-solid fa-circle-notch fa-spin" />}
            Confirmar e finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={configurarDescontoOpen} onOpenChange={setConfigurarDescontoOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-cols-1 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">
              Desconto Pix desta OS
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe o percentual de desconto para cada peça desta OS. O valor começa em 20%, pode ser ajustado ou zerado e não depende da forma de pagamento.
          </p>
          {pecasDaOs.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Esta OS não tem peças vinculadas para configurar o desconto.
            </p>
          ) : (
            <div className="space-y-2">
              {pecasDaOs.map((servico) => {
                const peca = pecas.find((item) => item.id === servico.peca_id);
                const valorPeca = Math.max(Number(servico.preco_peca ?? 0), 0);
                const percentual = percentualDesconto(servico);
                const elegivel = elegivelNoCatalogo(servico);
                const descontoItem = Math.round(valorPeca * percentual) / 100;

                return (
                  <div
                    key={servico.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block">{servico.nome_peca_snapshot ?? peca?.nome ?? servico.nome}</strong>
                      <span className="block text-xs text-muted-foreground">
                        Valor da peça: {brl(valorPeca)} · Desconto: {brl(descontoItem)}
                      </span>
                    </span>
                    <div className="w-28 space-y-1">
                      <Label htmlFor={`desconto-${servico.id}`}>Percentual (%)</Label>
                      <Input
                        id={`desconto-${servico.id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={percentual}
                        disabled={!elegivel}
                        onChange={(event) =>
                          setDescontoPorServico((atual) => ({
                            ...atual,
                            [servico.id]: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                          }))
                        }
                        aria-label={`Percentual de desconto em ${servico.nome_peca_snapshot ?? peca?.nome ?? servico.nome}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setConfigurarDescontoOpen(false)}>
              Concluído
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
