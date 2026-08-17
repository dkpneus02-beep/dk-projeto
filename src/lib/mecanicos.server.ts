// Server function (roda no servidor, nunca no bundle do cliente).
// Cria o login (Supabase Auth) de um novo mecânico. Só o gerente pode
// chamar isso — cadastro interno pela aba "Mecânicos", sem tela pública
// de "Criar conta".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const criarMecanicoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  telefone: z.string().trim().min(1, "Informe o telefone"),
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres"),
});

export const criarMecanico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => criarMecanicoSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Server-only imports: seguro aqui dentro do handler, nunca no topo
    // de um arquivo que também é importado por rotas do cliente.
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: souGerente, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gerente",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!souGerente) {
      throw new Error("Apenas o gerente pode cadastrar mecânicos.");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, telefone: data.telefone, role: "mecanico" },
    });
    if (createErr) throw new Error(createErr.message);

    const userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário do mecânico.");

    const { error: mecErr } = await supabaseAdmin.from("mecanicos").insert({
      nome: data.nome,
      telefone: data.telefone,
      email: data.email,
      user_id: userId,
    });
    if (mecErr) {
      // Reverte a criação do login se não conseguirmos criar o registro do mecânico,
      // para não deixar uma conta "órfã" sem vínculo com a equipe.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(mecErr.message);
    }

    return { id: userId };
  });
