/**
 * Estrutura centralizada de permissões baseada na role do usuário
 * (public.user_roles / has_role no banco, refletida em useAuth()).
 *
 * Apenas duas roles existem: 'gerente' (acesso total) e 'mecanico'
 * (acesso restrito à execução de serviço: Pátio e Histórico).
 */
export type Role = "gerente" | "mecanico";

export type NavKey =
  | "dashboard"
  | "patio"
  | "historico"
  | "caixa"
  | "pecas"
  | "mecanicos"
  | "notificacoes"
  | "avisos"
  | "configuracoes";

/** Rotas que o mecânico pode abrir diretamente. */
const MECANICO_PREFIXES = ["/patio", "/historico", "/atendimento"];

export function isRouteAllowed(role: Role | null, pathname: string): boolean {
  if (role !== "mecanico") return true; // gerente: acesso total
  return MECANICO_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Rota padrão para onde cada role deve ser levado após o login. */
export function homeRouteFor(role: Role | null): string {
  return role === "mecanico" ? "/patio" : "/";
}

const NAV_GERENTE: NavKey[] = [
  "dashboard",
  "patio",
  "historico",
  "caixa",
  "pecas",
  "mecanicos",
  "notificacoes",
  "avisos",
  "configuracoes",
];

const NAV_MECANICO: NavKey[] = ["patio", "historico"];

export function navFor(role: Role | null): NavKey[] {
  return role === "mecanico" ? NAV_MECANICO : NAV_GERENTE;
}

export function isGerente(role: Role | null): boolean {
  return role === "gerente";
}
