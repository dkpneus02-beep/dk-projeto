import QRCode from "qrcode";
import { brl, d, dt, whatsappLink } from "@/lib/format";
import { buildPixPayload } from "@/lib/pix";

export type ReciboAtendimento = {
  numero: number;
  placa: string;
  modelo: string | null;
  fabricante: string | null;
  km: number | null;
  cliente_nome: string;
  cliente_telefone: string | null;
  desconto: number;
  desconto_pecas?: number | null;
  desconto_balcao?: number | null;
  total: number;
  finalizado_at: string | null;
  garantia_ate: string | null;
};

export type ReciboServico = { nome: string; valor: number; quantidade?: number };
export type ReciboPagamento = { forma: string; valor: number; parcelas: number; pago?: boolean };
export type ReciboConfig = {
  nome_oficina: string;
  endereco: string;
  telefone: string;
  cnpj: string;
  pix_chave?: string;
  pix_nome_recebedor?: string;
  pix_cidade?: string;
};

/** Monta o HTML do cupom em largura térmica de 80mm. */
export function buildReceiptHtml(
  atendimento: ReciboAtendimento,
  servicos: ReciboServico[],
  pagamentos: ReciboPagamento[],
  config: ReciboConfig,
  pix?: { payload: string; valor: number; chave: string; whatsappUrl: string; qrDataUrl: string },
): string {
  const bruto = servicos.reduce((s, x) => s + Number(x.valor), 0);
  const descontoTotal = Number(atendimento.desconto || 0);
  const linhasDescontos =
    atendimento.desconto_balcao == null
      ? `<tr><td>Desconto</td><td class="num">- ${brl(descontoTotal)}</td></tr>`
      : `<tr><td>Desconto nas peças</td><td class="num">- ${brl(atendimento.desconto_pecas ?? Math.max(descontoTotal - atendimento.desconto_balcao, 0))}</td></tr><tr><td>Desconto do balcão</td><td class="num">- ${brl(atendimento.desconto_balcao)}</td></tr>`;
  const linhasServicos = servicos
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.nome)}${s.quantidade && s.quantidade !== 1 ? ` x${s.quantidade}` : ""}</td><td class="num">${brl(s.valor)}</td></tr>`,
    )
    .join("");
  const linhasPagamentos = pagamentos
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.forma)}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ""}${p.pago === false ? " · pendente" : ""}</td><td class="num">${brl(p.valor)}</td></tr>`,
    )
    .join("");
  const pixSection = pix
    ? `<hr /><div class="pix center"><strong>PIX PENDENTE: ${brl(pix.valor)}</strong><br/><img class="qr" src="${pix.qrDataUrl}" alt="QR Code Pix no valor de ${brl(pix.valor)}"/><p>Abra o app do banco e escaneie o QR Code.</p><p>Chave Pix: ${escapeHtml(pix.chave)}</p><p class="no-print">Atalho Alt+P: copiar a chave Pix e abrir o WhatsApp.</p></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Recibo OS #${atendimento.numero}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 80mm; margin: 0 auto; padding: 5mm 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 600; line-height: 1.4; color: #000; }
  h1 { font-size: 16px; font-weight: 800; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  .center { text-align: center; }
  .muted { color: #000; font-weight: 700; letter-spacing: .15px; }
  hr { border: none; border-top: 1px solid #000; margin: 7px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  td.label { width: 28%; padding-right: 2mm; font-weight: 700; }
  td.value { text-align: left; overflow-wrap: anywhere; word-break: normal; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .items td:first-child { width: 68%; padding-right: 2mm; overflow-wrap: anywhere; word-break: break-word; }
  .items td.num { width: 32%; }
  .total { font-size: 15px; font-weight: 800; }
  .foot { margin-top: 9px; text-align: center; font-size: 11px; font-weight: 600; }
  .pix { padding: 3mm 0; font-size: 12px; }
  .qr { display: block; width: 42mm; height: 42mm; margin: 3mm auto; image-rendering: pixelated; }
  .no-print button { margin: 3px; padding: 7px 10px; font: inherit; }
  @media print { .no-print { display: none !important; } body { width: 80mm; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <h1>${escapeHtml(config.nome_oficina || "DK Auto Center")}</h1>
  <p class="center muted">
    ${config.endereco ? escapeHtml(config.endereco) + "<br/>" : ""}
    ${config.telefone ? "Tel: " + escapeHtml(config.telefone) + "<br/>" : ""}
    ${config.cnpj ? "CNPJ: " + escapeHtml(config.cnpj) : ""}
  </p>
  <hr />
  <p class="center">COMPROVANTE DE SERVIÇO — OS #${atendimento.numero}</p>
  <hr />
  <table>
    <tr><td class="label">Cliente</td><td class="value">${escapeHtml(atendimento.cliente_nome)}</td></tr>
    ${atendimento.cliente_telefone ? `<tr><td class="label">Telefone</td><td class="value">${escapeHtml(atendimento.cliente_telefone)}</td></tr>` : ""}
    <tr><td class="label">Veículo</td><td class="value">${escapeHtml([atendimento.fabricante, atendimento.modelo].filter(Boolean).join(" "))}</td></tr>
    <tr><td class="label">Placa</td><td class="value">${escapeHtml(atendimento.placa)}</td></tr>
    ${atendimento.km ? `<tr><td class="label">KM</td><td class="value">${atendimento.km.toLocaleString("pt-BR")}</td></tr>` : ""}
  </table>
  <hr />
  <p class="muted">SERVIÇOS / PEÇAS</p>
  <table class="items">${linhasServicos}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="num">${brl(bruto)}</td></tr>
    ${linhasDescontos}
    <tr class="total"><td>TOTAL</td><td class="num">${brl(atendimento.total)}</td></tr>
  </table>
  <hr />
  <p class="muted">FORMA DE PAGAMENTO</p>
  <table class="items">${linhasPagamentos}</table>
  ${pixSection}
  <hr />
  ${atendimento.garantia_ate ? `<p class="center">Garantia válida até ${d(atendimento.garantia_ate)}</p><hr />` : ""}
  <p class="foot">Encerrado em ${dt(atendimento.finalizado_at)}<br/>Obrigado pela preferência!</p>
  <p class="center no-print" style="margin-top:12px;">
    <button onclick="window.print()">Imprimir</button>
    ${pix ? `<button id="pix-whatsapp" type="button">Copiar Pix e abrir WhatsApp (Alt+P)</button>` : ""}
  </p>
  ${
    pix
      ? `<script>
    const pixKey = ${safeScriptString(pix.chave)};
    const whatsappUrl = ${safeScriptString(pix.whatsappUrl)};
    async function copyPixAndOpenWhatsApp() {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      try {
        await navigator.clipboard.writeText(pixKey);
        const button = document.getElementById("pix-whatsapp");
        if (button) button.textContent = "Chave Pix copiada — cole no WhatsApp";
      } catch {
        window.prompt("Copie a chave Pix:", pixKey);
      }
    }
    document.getElementById("pix-whatsapp")?.addEventListener("click", copyPixAndOpenWhatsApp);
    window.addEventListener("keydown", (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyP") {
        event.preventDefault();
        void copyPixAndOpenWhatsApp();
      }
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

function safeScriptString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Abre o recibo; usa apenas um QR offline da parcela Pix ainda não paga. */
export async function printReceipt(
  atendimento: ReciboAtendimento,
  servicos: ReciboServico[],
  pagamentos: ReciboPagamento[],
  config: ReciboConfig,
  targetWindow?: Window | null,
): Promise<boolean> {
  const win =
    targetWindow === undefined ? window.open("", "_blank", "width=420,height=760") : targetWindow;
  if (!win) return false;
  const pixPendente = pagamentos
    .filter(
      (pagamento) =>
        pagamento.forma.toLocaleLowerCase("pt-BR") === "pix" && pagamento.pago === false,
    )
    .reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);

  try {
    let pixData:
      | { payload: string; valor: number; chave: string; whatsappUrl: string; qrDataUrl: string }
      | undefined;
    if (pixPendente > 0 && config.pix_chave?.trim()) {
      const pix = {
        chave: config.pix_chave,
        valor: Math.round(pixPendente * 100) / 100,
        nomeRecebedor: config.pix_nome_recebedor || config.nome_oficina || "DK AUTO CENTER",
        cidade: config.pix_cidade || "SALGUEIRO",
        txid: `OS${atendimento.numero}`,
      };
      const payload = buildPixPayload(pix);
      const qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 512,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      const mensagem = `Olá ${atendimento.cliente_nome}, segue a cobrança Pix de ${brl(pixPendente)} referente à OS #${atendimento.numero} da DK Auto Center. A chave Pix está copiada.`;
      pixData = {
        payload,
        valor: pixPendente,
        chave: pix.chave,
        qrDataUrl,
        whatsappUrl: atendimento.cliente_telefone
          ? whatsappLink(atendimento.cliente_telefone, mensagem)
          : `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
      };
    }
    const html = buildReceiptHtml(atendimento, servicos, pagamentos, config, pixData);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return true;
  } catch (error) {
    win.document.body.textContent =
      error instanceof Error ? error.message : "Não foi possível gerar o recibo Pix.";
    win.focus();
    return false;
  }
}
