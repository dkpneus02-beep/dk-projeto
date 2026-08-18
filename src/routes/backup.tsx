import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isGerente } from "@/lib/permissions";

export const Route = createFileRoute("/backup")({
  head: () => ({
    meta: [
      { title: "Backup | DK Auto Center" },
      { name: "description", content: "Exportação segura dos dados operacionais da oficina." },
    ],
  }),
  component: Backup,
});

const TABELAS = [
  "atendimentos",
  "atendimento_servicos",
  "pagamentos",
  "caixa_sessoes",
  "caixa_movimentos",
  "pecas",
  "mecanicos",
  "servicos_catalogo",
  "notificacoes_retorno",
  "avisos",
  "aviso_leituras",
  "notificacoes_internas",
  "configuracoes",
  "audit_eventos",
] as const;

const PAGE_SIZE = 500;

type BackupPayload = {
  backup_version: 1;
  generated_at: string;
  generated_by: string | null;
  scope: string;
  tables: Record<string, unknown[]>;
  storage: {
    bucket: string;
    note: string;
  };
};

async function carregarTabela(nome: string) {
  const rows: unknown[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(nome as never)
      .select("*")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${nome}: ${error.message}`);
    const pagina = (data ?? []) as unknown[];
    rows.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

function Backup() {
  const { role, user, nome } = useAuth();
  const gerente = isGerente(role);
  const [exportando, setExportando] = useState(false);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);

  if (!gerente) {
    return (
      <AppShell>
        <PageHeader title="Backup" subtitle="Acesso restrito" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Somente o gerente pode exportar os dados da oficina.</CardContent></Card>
      </AppShell>
    );
  }

  const exportar = async () => {
    setExportando(true);
    try {
      const entries = await Promise.all(TABELAS.map(async (tabela) => [tabela, await carregarTabela(tabela)] as const));
      const geradoEm = new Date().toISOString();
      const payload: BackupPayload = {
        backup_version: 1,
        generated_at: geradoEm,
        generated_by: user?.id ?? null,
        scope: "DK Auto Center — dados operacionais",
        tables: Object.fromEntries(entries),
        storage: {
          bucket: "vistorias",
          note: "Os registros de avarias e seus links de fotos são preservados em atendimentos.avarias. Os arquivos binários do Storage devem ser mantidos no projeto Supabase e não são incorporados neste JSON.",
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dk-auto-center-backup-${geradoEm.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setUltimoBackup(geradoEm);
      toast.success("Backup exportado. Guarde o arquivo sem renomeá-lo ou editá-lo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar o backup.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Backup e segurança" subtitle="Exportação manual dos dados operacionais da oficina" />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div>
              <h2 className="font-display text-xl font-bold uppercase">Backup de dados</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Este export salva um snapshot dos dados que o gerente consegue consultar, incluindo OS, serviços, pagamentos, caixa, estoque, retornos, avisos, configurações e auditoria.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TABELAS.map((tabela) => <Badge key={tabela} variant="outline">{tabela}</Badge>)}
            </div>
            <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-semibold">Importante</p>
              <p className="mt-1 text-muted-foreground">Cada exportação é um retrato daquele momento. Ela não se atualiza sozinha. Faça um novo backup depois de mudanças importantes e guarde o arquivo em local seguro.</p>
            </div>
            <Button onClick={exportar} disabled={exportando}>
              {exportando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-download" />}
              {exportando ? "Gerando backup…" : "Exportar backup JSON"}
            </Button>
            {ultimoBackup && <p className="text-xs text-muted-foreground">Último export nesta sessão: {new Date(ultimoBackup).toLocaleString("pt-BR")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6 text-sm">
            <h2 className="font-display text-xl font-bold uppercase">Como guardar</h2>
            <p className="text-muted-foreground">Baixe o arquivo e mantenha pelo menos duas cópias: uma no computador e outra em um armazenamento externo ou nuvem.</p>
            <p className="text-muted-foreground">Não coloque o arquivo em repositório público. Ele contém dados de clientes, veículos e movimentações financeiras.</p>
            <p className="text-muted-foreground">As fotos ficam no bucket privado <strong className="text-foreground">vistorias</strong>; o JSON preserva os registros e links associados, mas não expõe a chave de serviço nem tenta copiar arquivos privados pelo navegador.</p>
            <p className="text-xs text-muted-foreground">Exportado por: {nome || "gerente"}</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
