import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { isGerente } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

type FormaPagamento = "PIX" | "Dinheiro" | "Débito" | "Crédito";
type Taxas = {
  pix_percentual: number;
  dinheiro_percentual: number;
  debito_percentual: number;
  credito_1x_percentual: number;
  credito_2x_percentual: number;
  credito_3x_percentual: number;
  credito_4x_percentual: number;
  credito_5x_percentual: number;
  credito_6x_percentual: number;
  credito_7x_percentual: number;
  credito_8x_percentual: number;
  credito_9x_percentual: number;
  credito_10x_percentual: number;
  credito_11x_percentual: number;
  credito_12x_percentual: number;
};
type VendaRegistrada = {
  id: string;
  criado_em: string;
  forma_pagamento: string;
  parcelas: number;
  total_cobrado: number;
  taxa_maquininha: number;
  valor_real_recebido: number;
  cmv: number;
  lucro_real: number;
};

const camposCredito = Array.from(
  { length: 12 },
  (_, index) => `credito_${index + 1}x_percentual`,
) as Array<keyof Taxas>;
const taxasIniciais: Taxas = {
  pix_percentual: 0,
  dinheiro_percentual: 0,
  debito_percentual: 0,
  ...(Object.fromEntries(camposCredito.map((campo) => [campo, 0])) as Pick<
    Taxas,
    (typeof camposCredito)[number]
  >),
};

function centavos(valor: number) {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
}

export const Route = createFileRoute("/repasse-taxas")({
  head: () => ({ meta: [{ title: "Repasse de taxas | DK Auto Center" }] }),
  component: RepasseTaxas,
});

