import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function explicarErroCamera(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "A permissão da câmera foi negada. No navegador, toque no cadeado ao lado do endereço, permita a câmera e tente novamente.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "Nenhuma câmera foi encontrada neste dispositivo. Use a opção de foto ou um leitor USB/Bluetooth.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "A câmera está sendo usada por outro aplicativo ou não pôde ser iniciada. Feche outros aplicativos que usam a câmera e tente novamente.";
    }
    if (error.name === "SecurityError") {
      return "O navegador bloqueou a câmera por segurança. Abra o sistema pelo endereço HTTPS e tente novamente.";
    }
    if (error.name === "OverconstrainedError") {
      return "A câmera traseira solicitada não está disponível. Tente novamente ou use a opção de foto.";
    }
  }
  return error instanceof Error && error.message
    ? `Não foi possível abrir a câmera: ${error.message}`
    : "Não foi possível abrir a câmera. Use a opção de foto ou um leitor USB/Bluetooth.";
}

export function BarcodeCameraDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (codigo: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onOpenChangeRef = useRef(onOpenChange);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  onDetectedRef.current = onDetected;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let cancelado = false;
    let frame = 0;
    const reader = new BrowserMultiFormatReader();

    const parar = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const iniciar = () => {
      if (cancelado) return;
      const video = videoRef.current;
      if (!video) {
        setErro("A janela da câmera ainda não terminou de abrir. Toque em tentar novamente.");
        setIniciando(false);
        return;
      }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setErro(
          "A câmera só funciona em uma conexão HTTPS segura. Use a opção de foto enquanto isso.",
        );
        setIniciando(false);
        return;
      }

      setIniciando(true);
      setErro(null);
      void reader
        .decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          video,
          (result) => {
            if (cancelado || !result) return;
            const codigo = result.getText().trim();
            if (!codigo) return;
            parar();
            onDetectedRef.current(codigo);
            onOpenChangeRef.current(false);
          },
        )
        .then((controls) => {
          if (cancelado) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;
          setIniciando(false);
        })
        .catch((error: unknown) => {
          if (!cancelado) {
            setIniciando(false);
            setErro(explicarErroCamera(error));
          }
        });
    };

    // O Dialog usa portal; aguardar um frame garante que o elemento <video>
    // exista antes de pedir a câmera e evita a tela vazia/prateada.
    frame = window.requestAnimationFrame(iniciar);

    return () => {
      cancelado = true;
      window.cancelAnimationFrame(frame);
      parar();
      setIniciando(false);
    };
  }, [open, tentativa]);

  const lerFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setProcessandoFoto(true);
    setErro(null);
    const url = URL.createObjectURL(arquivo);
    try {
      const resultado = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      const codigo = resultado.getText().trim();
      if (!codigo) throw new Error("Nenhum código foi encontrado na imagem.");
      onDetectedRef.current(codigo);
      onOpenChangeRef.current(false);
    } catch {
      setErro(
        "Não foi possível ler o código nessa foto. Tente aproximar, melhorar a iluminação ou usar um leitor USB/Bluetooth.",
      );
    } finally {
      URL.revokeObjectURL(url);
      setProcessandoFoto(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Ler código pela câmera</DialogTitle>
          <DialogDescription>
            Permita a câmera traseira quando o navegador perguntar e aponte para o código de barras
            do item.
          </DialogDescription>
        </DialogHeader>

        {erro && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {erro}
          </div>
        )}

        <div className="overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full object-cover"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={iniciando}
            onClick={() => setTentativa((valor) => valor + 1)}
          >
            <i className="fa-solid fa-rotate-right" />{" "}
            {iniciando ? "Abrindo câmera..." : "Tentar novamente"}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <i className="fa-solid fa-image" />{" "}
            {processandoFoto ? "Lendo foto..." : "Usar foto/galeria"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={processandoFoto}
              onChange={(event) => {
                void lerFoto(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
