import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAlertas } from "@/hooks/useAlertas";
import { Button } from "@/components/ui/button";
import { isRouteAllowed, navFor, homeRouteFor, type NavKey } from "@/lib/permissions";

const NAV_ITEMS: Record<NavKey, { to: string; icon: string; label: string }> = {
  dashboard: { to: "/", icon: "fa-gauge-high", label: "Dashboard" },
  patio: { to: "/patio", icon: "fa-warehouse", label: "Carros no pátio" },
  historico: { to: "/historico", icon: "fa-clock-rotate-left", label: "Histórico" },
  caixa: { to: "/caixa", icon: "fa-cash-register", label: "Caixa" },
  pecas: { to: "/pecas", icon: "fa-boxes-stacked", label: "Peças e pneus" },
  mecanicos: { to: "/mecanicos", icon: "fa-screwdriver-wrench", label: "Mecânicos" },
  notificacoes: { to: "/notificacoes", icon: "fa-bell", label: "Retornos" },
  avisos: { to: "/avisos", icon: "fa-comment-dots", label: "Avisos" },
  configuracoes: { to: "/configuracoes", icon: "fa-gear", label: "Configurações" },
  relatorios: { to: "/relatorios", icon: "fa-chart-line", label: "Relatórios" },
  "notificacoes-internas": { to: "/notificacoes-internas", icon: "fa-bell", label: "Notificações" },
  backup: { to: "/backup", icon: "fa-database", label: "Backup" },
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, nome, role, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s: { location: { pathname: string } }) => s.location.pathname });
  useAlertas();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Mecânico só pode abrir Pátio, Histórico e a tela de atendimento em si.
  // Qualquer outra rota (Caixa, Mecânicos, Configurações, etc.) é bloqueada aqui.
  useEffect(() => {
    if (!loading && user && role && !isRouteAllowed(role, pathname)) {
      void navigate({ to: homeRouteFor(role) });
    }
  }, [loading, user, role, pathname, navigate]);

  if (loading || !user || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
      </div>
    );
  }

  if (!isRouteAllowed(role, pathname)) {
    // Evita "piscar" a tela restrita enquanto o redirect acima roda.
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
      </div>
    );
  }

  const NAV = navFor(role).map((key) => NAV_ITEMS[key]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-foreground">
            <i className="fa-solid fa-gears" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold tracking-wide uppercase">DK Auto Center</p>
            <p className="text-[11px] text-sidebar-foreground/60">Gestão de oficina</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground/85"
                }`}
              >
                <i className={`fa-solid ${item.icon} w-4 text-center`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-sm">
          <p className="font-medium">{nome}</p>
          <p className="mb-3 text-xs text-sidebar-foreground/60 capitalize">{role}</p>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <i className="fa-solid fa-right-from-bracket" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:hidden">
          <span className="font-display text-lg font-bold uppercase">DK Auto Center</span>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            <i className="fa-solid fa-right-from-bracket" />
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
              activeOptions={{ exact: item.to === "/" }}
            >
              <i className={`fa-solid ${item.icon}`} />
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
