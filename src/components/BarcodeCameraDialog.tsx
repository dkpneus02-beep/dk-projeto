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
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined" || !videoRef.current) return;

    let cancelado = false;
    const reader = new BrowserMultiFormatReader();
    const parar = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };

    setErro(null);
    void reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (cancelado || !result) return;
          const codigo = result.getText().trim();
          if (!codigo) return;
          parar();
          onDetected(codigo);
          onOpenChange(false);
        },
      )
      .then((controls) => {
        if (cancelado) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setErro(
            e instanceof Error
              ? e.message
              : "Não foi possível abrir a câmera. Confira a permissão do navegador.",
          );
        }
      });

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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
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
