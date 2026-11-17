# Plano faseado de publicação — DK Auto Center V.0.0.1

**Estado: NÃO LIBERAR AINDA.** Trabalho somente na V.0.0.1, branch `fix/pecas-layout-desconto-atalho-20260930`, base `a8ad94f`. Commits locais do pacote incluem `9ce249d` e `55f58c0`; sem push. A linha Financeiro está fora do escopo. Nenhuma migration foi aplicada e nenhum deploy foi feito.

## Estado e evidências

- Produção Supabase `fkkplzwefhjohpfjwcwn` permanece sem escrita; a inspeção remota foi de metadados. Nenhuma OS, peça, pagamento ou configuração foi consultada/alterada.
- Após aprovação explícita, foi criado `dkautocenter-homologacao` (`cpumvmcxqpzgphvnkaug`), região `sa-east-1`, na organização Free, com cotação de US$ 0/mês. Estado `ACTIVE_HEALTHY`; schema `public` vazio e histórico sem migrations. Não foi aplicado SQL.
- Build local final passou novamente; o comando limpo do Netlify (`npm install --include=optional --force` + `npm run build`) também passou anteriormente em cópia temporária.
- **Prévia/interatividade local validada parcialmente:** `/auth` renderizou os campos e o clique em “Esqueceu sua senha?” trocou para o formulário de recuperação, confirmando hidratação nesta execução. Não foi submetida autenticação nem chamado fluxo de escrita. Isso não explica a observação anterior presa no carregamento nem mede o login real em produção.
- **Login/performance pendente:** em produção o painel foi acessado, mas o usuário relatou demora para concluir o login; não foi feita medição suficiente para atribuir causa.
- A chamada read-only ao conector Netlify retornou HTTP 401; site ID, deploy atual e logs não puderam ser confirmados por esse conector. Reconectar Netlify será necessário antes de validar publicação/destino.
- QR Pix local foi testado com payload de R$ 100, PNG e CRC; isso não comprova leitura em impressora nem liquidação real.
- Parser PostgreSQL aceitou os 51 statements da migration de release, as 42 migrations locais (516 statements) e o bundle de base para staging (492 statements). Durante a integração, foi encontrada e corrigida uma policy RLS mal balanceada na migration de notificações. O parser não valida corpos PL/pgSQL nem executa triggers/RPCs; não há PostgreSQL/Docker local.
- TypeScript global mantém 14 diagnósticos em arquivos não alterados: `src/lib/mecanicos.server.ts`, `src/routes/api.upload-imgbb.ts`, `src/routes/caixa.tsx`, `src/routes/index.tsx`, `src/routes/notificacoes.tsx` e `src/routes/patio.tsx`. Nenhum diagnóstico aponta aos arquivos modificados. ESLint nos arquivos de código alterados não encontrou regra funcional quando a regra de formatação Prettier foi isolada; a execução normal reporta violações de formatação, mas o pipeline Netlify configurado não executa lint nem `tsc`.
- Senha temporária compartilhada não foi salva; confirmar que foi rotacionada antes de qualquer novo login de produção.
- Evidências técnicas: [Auditoria read-only do schema Supabase](AUDITORIA-SCHEMA-SUPABASE-READONLY-2026-11-16.md).

## Etapa 0 — preservar escopo e produção: CONCLUÍDA COM PENDÊNCIA DE ROTAÇÃO DE SENHA

Manter apenas a V.0.0.1; não incorporar nem apagar funcionalidades/objetos da linha Financeiro. Sem escritas na produção. Confirmar a rotação da senha antes de qualquer acesso autenticado futuro.

## Etapa 1 — candidato local: BUILD E INTERAÇÃO BÁSICA APROVADOS; INTEGRAÇÃO PENDENTE

Alterações registradas nos commits locais `9ce249d` e `55f58c0`: layout/toasts da OS; scanner por teclado/câmera em Peças e OS; cadastro rápido de peça e aviso de pendência; desconto percentual manual; pagamento pendente; QR Pix, recibo e reimpressão; campos Pix configuráveis; retry idempotente de peça rápida com chave/payload por escopo; proteção da RPC legada de estoque para sempre registrar lote. Dependência QR e lockfile sincronizados.

Correções locais: cadastro rápido só por gerente; peça pendente fora do seletor comum; associação via UPDATE captura snapshot e rejeita item pendente/excluído; trocar peça zera o desconto salvo para não transferi-lo. O 20% permanece apenas como valor inicial até confirmação gerencial. Alterações de mão de obra/quantidade estão incluídas no trigger de sincronização. Não há backfill em OS antigas.

**Gate pendente:** a prévia atual hidratou e uma interação local foi confirmada. Ainda não houve autenticação real nem validação completa dos fluxos de negócio; a causa da observação anterior de carregamento não está diagnosticada. Os 14 diagnósticos TypeScript fora das mudanças não integram o comando de build Netlify configurado, mas devem ser triados antes do release final.

## Etapa 2 — compatibilidade de banco: LEITURA CONCLUÍDA; STAGING SEM BASE

