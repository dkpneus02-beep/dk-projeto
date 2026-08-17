import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { homeRouteFor } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | DK Auto Center" },
      { name: "description", content: "Acesso ao sistema de gestão da oficina DK Auto Center." },
      { property: "og:title", content: "Entrar | DK Auto Center" },
      { property: "og:description", content: "Acesso da equipe ao sistema da DK Auto Center." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [modo, setModo] = useState<"login" | "recuperar">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  useEffect(() => {
    if (!loading && user) void navigate({ to: homeRouteFor(role) });
  }, [user, role, loading, navigate]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) toast.error("E-mail ou senha inválidos.");
    // Sucesso: o useEffect acima cuida do redirecionamento assim que a role carregar.
  };

  const enviarRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setCarregando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinkEnviado(true);
    toast.success("Se o e-mail existir, enviamos um link de recuperação.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground">
            <i className="fa-solid fa-gears" />
          </span>
          <span className="font-display text-2xl font-bold uppercase">DK Auto Center</span>
        </div>
        <div>
          <h1 className="font-display text-5xl leading-none font-bold uppercase">
            Pátio, serviços e caixa
            <br />
            em um só lugar
          </h1>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/70">
            Controle dos carros no pátio, ordens de serviço com mecânico responsável, garantia de 90
            dias, estoque de peças e pneus, caixa diário e retorno de clientes.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Uso interno da equipe</p>
      </div>

      <div className="flex items-center justify-center p-6">
        {modo === "login" ? (
          <form onSubmit={entrar} className="card-surface w-full max-w-sm space-y-4 p-8">
            <div>
              <h2 className="font-display text-2xl font-bold uppercase">Entrar</h2>
              <p className="text-sm text-muted-foreground">
                Acesso restrito à equipe da oficina. Novos acessos são criados pelo gerente.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={6}
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando ? (
                <i className="fa-solid fa-circle-notch fa-spin" />
              ) : (
                <i className="fa-solid fa-right-to-bracket" />
              )}
              Entrar
            </Button>

            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setModo("recuperar");
                setLinkEnviado(false);
              }}
            >
              Esqueceu sua senha?
            </button>
          </form>
        ) : (
          <form onSubmit={enviarRecuperacao} className="card-surface w-full max-w-sm space-y-4 p-8">
            <div>
              <h2 className="font-display text-2xl font-bold uppercase">Recuperar senha</h2>
              <p className="text-sm text-muted-foreground">
                Informe o e-mail cadastrado. Enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-recuperar">E-mail cadastrado</Label>
              <Input
                id="email-recuperar"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            {linkEnviado ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <i className="fa-solid fa-envelope-circle-check mr-2 text-success" />
                Verifique sua caixa de entrada (e o spam) para o link de recuperação.
              </p>
            ) : (
              <Button type="submit" className="w-full" disabled={carregando}>
                {carregando && <i className="fa-solid fa-circle-notch fa-spin" />}
                Enviar link de recuperação
              </Button>
            )}

            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setModo("login")}
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
