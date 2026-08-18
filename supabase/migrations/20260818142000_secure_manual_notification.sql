-- A função de conversa só pode ser chamada por usuários autenticados.
REVOKE ALL ON FUNCTION public.enviar_notificacao_manual(uuid, text, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enviar_notificacao_manual(uuid, text, text, text, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enviar_notificacao_manual(uuid, text, text, text, uuid, uuid, uuid, uuid) TO authenticated;
