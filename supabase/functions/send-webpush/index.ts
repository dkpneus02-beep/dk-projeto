import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendNotification } from "npm:web-push-neo";

type Config = {
  public_key: string;
  private_key: string;
  subject: string;
  trigger_secret: string;
};

type NotificationRow = {
  id: string;
  titulo: string;
  mensagem: string;
  destinatario_user_id: string;
  atendimento_id: string | null;
  tipo: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração server-side ausente" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: config, error: configError } = await supabase
    .rpc("webpush_config_for_service")
    .maybeSingle<Config>();
  if (configError || !config) return json({ error: "Configuração Web Push indisponível" }, 500);

  const providedSecret = request.headers.get("x-webpush-secret");
  if (!providedSecret || providedSecret !== config.trigger_secret) return json({ error: "Não autorizado" }, 401);

  let body: { notification_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.notification_id) return json({ error: "notification_id é obrigatório" }, 400);

  const { data: notification, error: notificationError } = await supabase
    .from("notificacoes_internas")
    .select("id, titulo, mensagem, destinatario_user_id, atendimento_id, tipo")
    .eq("id", body.notification_id)
    .maybeSingle<NotificationRow>();
  if (notificationError) return json({ error: "Não foi possível carregar a notificação" }, 500);
  if (!notification) return json({ sent: 0, reason: "notificação inexistente" });

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("webpush_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", notification.destinatario_user_id)
    .eq("ativo", true)
    .limit(20);
  if (subscriptionsError) return json({ error: "Não foi possível carregar os dispositivos" }, 500);

  const payload = JSON.stringify({
    title: notification.titulo,
    body: notification.mensagem,
    notification_id: notification.id,
    tag: `dk-${notification.id}`,
    url: notification.atendimento_id
      ? `/atendimento/${notification.atendimento_id}`
      : "/notificacoes-internas",
  });

  let sent = 0;
  let invalid = 0;
  for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.public_key,
            privateKey: config.private_key,
          },
          TTL: 60,
          urgency: "high",
          topic: `dk-${notification.tipo}`.slice(0, 32),
        },
      );
      sent += 1;
      await supabase.from("webpush_subscriptions").update({ ultimo_envio_at: new Date().toISOString(), ultimo_erro_at: null }).eq("id", subscription.id);
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        invalid += 1;
        await supabase.from("webpush_subscriptions").update({ ativo: false, ultimo_erro_at: new Date().toISOString() }).eq("id", subscription.id);
      }
    }
  }

  return json({ sent, invalid, devices: subscriptions?.length ?? 0 });
});
