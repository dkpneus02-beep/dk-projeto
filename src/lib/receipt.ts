import { brl, d, dt } from "@/lib/format";

export type ReciboAtendimento = {
  numero: number;
  placa: string;
  modelo: string | null;
  fabricante: string | null;
  km: number | null;
  cliente_nome: string;
  cliente_telefone: string | null;
  desconto: number;
  total: number;
  finalizado_at: string | null;
  garantia_ate: string | null;
};

export type ReciboServico = { nome: string; valor: number };
export type ReciboPagamento = { forma: string; valor: number; parcelas: number };

export type ReciboConfig = {
  nome_oficina: string;
  endereco: string;
  telefone: string;
  cnpj: string;
};

/** Monta o HTML do cupom (80mm) usado tanto para impressão térmica quanto para tela/PDF. */
export function buildReceiptHtml(
  atendimento: ReciboAtendimento,
  servicos: ReciboServico[],
  pagamentos: ReciboPagamento[],
  config: ReciboConfig,
): string {
  const bruto = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const linhasServicos = servicos
    .map(
      (s) => `<tr><td>${escapeHtml(s.nome)}</td><td class="num">${brl(s.valor)}</td></tr>`,
    )
    .join("");
  const linhasPagamentos = pagamentos
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.forma)}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ""}</td><td class="num">${brl(p.valor)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo OS #${atendimento.numero}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0 auto;
    padding: 6mm 4mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
  }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; text-transform: uppercase; }
  .center { text-align: center; }
  .muted { color: #444; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  .total { font-size: 14px; font-weight: bold; }
  .foot { margin-top: 8px; text-align: center; font-size: 11px; }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(config.nome_oficina || "DK Auto Center")}</h1>
  <p class="center muted">
    ${config.endereco ? escapeHtml(config.endereco) + "<br/>" : ""}
    ${config.telefone ? "Tel: " + escapeHtml(config.telefone) + " " : ""}
    ${config.cnpj ? "CNPJ: " + escapeHtml(config.cnpj) : ""}
  </p>
  <hr />
  <p class="center">COMPROVANTE DE SERVIÇO — OS #${atendimento.numero}</p>
  <hr />
  <table>
    <tr><td>Cliente</td><td class="num">${escapeHtml(atendimento.cliente_nome)}</td></tr>
    ${atendimento.cliente_telefone ? `<tr><td>Telefone</td><td class="num">${escapeHtml(atendimento.cliente_telefone)}</td></tr>` : ""}
    <tr><td>Veículo</td><td class="num">${escapeHtml([atendimento.fabricante, atendimento.modelo].filter(Boolean).join(" "))}</td></tr>
    <tr><td>Placa</td><td class="num">${escapeHtml(atendimento.placa)}</td></tr>
    ${atendimento.km ? `<tr><td>KM</td><td class="num">${atendimento.km.toLocaleString("pt-BR")}</td></tr>` : ""}
  </table>
  <hr />
  <p class="muted">SERVIÇOS / PEÇAS</p>
  <table>${linhasServicos}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="num">${brl(bruto)}</td></tr>
    <tr><td>Desconto</td><td class="num">- ${brl(atendimento.desconto)}</td></tr>
    <tr class="total"><td>TOTAL</td><td class="num">${brl(atendimento.total)}</td></tr>
  </table>
  <hr />
  <p class="muted">FORMA DE PAGAMENTO</p>
  <table>${linhasPagamentos}</table>
  <hr />
  ${atendimento.garantia_ate ? `<p class="center">Garantia válida até ${d(atendimento.garantia_ate)}</p><hr />` : ""}
  <p class="foot">
    Encerrado em ${dt(atendimento.finalizado_at)}<br/>
    Obrigado pela preferência!
  </p>
  <p class="center no-print" style="margin-top:12px;">
    <button onclick="window.print()" style="font-family:inherit;padding:6px 12px;">Imprimir</button>
  </p>
</body>
</html>`;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Abre o cupom em uma nova aba pronto para impressão térmica (80mm) ou salvar como PDF. */
export function printReceipt(
  atendimento: ReciboAtendimento,
  servicos: ReciboServico[],
  pagamentos: ReciboPagamento[],
  config: ReciboConfig,
) {
  const html = buildReceiptHtml(atendimento, servicos, pagamentos, config);
  const win = window.open("", "_blank", "width=420,height=680");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
