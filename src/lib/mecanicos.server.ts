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

    const email = data.email.toLowerCase();
    const { data: lista, error: listaErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listaErr) throw new Error(listaErr.message);
    const usuarioExistente = lista.users.find((u) => u.email?.toLowerCase() === email);

    let userId = usuarioExistente?.id;
    if (userId) {
      const { data: registroExistente, error: registroErr } = await supabaseAdmin
        .from("mecanicos")
        .select("id, deleted_at, ativo")
        .eq("user_id", userId)
        .maybeSingle();
      if (registroErr) throw new Error(registroErr.message);
      if (registroExistente && !registroExistente.deleted_at && registroExistente.ativo) {
        throw new Error("Este e-mail já está cadastrado para um mecânico ativo.");
      }
      if (registroExistente) {
        const { error: restaurarErr } = await supabaseAdmin
          .from("mecanicos")
          .update({ nome: data.nome, telefone: data.telefone, email, ativo: true, deleted_at: null })
          .eq("id", registroExistente.id);
        if (restaurarErr) throw new Error(restaurarErr.message);
        const { error: senhaErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: data.senha,
          user_metadata: { nome: data.nome, telefone: data.telefone, role: "mecanico" },
        });
        if (senhaErr) throw new Error(senhaErr.message);
        return { id: userId };
      }
      throw new Error("Este e-mail já pertence a uma conta sem cadastro de mecânico. Use outro e-mail.");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, telefone: data.telefone, role: "mecanico" },
    });
    if (createErr) throw new Error(createErr.message);

    userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário do mecânico.");

    const { error: mecErr } = await supabaseAdmin.from("mecanicos").insert({
      nome: data.nome,
      telefone: data.telefone,
      email,
      user_id: userId,
    });
    if (mecErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(mecErr.message);
    }

    return { id: userId };
  });