1. Lotes/CMV existem na produção (`peca_lotes`, `atendimento_pecas_movimentos`, `atendimento_pecas_cmv` e RPCs), mas o histórico local não contém todas as migrations remotas.
2. Versões remotas de `ajustes_estoque_rpc_auditoria` e `endurecer_permissoes_estoque_gerente` diferem das versões locais; há outras migrations de lote/CMV e objetos Financeiro. Não executar `db push`, repair, reset ou replay automático. Reconciliar o histórico sem incorporar a branch Financeiro.
3. Sincronização do total pode conflitar com o guard de edição. A proposta permite só atualização interna calculada em profundidade esperada e mantém bloqueio para UPDATE direto de `atendimentos.total`. Profundidade/ordem real ainda não testadas em PostgreSQL.
4. Guard local deixa gerente definir desconto/metadados; preserva edição operacional do mecânico responsável. Mudança de peça reseta desconto, impedindo transferência. Novo trigger local barra INSERT/UPDATE/DELETE de linhas em OS finalizada para todos os perfis, consultando o status com `FOR SHARE` contra a finalização `FOR UPDATE`. Ainda não existe fluxo transacional de reabertura/correção; alterações após fechamento ficam bloqueadas. Testar concorrência/deadlock e abort/retry em homologação.
5. Sem desconto automático em OS abertas: coluna fica `NULL`, UI pré-preenche 20% sem persistir até confirmação. Sem backfill de snapshots; linhas antigas usam nome do catálogo como fallback.
6. Peça pendente não baixa estoque/CMV e não gera ajuste retroativo depois de concluir cadastro. Definir impacto se a OS já tiver sido finalizada.
7. CMV remoto usa `pecas.preco_custo` enquanto lotes são consumidos FIFO; pode haver diferença. A função remota de estorno registra CMV tipo `estorno`. Homologar baixa, estorno, reabertura e refinalização.
8. Pagamento pendente é quitado pela OS inteira, não parcialmente; QR deve refletir somente valor Pix pendente. Testar soma das formas e caixa sem duplicidade.
9. Finalizador remoto ainda usa a assinatura antiga e desconto automático Pix de 25%. Proposta altera a assinatura para descontos por linha e remove `_desconto` global não utilizado; cliente antigo terá erro de RPC se migration entrar sem atualizar o frontend. Coordenar versão e banco.
10. A RPC de peça rápida agora exige chave idempotente e grava o resultado com o pedido na mesma transação; retry com a mesma chave/payload retorna o resultado anterior, inclusive em chamadas concorrentes. O cliente salva chave+payload em `sessionStorage` por usuário/OS e restaura o rascunho após reload; edição cria chave nova. Não há limpeza automática da tabela privada de chaves. Homologar retry/concorrência/reload e decidir retenção antes da produção. A migration não tem down/rollback automático; preparar procedimento manual antes de executar.
11. A RPC legada `adicionar_entrada_estoque` ainda aceitava gerente e alterava saldo sem lote. A migration local passa a manter a assinatura antiga como wrapper do fluxo com custo médio atual e geração de lote; confirmar o custo usado por clientes antigos e testar no staging.

## Etapa 3 — homologação isolada: PROJETO CRIADO; BUNDLE PRONTO; APLICAÇÃO AGUARDA AUTORIZAÇÃO

O projeto isolado `cpumvmcxqpzgphvnkaug` está saudável, mas `public` e o histórico de migrations estão vazios. O bundle preparado está fora do repositório, com 41 migrations locais mais as dependências operacionais ausentes; exclui a migration de release, não contém Financeiro nem registros de produção e passou pelo parser PostgreSQL com 492 statements. A comparação por metadados cobriu `peca_referencias`, `peca_lotes`, `atendimento_pecas_cmv` e as RPCs de entrada com custo, consumo/estorno de lotes e normalização. O bundle inclui DML local: duas inserções de catálogo/configuração padrão, um DELETE de notificações antigas, cinco UPDATEs de backfill/manutenção e três blocos DO para publicação/cron. Em base nova vazia, o DELETE e os UPDATEs não alteram registros preexistentes; as inserções criam apenas defaults estáticos do código e o agendamento de limpeza de orçamentos pode ser criado se `pg_cron` estiver disponível. Ainda assim, é uma mudança de banco e não será aplicada sem autorização explícita. Também não fazer replay automático do histórico de produção. Depois de autorizado e aplicado somente na homologação, validar cadeia/depth/total; UPDATE direto negado; edição legítima do mecânico; descontos e snapshots; troca de peça; imutabilidade após fechamento; locks concorrentes/deadlock/retry; peça provisória/CMV; lotes, baixa e estorno; pagamento dividido, quitação, caixa, QR, impressão/reimpressão; scanner; layout móvel e toast. Não finalizar OS real.

## Etapa 4 — candidato de publicação: BLOQUEADA

Só após aprovação das etapas anteriores. Preview Netlify deve apontar à homologação; validar logs, login, interatividade e fluxos em telefone/impressora. Produção intocada.

## Etapa 5 — produção: AGUARDA AUTORIZAÇÃO ESPECÍFICA

Apresentar SHA/arquivos, migration reconciliada, impacto, janela, backup e rollback. Só agir com aprovação específica; este roteiro não autoriza migration nem deploy.

**Critério de liberação:** etapas 1–4 aprovadas, migrations reconciliadas, preview interativo, login/performance entendidos, permissões/triggers testados em staging e rollback pronto. Estado atual: pacote código+docs registrado localmente, sem push; build passa; homologação gratuita criada e saudável, porém vazia; migration não aplicada; 14 diagnósticos TypeScript fora das mudanças; parser aceita 51 statements, PL/pgSQL não executado; conector Netlify 401; produção sem escrita; deploy não autorizado.
