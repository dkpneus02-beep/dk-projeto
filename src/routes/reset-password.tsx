import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Redefinir senha | DK Auto Center" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // O link de recuperação do Supabase abre uma sessão temporária e dispara
    // o evento PASSWORD_RECOVERY; só então liberamos o formulário de nova senha.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirmar) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (senha.length < 6) {
      toast.error("A senha precisa ter ao menos 6 caracteres");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha alterada! Faça login novamente.");
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-8">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase">Redefinir senha</h2>
          <p className="text-sm text-muted-foreground">
            {pronto
              ? "Escolha uma nova senha de acesso."
              : "Abra este formulário a partir do link enviado por e-mail."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="senha">Nova senha</Label>
          <Input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={6}
            disabled={!pronto}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmar">Confirmar nova senha</Label>
          <Input
            id="confirmar"
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            minLength={6}
            disabled={!pronto}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={!pronto || carregando}>
          {carregando && <i className="fa-solid fa-circle-notch fa-spin" />}
          Salvar nova senha
        </Button>
      </form>
    </div>
  );
}
