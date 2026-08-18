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

function normalizarNome(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function normalizarTelefone(value: string) {
  return value.replace(/\D/g, "");
}

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

    const email = data.email.trim().toLowerCase();
    const nomeNormalizado = normalizarNome(data.nome);
    const telefoneNormalizado = normalizarTelefone(data.telefone);
    if (telefoneNormalizado.length < 10) {
      throw new Error("Informe um telefone válido com DDD.");
    }

    const { data: registros, error: registrosErr } = await supabaseAdmin
      .from("mecanicos")
      .select("id, user_id, nome, telefone, email, deleted_at, ativo")
      .limit(2000);
    if (registrosErr) throw new Error(registrosErr.message);

    const registroPorEmail = (registros ?? []).find((m) => m.email?.trim().toLowerCase() === email);
    const registroPorNome = (registros ?? []).find(
      (m) => m.id !== registroPorEmail?.id && normalizarNome(m.nome) === nomeNormalizado,
    );
    if (registroPorNome) {
      throw new Error("Já existe um mecânico com este nome. Informe outro nome.");
    }
    const registroPorTelefone = (registros ?? []).find(
      (m) => m.id !== registroPorEmail?.id && normalizarTelefone(m.telefone ?? "") === telefoneNormalizado,
    );
    if (registroPorTelefone) {
      throw new Error("Já existe um mecânico com este telefone. Informe outro número.");
    }

    const { data: lista, error: listaErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listaErr) throw new Error(listaErr.message);
    const usuarioExistente = lista.users.find((u) => u.email?.trim().toLowerCase() === email);

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

    const dadosMecanico = {
      nome: data.nome,
      telefone: data.telefone,
      email,
      user_id: userId,
      ativo: true,
      deleted_at: null,
    };

    // O trigger on_auth_mecanico_created pode ter criado a linha automaticamente
    // junto com a conta Auth. Atualizamos essa linha; só inserimos se o trigger não
    // existir no ambiente, mantendo compatibilidade com staging e produção.
    const { data: mecanicoExistente, error: atualizarErr } = await supabaseAdmin
      .from("mecanicos")
      .update(dadosMecanico)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (atualizarErr) throw new Error(atualizarErr.message);

    if (!mecanicoExistente) {
      const { error: inserirErr } = await supabaseAdmin.from("mecanicos").insert(dadosMecanico);
      if (inserirErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new Error(inserirErr.message);
      }
    }

    return { id: userId };
  });
