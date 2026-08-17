import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Trava de confirmação para ações sensíveis (abrir/fechar caixa, excluir,
 * desfinalizar). Evita que um clique acidental execute o comando: o usuário
 * precisa ler o resumo e confirmar explicitamente.
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive,
  onConfirm,
  disabled,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(false);

  return (
    <AlertDialog open={open && !disabled} onOpenChange={(v) => !disabled && setOpen(v)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display uppercase">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={carregando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={carregando}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={async (e) => {
              e.preventDefault();
              setCarregando(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setCarregando(false);
              }
            }}
          >
            {carregando && <i className="fa-solid fa-circle-notch fa-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type { ButtonProps };
export { Button };
