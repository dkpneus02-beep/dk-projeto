import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/permissions";

type AuthState = {
  user: User | null;
  session: Session | null;
  nome: string;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  nome: "",
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) {
      setNome("");
      setRole(null);
      return;
    }
    let active = true;
    void (async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("nome").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!active) return;
      setNome(profile?.nome ?? session?.user.email?.split("@")[0] ?? "");
      const list = (roles ?? []).map((r) => r.role as Role);
      setRole(list.includes("gerente") ? "gerente" : (list[0] ?? "mecanico"));
    })();
    return () => {
      active = false;
    };
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        nome,
        role,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
