import { useEffect, useRef } from "react";

/**
 * Leitores de código de barras USB/Bluetooth funcionam como teclado:
 * disparam os dígitos muito rápido (poucos ms entre teclas) e finalizam
 * com Enter. Este hook escuta o teclado global, acumula os caracteres
 * enquanto o ritmo for "rápido demais para ser digitação humana" e
 * chama onScan quando detecta o Enter final.
 *
 * Não interfere com digitação normal em inputs (ritmo humano é mais lento
 * que o limiar configurado), então pode ficar sempre ativo na tela.
 */
export function useBarcodeScanner(onScan: (codigo: string) => void, enabled = true) {
  const buffer = useRef("");
  const lastTime = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const LIMIAR_MS = 40; // intervalo típico entre teclas de um leitor físico
    const MIN_LEN = 4;

    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastTime.current;
      lastTime.current = now;

      if (e.key === "Enter") {
        const codigo = buffer.current.trim();
        buffer.current = "";
        if (codigo.length >= MIN_LEN) onScanRef.current(codigo);
        return;
      }

      if (e.key.length === 1) {
        // Se o intervalo entre teclas foi longo, é digitação humana: reinicia o buffer.
        if (gap > LIMIAR_MS && buffer.current) buffer.current = "";
        buffer.current += e.key;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
