export type PixBrCodeInput = {
  chave: string;
  valor: number | null;
  nomeRecebedor: string;
  cidade: string;
  txid: string;
};

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

function tlv(id: string, value: string): string {
  const length = utf8Length(value);
  if (length > 99) throw new Error(`Campo Pix ${id} excede o limite do BR Code.`);
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

function cleanEmvText(value: string, maxLength: number, label: string): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,'\-/():+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  if (!cleaned) throw new Error(`Configure ${label} para gerar o QR Pix.`);
  return cleaned;
}

function crc16Ccitt(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Monta Pix BR Code estático no aparelho; não envia chave nem valor a serviço externo. */
export function buildPixPayload({
  chave,
  valor,
  nomeRecebedor,
  cidade,
  txid,
}: PixBrCodeInput): string {
  const pixKey = chave.trim();
  // eslint-disable-next-line no-control-regex -- caracteres de controle não podem entrar no BR Code.
  if (!pixKey || utf8Length(pixKey) > 77 || /[\u0000-\u001f\u007f]/.test(pixKey)) {
    throw new Error("A chave Pix está vazia ou fora do limite permitido.");
  }

  const name = cleanEmvText(nomeRecebedor, 25, "o nome do recebedor");
  const location = cleanEmvText(cidade, 15, "a cidade do recebedor");
  const transactionId = txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", pixKey);
  if (utf8Length(merchantAccount) > 99) {
    throw new Error("A chave Pix excede o espaço disponível no QR Code.");
  }

  let amountField = "";
  if (valor !== null) {
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error("O valor do Pix pendente precisa ser maior que zero.");
    }
    amountField = tlv("54", valor.toFixed(2));
  }

  const payload =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (valor !== null ? amountField : "") +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", location) +
    tlv("62", tlv("05", transactionId)) +
    "6304";

  return payload + crc16Ccitt(payload);
}