function RepasseTaxas() {
  const { role } = useAuth();
  const gerente = isGerente(role);
  const qc = useQueryClient();
  const [configAberta, setConfigAberta] = useState(false);
  const [taxas, setTaxas] = useState<Taxas>(taxasIniciais);
  const [valorUnitario, setValorUnitario] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const [forma, setForma] = useState<FormaPagamento>("PIX");
  const [parcelas, setParcelas] = useState(1);
  const [desconto, setDesconto] = useState(0);
  const [cmv, setCmv] = useState(0);

  const { data: taxasSalvas } = useQuery({
    queryKey: ["financeiro-taxas-repasse"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_taxas_repasse")
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as Taxas;
    },
  });
  const { data: vendas = [] } = useQuery({
    queryKey: ["financeiro-vendas-repasse"],
    enabled: gerente,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_vendas_repasse")
        .select(
          "id, criado_em, forma_pagamento, parcelas, total_cobrado, taxa_maquininha, valor_real_recebido, cmv, lucro_real",
        )
        .is("deleted_at", null)
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as VendaRegistrada[];
    },
  });

  useEffect(() => {
    if (taxasSalvas) setTaxas({ ...taxasIniciais, ...taxasSalvas });
  }, [taxasSalvas]);
  useEffect(() => {
    const abrirConfiguracao = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setConfigAberta(true);
      }
    };
    window.addEventListener("keydown", abrirConfiguracao);
    return () => window.removeEventListener("keydown", abrirConfiguracao);
  }, []);

  const taxa = useMemo(() => {
    if (forma === "PIX") return Number(taxas.pix_percentual || 0);
    if (forma === "Dinheiro") return Number(taxas.dinheiro_percentual || 0);
    if (forma === "Débito") return Number(taxas.debito_percentual || 0);
    return Number(taxas[`credito_${parcelas}x_percentual`] || 0);
  }, [forma, parcelas, taxas]);
  const valorOriginal = centavos(valorUnitario * quantidade);
  const descontoAplicado = centavos(Math.min(Math.max(desconto, 0), valorOriginal));
  const baseAposDesconto = centavos(Math.max(valorOriginal - descontoAplicado, 0));
  const totalCobrado = centavos(taxa >= 100 ? 0 : baseAposDesconto / (1 - taxa / 100));
  const acrescimo = centavos(totalCobrado - baseAposDesconto);
  const valorParcela = centavos(totalCobrado / parcelas);
  const taxaReais = acrescimo;
  const recebidoReal = centavos(totalCobrado - taxaReais);
  const lucroReal = centavos(recebidoReal - Math.max(cmv, 0));

  const salvarTaxas = useMutation({
    mutationFn: async () => {
      const valores = Object.fromEntries(
        Object.entries(taxas).map(([campo, valor]) => [campo, centavos(Number(valor))]),
      ) as Taxas;
      const { error } = await supabase.rpc("salvar_taxas_repasse", { _taxas: valores });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Taxas salvas para as próximas vendas.");
      setConfigAberta(false);
      void qc.invalidateQueries({ queryKey: ["financeiro-taxas-repasse"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const registrarVenda = useMutation({
    mutationFn: async () => {
      if (valorOriginal <= 0 || quantidade <= 0)
        throw new Error("Informe valor e quantidade válidos.");
      const { data, error } = await supabase.rpc("registrar_venda_repasse", {
        _venda: {
          valor_unitario: centavos(valorUnitario),
          quantidade: centavos(quantidade),
          valor_original: valorOriginal,
          desconto_concedido: descontoAplicado,
          forma_pagamento: forma,
          parcelas,
          taxa_percentual: taxa,
          cmv: centavos(cmv),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Venda registrada no Financeiro e no Caixa.");
      void qc.invalidateQueries({ queryKey: ["financeiro-vendas-repasse"] });
      void qc.invalidateQueries({ queryKey: ["financeiro-caixa"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!gerente) {
    return (
      <AppShell>
        <PageHeader title="Repasse de taxas" subtitle="Acesso exclusivo para o gerente" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Calculadora de Repasse de Taxas"
        subtitle="Calcule o valor por fora para receber o valor líquido desejado."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display uppercase">Dados da venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor unitário (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="num"
                  value={valorUnitario}
                  onChange={(e) => setValorUnitario(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="num"
                  value={quantidade}
                  onChange={(e) => setQuantidade(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Desconto concedido (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="num"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo do produto / CMV (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="num"
                value={cmv}
                onChange={(e) => setCmv(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Usado para calcular o lucro real da venda.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select
                value={forma}
                onValueChange={(value) => {
                  setForma(value as FormaPagamento);
                  if (value !== "Crédito") setParcelas(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["PIX", "Dinheiro", "Débito", "Crédito"] as FormaPagamento[]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {forma === "Crédito" && (
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Select
                  value={String(parcelas)}
                  onValueChange={(value) => setParcelas(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {item}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => registrarVenda.mutate()}
              disabled={registrarVenda.isPending || valorOriginal <= 0}
            >
              {registrarVenda.isPending
                ? "Registrando..."
                : "Confirmar venda e registrar no Financeiro"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display uppercase">Resultado para o cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Valor original" value={brl(valorOriginal)} />
                <Metric label="Taxa aplicada" value={`${taxa.toFixed(3)}%`} />
                <Metric label="Acréscimo" value={`+ ${brl(acrescimo)}`} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border-2 border-primary bg-primary/10 p-5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Total a cobrar do cliente
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-primary">
                    {brl(totalCobrado)}
                  </p>
                </div>
                <div className="rounded-lg border-2 border-secondary bg-secondary/10 p-5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Valor de cada parcela
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold">{brl(valorParcela)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {parcelas}x de {brl(valorParcela)} (total {brl(totalCobrado)})
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Taxa da maquininha" value={brl(taxaReais)} />
                <Metric label="Valor real recebido" value={brl(recebidoReal)} tone="text-success" />
                <Metric
                  label="Lucro real"
                  value={brl(lucroReal)}
                  tone={lucroReal >= 0 ? "text-success" : "text-destructive"}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display uppercase">Histórico recente</CardTitle>
            </CardHeader>
            <CardContent>
              {vendas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma venda registrada pela calculadora.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Data</th>
                        <th className="p-2">Forma</th>
                        <th className="p-2">Cobrado</th>
                        <th className="p-2">Taxa</th>
                        <th className="p-2">Recebido</th>
                        <th className="p-2">Lucro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendas.map((venda) => (
                        <tr key={venda.id} className="border-b">
                          <td className="p-2">
                            {new Date(venda.criado_em).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-2">
                            {venda.forma_pagamento}
                            {venda.parcelas > 1 ? ` (${venda.parcelas}x)` : ""}
                          </td>
                          <td className="num p-2">{brl(venda.total_cobrado)}</td>
                          <td className="num p-2">{brl(venda.taxa_maquininha)}</td>
                          <td className="num p-2">{brl(venda.valor_real_recebido)}</td>
                          <td
                            className={`num p-2 ${Number(venda.lucro_real) >= 0 ? "text-success" : "text-destructive"}`}
                          >
                            {brl(venda.lucro_real)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={configAberta} onOpenChange={setConfigAberta}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase">Configurar taxas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Atalho ativo: Alt + Shift + T. Cadastre a taxa efetiva da operadora; o sistema calcula o
            repasse por fora para preservar o valor líquido desejado.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              ["pix_percentual", "dinheiro_percentual", "debito_percentual"] as Array<keyof Taxas>
            ).map((campo) => (
              <TaxaInput
                key={campo}
                label={
                  campo === "pix_percentual"
                    ? "PIX (%)"
                    : campo === "dinheiro_percentual"
                      ? "Espécie / dinheiro (%)"
                      : "Débito (%)"
                }
                value={taxas[campo]}
                onChange={(value) => setTaxas((atual) => ({ ...atual, [campo]: value }))}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {camposCredito.map((campo, index) => (
              <TaxaInput
                key={campo}
                label={`${index + 1}X`}
                value={taxas[campo]}
                onChange={(value) => setTaxas((atual) => ({ ...atual, [campo]: value }))}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigAberta(false)}>
              Cancelar
            </Button>
            <Button onClick={() => salvarTaxas.mutate()} disabled={salvarTaxas.isPending}>
              {salvarTaxas.isPending ? "Salvando..." : "Salvar taxas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
function TaxaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        max="99.999"
        step="0.001"
        className="num"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}
