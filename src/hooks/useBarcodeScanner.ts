import { useEffect, useRef } from "react";

/**
 * Leitores USB/Bluetooth digitam o código rapidamente e normalmente encerram
 * a leitura com Enter. O hook ignora digitação humana lenta e limpa buffers
 * incompletos para não transformar texto antigo em uma leitura posterior.
 */
export function useBarcodeScanner(onScan: (codigo: string) => void, enabled = true) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const LIMIAR_MS = 40;
    const MIN_LEN = 4;
    const MAX_LEN = 128;
    let buffer = "";
    let lastTime = 0;

    const limpar = () => {
      buffer = "";
      lastTime = 0;
    };

    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        limpar();
        return;
      }

      // O Shift pode anteceder letras maiúsculas enviadas por alguns leitores.
      if (event.key === "Shift" || event.key === "CapsLock") return;

      const agora = performance.now();
      if (event.key === "Enter") {
        const codigo = agora - lastTime <= LIMIAR_MS ? buffer.trim() : "";
        limpar();
        if (codigo.length >= MIN_LEN) onScanRef.current(codigo);
        return;
      }

      if (event.key.length !== 1) {
        limpar();
        return;
      }

      if (lastTime && agora - lastTime > LIMIAR_MS) buffer = "";
      buffer += event.key;
      lastTime = agora;

      if (buffer.length > MAX_LEN) limpar();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
