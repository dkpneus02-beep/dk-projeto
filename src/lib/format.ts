export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dt = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const d = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

/** Remove pontuação/acentos para busca inteligente. */
export const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

export const matches = (query: string, fields: unknown[]) => {
  const q = norm(query);
  if (!q) return true;
  return fields.some((f) => norm(f).includes(q));
};

export const diasEntre = (a: string | Date, b: string | Date = new Date()) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

export const whatsappLink = (telefone: string | null | undefined, msg: string) => {
  const num = String(telefone ?? "").replace(/\D/g, "");
  const full = num.length <= 11 ? `55${num}` : num;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
};

export const FORMAS_PAGAMENTO = [
  "Dinheiro",
  "PIX",
  "Cartão de débito",
  "Cartão de crédito",
  "Outros",
] as const;

export const STATUS_SERVICO = ["aguardando", "em_execucao", "concluido"] as const;

export const statusLabel: Record<string, string> = {
  aguardando: "Aguardando",
  em_execucao: "Em execução",
  concluido: "Concluído",
  aberto: "Aberto",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};
