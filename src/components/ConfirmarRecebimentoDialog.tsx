import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, FORMAS_PAGAMENTO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FormaPagamentoConfirmada = { id: string; forma: string };

type PagamentoPendente = {
  id: string;
  forma: string;
  valor: number;
  parcelas: number;
};

export function ConfirmarRecebimentoDialog({
  atendimentoId,
  total,
  trigger,
  disabled = false,
  onConfirm,
}: {
  atendimentoId: string;
  total: number;
  trigger: ReactNode;
  disabled?: boolean;
  onConfirm: (pagamentos: FormaPagamentoConfirmada[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pagamentos, setPagamentos] = useState<PagamentoPendente[]>([]);
  const [formas, setFormas] = useState<Record<string, string>>({});

  const carregarPagamentos = async () => {
    setCarregando(true);
    setPagamentos([]);
    setFormas({});
    try {
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, forma, valor, parcelas")
        .eq("atendimento_id", atendimentoId)
        .eq("pago", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const pendentes = (data ?? []).map((pagamento) => ({
        id: pagamento.id,
        forma: pagamento.forma,
        valor: Number(pagamento.valor),
        parcelas: pagamento.parcelas,
      }));
      setPagamentos(pendentes);
      setFormas(
        Object.fromEntries(
          pendentes.map((pagamento) => [
            pagamento.id,
            (FORMAS_PAGAMENTO as readonly string[]).includes(pagamento.forma)
              ? pagamento.forma
              : "",
          ]),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os pagamentos pendentes.",
      );
    } finally {
      setCarregando(false);
    }
  };

  const confirmar = async () => {
    if (!pagamentos.length) return;
    const formasSelecionadas = pagamentos.map((pagamento) => ({
      id: pagamento.id,
      forma: formas[pagamento.id] ?? "",
    }));
    if (
      formasSelecionadas.some(
        (pagamento) => !(FORMAS_PAGAMENTO as readonly string[]).includes(pagamento.forma),
      )
    ) {
      toast.error("Selecione uma forma válida para cada pagamento pendente.");
      return;
    }

    setConfirmando(true);
    try {
      await onConfirm(formasSelecionadas);
      setOpen(false);
    } catch {
      // A mutation de origem mostra o erro; mantendo o diálogo aberto, a pessoa pode corrigir ou cancelar.
    } finally {
      setConfirmando(false);
    }
  };

  const podeConfirmar =
    !disabled &&
    !carregando &&
    !confirmando &&
    pagamentos.length > 0 &&
    pagamentos.every((pagamento) =>
      (FORMAS_PAGAMENTO as readonly string[]).includes(formas[pagamento.id] ?? ""),
    );
  const somaPendente = pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(proximo) => {
        if (confirmando || disabled) return;
        setOpen(proximo);
        if (proximo) void carregarPagamentos();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Revisar pagamento recebido</DialogTitle>
          <DialogDescription>
            Confira a forma de cada pagamento. Os valores e as parcelas não mudam nesta etapa; só
            serão lançados no caixa quando você confirmar que recebeu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-between gap-3 rounded-md bg-muted/60 p-3 text-sm">
            <span>Total da OS</span>
            <strong className="num">{brl(total)}</strong>
          </div>
          {carregando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Carregando pagamentos pendentes…
            </p>
          ) : pagamentos.length === 0 ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Não há pagamentos pendentes nesta OS. Atualize a tela antes de tentar novamente.
            </p>
          ) : (
            <>
              {pagamentos.map((pagamento, index) => {
                const selectId = `forma-pendente-${atendimentoId}-${pagamento.id}`;
                return (
                  <div key={pagamento.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">Pagamento {index + 1}</p>
                      <p className="num font-semibold">
                        {brl(pagamento.valor)}
                        {pagamento.parcelas > 1 ? ` · ${pagamento.parcelas}x` : ""}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={selectId}>Forma de pagamento</Label>
                      <Select
                        value={formas[pagamento.id] ?? ""}
                        onValueChange={(forma) =>
                          setFormas((atuais) => ({ ...atuais, [pagamento.id]: forma }))
                        }
                        disabled={confirmando || disabled}
                      >
                        <SelectTrigger id={selectId}>
                          <SelectValue placeholder="Selecione a forma" />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAS_PAGAMENTO.map((forma) => (
                            <SelectItem key={forma} value={forma}>
                              {forma}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!(FORMAS_PAGAMENTO as readonly string[]).includes(pagamento.forma) && (
                        <p className="text-xs text-muted-foreground">
                          Forma atual: {pagamento.forma || "não informada"}. Selecione uma forma
                          válida.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between gap-3 border-t pt-3 text-sm">
                <span>Total a confirmar</span>
                <strong className="num">{brl(somaPendente)}</strong>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={confirmando}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!podeConfirmar} onClick={() => void confirmar()}>
            {confirmando && <i className="fa-solid fa-circle-notch fa-spin" />}
            Confirmar recebimento e lançar no caixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
