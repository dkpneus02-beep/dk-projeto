import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

type BarcodeWindow = Window & typeof globalThis & {
  BarcodeDetector?: DetectorConstructor;
};

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
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let cancelado = false;
    let timer: number | undefined;
    const parar = () => {
      if (timer) window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const iniciar = async () => {
      try {
        const BarcodeDetector = (window as BarcodeWindow).BarcodeDetector;
        if (!BarcodeDetector) {
          setErro("Seu navegador não oferece leitura de código pela câmera. Use um leitor USB/Bluetooth ou digite o SKU.");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setErro("O navegador não liberou acesso à câmera neste dispositivo.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
        });
        const procurar = async () => {
          if (cancelado || !videoRef.current) return;
          try {
            const encontrados = await detector.detect(videoRef.current);
            const codigo = encontrados[0]?.rawValue?.trim();
            if (codigo) {
              parar();
              onDetected(codigo);
              onOpenChange(false);
              return;
            }
          } catch {
            // O vídeo ainda pode estar sem um frame pronto; tenta novamente.
          }
          timer = window.setTimeout(() => void procurar(), 180);
        };
        void procurar();
      } catch (e) {
        parar();
        setErro(e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
      }
    };

    setErro(null);
    void iniciar();
    return () => {
      cancelado = true;
      parar();
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Ler código pela câmera</DialogTitle>
          <DialogDescription>Aponte a câmera traseira para o código de barras do item.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{erro}</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
