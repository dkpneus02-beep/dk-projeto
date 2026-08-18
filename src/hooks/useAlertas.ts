import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Alertas nativos do navegador:
 * - Mecânico: pendências perto do fim do expediente, repetindo de 10 em 10 min.
 * - Gerente: retornos de cliente vencidos, repetindo a cada 1 hora.
 * As repetições param quando não há mais pendência (serviço concluído / retorno contatado).
 */
export function useAlertas() {
  const { user, role, nome } = useAuth();
  const qc = useQueryClient();
  const ultimoRetorno = useRef(0);

  // --------------------------------------------------------------
  // Tempo real (Supabase Realtime): reflete IMEDIATAMENTE no painel
  // do gerente quando um carro fica pronto, e avisa o mecânico assim
  // que um serviço é atribuído a ele — sem esperar o polling de 10 min.
  // --------------------------------------------------------------
  useEffect(() => {
    if (!user || !role) return;

    const notificar = (titulo: string, corpo: string) => {
      toast(titulo, { description: corpo });
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(titulo, { body: corpo, tag: titulo, renotify: true } as NotificationOptions);
        } catch {
          /* ignora navegadores sem suporte */
        }
      }
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    const iniciar = async () => {
      if (role === "gerente") {
        channel = supabase.channel(`realtime-gerente-${user.id}`);
        channel.on("postgres_changes", { event: "*", schema: "public", table: "notificacoes_internas" }, () => {
          void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] });
          void qc.invalidateQueries({ queryKey: ["notificacoes-nao-lidas", user.id] });
        });
        // Etapa 1 -> 2: mecânico concluiu, gerente precisa finalizar/entregar.
        channel.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "atendimentos" },
          (payload) => {
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
            void qc.invalidateQueries({ queryKey: ["patio"] });
            void qc.invalidateQueries({ queryKey: ["historico"] });
            const novo = payload.new as { status?: string; placa?: string; cliente_nome?: string };
            const antigo = payload.old as { status?: string };
            if (novo.status === "aguardando_gerente" && antigo.status !== "aguardando_gerente") {
              notificar(
                "Carro pronto para finalizar",
                `${novo.placa ?? ""} — ${novo.cliente_nome ?? "cliente"} está aguardando finalização.`,
              );
            }
          },
        );
        // Cenário B: mecânico criou/atualizou vistoria — reflete no painel do gerente.
        channel.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "atendimento_servicos" },
          (payload) => {
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
            void qc.invalidateQueries({ queryKey: ["patio"] });
            void qc.invalidateQueries({ queryKey: ["historico"] });
            void qc.invalidateQueries({ queryKey: ["atendimento"] });
            const novo = payload.new as { status?: string; nome?: string };
            const antigo = payload.old as { status?: string };
            if (novo.status === "concluido" && antigo.status !== "concluido") {
              notificar("Serviço concluído", `"${novo.nome ?? "Item"}" foi marcado como feito.`);
            }
          },
        );
      }

      if (role === "mecanico") {
        // Cenário A: gerente atribuiu um serviço a este mecânico agora mesmo.
        const { data: mec } = await supabase
          .from("mecanicos")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelado || !mec) return;
        channel = supabase.channel(`realtime-mecanico-${user.id}`);
        channel.on("postgres_changes", { event: "*", schema: "public", table: "notificacoes_internas", filter: `destinatario_user_id=eq.${user.id}` }, () => {
          void qc.invalidateQueries({ queryKey: ["notificacoes-internas"] });
          void qc.invalidateQueries({ queryKey: ["notificacoes-nao-lidas", user.id] });
        });
        channel.on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "atendimento_servicos",
            filter: `mecanico_id=eq.${mec.id}`,
          },
          (payload) => {
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
            void qc.invalidateQueries({ queryKey: ["patio"] });
            void qc.invalidateQueries({ queryKey: ["atendimento"] });
            const novo = payload.new as { nome?: string };
            const antigo = payload.old as { mecanico_id?: string | null };
            if (!antigo.mecanico_id) {
              notificar("Novo serviço atribuído a você", novo.nome ?? "Confira seus atendimentos.");
            }
          },
        );
      }

      if (channel && !cancelado) channel.subscribe();
    };

    void iniciar();
    return () => {
      cancelado = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user, role]);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const notificar = (titulo: string, corpo: string) => {
      if (Notification.permission !== "granted") return;
      try {
        new Notification(titulo, { body: corpo, tag: titulo, renotify: true } as NotificationOptions);
      } catch {
        /* ignora navegadores sem suporte */
      }
    };

    const checar = async () => {
      const { data: cfg } = await supabase.from("configuracoes").select("*").maybeSingle();
      const fechamento = cfg?.horario_fechamento ?? "17:30";
      const antecedencia = cfg?.aviso_antecedencia_min ?? 15;

      const agora = new Date();
      const [h, m] = String(fechamento).split(":").map(Number);
      const fim = new Date(agora);
      fim.setHours(h ?? 17, m ?? 30, 0, 0);
      const minutosAteFim = (fim.getTime() - agora.getTime()) / 60000;

      if (minutosAteFim <= antecedencia && minutosAteFim > -120) {
        const { data } = await supabase
          .from("atendimento_servicos")
          .select("id, nome, status, atendimentos!inner(placa, status)")
          .neq("status", "concluido");
        const pendentes = (data ?? []).filter(
          (s) => (s.atendimentos as { status: string } | null)?.status === "aberto",
        );
        if (pendentes.length) {
          const placas = [
            ...new Set(pendentes.map((p) => (p.atendimentos as { placa: string }).placa)),
          ].join(", ");
          notificar(
            "Aviso de fechamento",
            `Olá${nome ? `, ${nome}` : ""}! O expediente encerra às ${fechamento}. Há ${pendentes.length} serviço(s) pendente(s) no(s) veículo(s) ${placas}.`,
          );
        }
      }

      if (role === "gerente" && Date.now() - ultimoRetorno.current > 3600_000) {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from("notificacoes_retorno")
          .select("cliente_nome, veiculo, servico")
          .eq("status", "pendente")
          .lte("vencimento", hoje);
        if (data && data.length) {
          ultimoRetorno.current = Date.now();
          const primeiro = data[0]!;
          notificar(
            "Retorno de cliente pendente",
            `${data.length} cliente(s) para contatar. Ex.: ${primeiro.cliente_nome} (${primeiro.veiculo ?? ""}) — ${primeiro.servico}.`,
          );
        }

      }
    };

    void checar();
    const id = window.setInterval(() => void checar(), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user, role, nome]);
}

export async function pedirPermissaoNotificacoes() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}
