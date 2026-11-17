# Plano faseado de publicação — DK Auto Center V.0.0.1

**Estado: NÃO LIBERAR AINDA.** Trabalho somente na V.0.0.1, branch `fix/pecas-layout-desconto-atalho-20260930`, base `a8ad94f`. Commit local `9ce249d` criado; branch 1 commit à frente, sem push. A linha Financeiro está fora do escopo. Nenhuma migration foi aplicada e nenhum deploy foi feito.

## Estado e evidências

- Produção Supabase `fkkplzwefhjohpfjwcwn` permanece sem escrita; a inspeção remota foi de metadados. Nenhuma OS, peça, pagamento ou configuração foi consultada/alterada.
- Após aprovação explícita, foi criado `dkautocenter-homologacao` (`cpumvmcxqpzgphvnkaug`), região `sa-east-1`, na organização Free, com cotação de US$ 0/mês. Estado `ACTIVE_HEALTHY`; schema `public` vazio e histórico sem migrations. Não foi aplicado SQL.
- Build local final passou novamente; o comando limpo do Netlify (`npm install --include=optional --force` + `npm run build`) também passou anteriormente em cópia temporária.
- **Prévia/interatividade local validada parcialmente:** `/auth` renderizou os campos e o clique em “Esqueceu sua senha?” trocou para o formulário de recuperação, confirmando hidratação nesta execução. Não foi submetida autenticação nem chamado fluxo de escrita. Isso não explica a observação anterior presa no carregamento nem mede o login real em produção.
- **Login/performance pendente:** em produção o painel foi acessado, mas o usuário relatou demora para concluir o login; não foi feita medição suficiente para atribuir causa.
- A chamada read-only ao conector Netlify retornou HTTP 401; site ID, deploy atual e logs não puderam ser confirmados por esse conector. Reconectar Netlify será necessário antes de validar publicação/destino.
- QR Pix local foi testado com payload de R$ 100, PNG e CRC; isso não comprova leitura em impressora nem liquidação real.
- Parser PostgreSQL aceitou os 51 statements externos da migration atual, mas não valida PL/pgSQL. Não há PostgreSQL/Docker local; nenhum RPC/trigger foi executado.
- TypeScript global mantém 14 diagnósticos em arquivos não alterados: `src/lib/mecanicos.server.ts`, `src/routes/api.upload-imgbb.ts`, `src/routes/caixa.tsx`, `src/routes/index.tsx`, `src/routes/notificacoes.tsx` e `src/routes/patio.tsx`. Nenhum diagnóstico aponta aos arquivos modificados. ESLint nos arquivos de código alterados não encontrou regra funcional quando a regra de formatação Prettier foi isolada; a execução normal reporta violações de formatação, mas o pipeline Netlify configurado não executa lint nem `tsc`.
- Senha temporária compartilhada não foi salva; confirmar que foi rotacionada antes de qualquer novo login de produção.
- Evidências técnicas: [Auditoria read-only do schema Supabase](AUDITORIA-SCHEMA-SUPABASE-READONLY-2026-11-16.md).

## Etapa 0 — preservar escopo e produção: CONCLUÍDA COM PENDÊNCIA DE ROTAÇÃO DE SENHA

Manter apenas a V.0.0.1; não incorporar nem apagar funcionalidades/objetos da linha Financeiro. Sem escritas na produção. Confirmar a rotação da senha antes de qualquer acesso autenticado futuro.

## Etapa 1 — candidato local: BUILD E INTERAÇÃO BÁSICA APROVADOS; INTEGRAÇÃO PENDENTE

Alterações registradas no commit local `9ce249d`: layout/toasts da OS; scanner por teclado/câmera em Peças e OS; cadastro rápido de peça e aviso de pendência; desconto percentual manual; pagamento pendente; QR Pix, recibo e reimpressão; campos Pix configuráveis. Dependência QR e lockfile sincronizados.

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

## Etapa 3 — homologação isolada: PROJETO CRIADO; BASE DE SCHEMA PENDENTE

O projeto isolado `cpumvmcxqpzgphvnkaug` está saudável, mas `public` e o histórico de migrations estão vazios. A comparação read-only identificou 4 tabelas não financeiras necessárias à V.0.0.1 ausentes dos `CREATE TABLE` locais: `peca_referencias`, `peca_lotes`, `atendimento_pecas_cmv` e `peca_ajustes_estoque` (esta última é criada pela migration local tardia). Também precisam ser reconciliadas as RPCs `adicionar_entrada_estoque_com_custo`, `consumir_lotes_estoque`, `repor_estoque_com_custo` e a função `normalizar_referencia_peca`; o código local tem 24 tabelas, enquanto a produção tem objetos adicionais de Financeiro que devem ficar excluídos. Policies e índices dos objetos operacionais foram lidos por metadados; nenhuma linha de cliente foi consultada. Não fazer replay automático nem aplicar a migration de feature ao banco vazio. Próximo passo: montar um bootstrap schema-only de V.0.0.1 com migrations locais e somente essas dependências operacionais não financeiras; submeter a autorização explícita antes de aplicar DDL na homologação. Testar: cadeia/depth/total; UPDATE direto negado; edição legítima do mecânico; descontos e snapshots; troca de peça; imutabilidade após fechamento; locks concorrentes/deadlock/retry; peça provisória/CMV; lotes, baixa e estorno; pagamento dividido, quitação, caixa, QR, impressão/reimpressão; scanner; layout móvel e toast. Não finalizar OS real.

## Etapa 4 — candidato de publicação: BLOQUEADA

Só após aprovação das etapas anteriores. Preview Netlify deve apontar à homologação; validar logs, login, interatividade e fluxos em telefone/impressora. Produção intocada.

## Etapa 5 — produção: AGUARDA AUTORIZAÇÃO ESPECÍFICA

Apresentar SHA/arquivos, migration reconciliada, impacto, janela, backup e rollback. Só agir com aprovação específica; este roteiro não autoriza migration nem deploy.

**Critério de liberação:** etapas 1–4 aprovadas, migrations reconciliadas, preview interativo, login/performance entendidos, permissões/triggers testados em staging e rollback pronto. Estado atual: commit local criado, sem push; hardening de idempotência, wrapper de estoque legado, isolamento de escopo e documentação ainda não commitados; build passa; homologação gratuita criada e saudável, porém vazia; migration não aplicada; 14 diagnósticos TypeScript fora das mudanças; parser aceita 51 statements, PL/pgSQL não executado; conector Netlify 401; produção sem escrita; deploy não autorizado.
