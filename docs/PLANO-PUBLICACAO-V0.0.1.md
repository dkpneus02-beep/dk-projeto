# Plano faseado de publicação — DK Auto Center V.0.0.1

**Estado: NÃO LIBERAR AINDA.** Trabalho somente na V.0.0.1, branch `fix/pecas-layout-desconto-atalho-20260930`; branch local 6 commits à frente da remota e migration final com correção SQL local ainda não commitada. Migrations aplicadas somente no staging isolado; produção, GitHub e Netlify sem alterações. A linha Financeiro está fora do escopo.

## Estado e evidências

- Produção Supabase `fkkplzwefhjohpfjwcwn` permanece sem escrita; a inspeção remota foi de metadados. Nenhuma OS, peça, pagamento ou configuração foi consultada/alterada.
- Após aprovação explícita, foi criado `dkautocenter-homologacao` (`cpumvmcxqpzgphvnkaug`), região `sa-east-1`, na organização Free, com cotação de US$ 0/mês. As quatro partes-base, uma migration corretiva de ajuste por lotes e a migration final V.0.0.1 estão registradas no histórico do staging. Contagens read-only de OS, serviços, peças, pagamentos, orçamentos, ajustes de estoque e chaves idempotentes: todas zero.
- Build local final, executado após a correção SQL e a suíte de staging, passou; há apenas avisos do bundler sobre diretivas de dependências, sem falha. O comando limpo do Netlify (`npm install --include=optional --force` + `npm run build`) também passou anteriormente em cópia temporária.
- **Prévia/interatividade local validada parcialmente:** `/auth` renderizou os campos e o clique em “Esqueceu sua senha?” trocou para o formulário de recuperação, confirmando hidratação nesta execução. Não foi submetida autenticação nem chamado fluxo de escrita. Isso não explica a observação anterior presa no carregamento nem mede o login real em produção.
- **Login/performance pendente:** em produção o painel foi acessado, mas o usuário relatou demora para concluir o login; não foi feita medição suficiente para atribuir causa.
- O conector Netlify aparece habilitado na configuração, mas a checagem atual informa OAuth `not_supported` e nenhum token armazenado; a última chamada read-only retornou HTTP 401. Site/deploy foram identificados antes, porém o estado/destino atual e logs precisam de reconexão para nova confirmação.
- QR Pix local foi testado com payload de R$ 100, PNG e CRC; isso não comprova leitura em impressora nem liquidação real.
- Parser PostgreSQL aceitou os 51 statements da migration de release, as 42 migrations locais (516 statements) e o bundle de base para staging (492 statements). Foi corrigida uma policy RLS mal balanceada na migration de notificações. A migration final foi compilada/aplicada pelo PostgreSQL de staging após escapar os percentuais em um `RAISE`; triggers e RPCs foram instalados. Testes transacionais sintéticos passaram com rollback explícito, mas não substituem prévia visual em telefone/impressora.
- TypeScript global mantém 14 diagnósticos em arquivos não alterados: `src/lib/mecanicos.server.ts`, `src/routes/api.upload-imgbb.ts`, `src/routes/caixa.tsx`, `src/routes/index.tsx`, `src/routes/notificacoes.tsx` e `src/routes/patio.tsx`. Nenhum diagnóstico aponta aos arquivos modificados. ESLint nos arquivos de código alterados não encontrou regra funcional quando a regra de formatação Prettier foi isolada; a execução normal reporta violações de formatação, mas o pipeline Netlify configurado não executa lint nem `tsc`.
- Senha temporária compartilhada não foi salva; confirmar que foi rotacionada antes de qualquer novo login de produção.
- Evidências técnicas: [Auditoria read-only do schema Supabase](AUDITORIA-SCHEMA-SUPABASE-READONLY-2026-11-16.md).

## Etapa 0 — preservar escopo e produção: CONCLUÍDA COM PENDÊNCIA DE ROTAÇÃO DE SENHA

Manter apenas a V.0.0.1; não incorporar nem apagar funcionalidades/objetos da linha Financeiro. Sem escritas na produção. Confirmar a rotação da senha antes de qualquer acesso autenticado futuro.

## Etapa 1 — candidato local: BUILD E INTERAÇÃO BÁSICA APROVADOS; INTEGRAÇÃO PENDENTE

Alterações registradas nos commits locais `9ce249d` e `55f58c0`: layout/toasts da OS; scanner por teclado/câmera em Peças e OS; cadastro rápido de peça e aviso de pendência; desconto percentual manual; pagamento pendente; QR Pix, recibo e reimpressão; campos Pix configuráveis; retry idempotente de peça rápida com chave/payload por escopo; proteção da RPC legada de estoque para sempre registrar lote. Dependência QR e lockfile sincronizados.

Correções locais: cadastro rápido só por gerente; peça pendente fora do seletor comum; associação via UPDATE captura snapshot e rejeita item pendente/excluído; trocar peça zera o desconto salvo para não transferi-lo. O 20% permanece apenas como valor inicial até confirmação gerencial. Alterações de mão de obra/quantidade estão incluídas no trigger de sincronização. Não há backfill em OS antigas.

**Gate pendente:** a prévia atual hidratou e uma interação local foi confirmada. Ainda não houve autenticação real nem validação completa dos fluxos de negócio; a causa da observação anterior de carregamento não está diagnosticada. Os 14 diagnósticos TypeScript fora das mudanças não integram o comando de build Netlify configurado, mas devem ser triados antes do release final.

## Etapa 2 — compatibilidade de banco: schema instalado; suíte transacional principal aprovada

1. Lotes/CMV existem na produção (`peca_lotes`, `atendimento_pecas_movimentos`, `atendimento_pecas_cmv` e RPCs), mas o histórico local não contém todas as migrations remotas.
2. Versões remotas de `ajustes_estoque_rpc_auditoria` e `endurecer_permissoes_estoque_gerente` diferem das versões locais; há outras migrations de lote/CMV e objetos Financeiro. Não executar `db push`, repair, reset ou replay automático. Reconciliar o histórico sem incorporar a branch Financeiro.
3. Sincronização de total por edição do mecânico foi validada no staging (preço, mão de obra e desconto); finalização também confirmou o total. Concorrência/ordem de locks e UPDATE direto de `atendimentos.total` ainda não foram testados separadamente.
4. Guard local deixa gerente definir desconto/metadados; preserva edição operacional do mecânico responsável. Mudança de peça reseta desconto, impedindo transferência. O trigger de OS finalizada bloqueou INSERT/UPDATE/DELETE em teste. Ainda não existe fluxo transacional de reabertura/correção; concorrência/deadlock continuam pendentes.
5. Sem desconto automático em OS abertas: coluna fica `NULL`, UI pré-preenche 20% sem persistir até confirmação. Sem backfill de snapshots; linhas antigas usam nome do catálogo como fallback.
6. Peça pendente não baixa estoque/CMV e não gera ajuste retroativo depois de concluir cadastro. Definir impacto se a OS já tiver sido finalizada.
7. CMV remoto usa `pecas.preco_custo` enquanto lotes são consumidos FIFO; pode haver diferença. O teste de staging validou baixa FIFO e CMV de R$ 50; estorno, reabertura e refinalização seguem pendentes.
8. Pagamento pendente é quitado pela OS inteira, não parcialmente; QR deve refletir somente valor Pix pendente. Teste de staging validou soma dividida, ausência de caixa antes do recebimento e exatamente dois movimentos após quitação; QR/recibo ainda precisam de validação visual.
9. Finalizador remoto ainda usa a assinatura antiga e desconto automático Pix de 25%. Proposta altera a assinatura para descontos por linha e remove `_desconto` global não utilizado; cliente antigo terá erro de RPC se migration entrar sem atualizar o frontend. Coordenar versão e banco.
10. A RPC de peça rápida exige chave idempotente e grava o resultado com o pedido na mesma transação; teste sequencial confirmou retry igual e recusa de payload divergente sem duplicar linha. Cliente persiste chave+payload em `sessionStorage`; concorrência/reload e retenção da tabela ainda precisam ser testados/decididos antes da produção. A migration não tem down/rollback automático; preparar procedimento manual antes de executar.
11. A RPC legada `adicionar_entrada_estoque` ainda aceitava gerente e alterava saldo sem lote. A migration local passa a manter a assinatura antiga como wrapper do fluxo com custo médio atual e geração de lote; confirmar o custo usado por clientes antigos e testar no staging.

## Etapa 3 — homologação isolada: migrations e suíte transacional principal aprovadas

O projeto isolado `cpumvmcxqpzgphvnkaug` recebeu as quatro partes-base, a correção aditiva `dk_v001_ajuste_estoque_rpc` e a migration final `20261115190000_peca_rapida_pix_pagamento_pendente`. A primeira tentativa da migration final foi revertida por erro `%` sem escape; após correção e reaplicação, o histórico e os objetos foram verificados por leitura.

Suíte no staging passou dentro de uma transação com `ROLLBACK`: retry da peça rápida retornou a mesma resposta sem duplicar linha; chave com payload divergente foi recusada; cadastro pendente concluiu com 3 unidades/custo R$ 50 e ajuste auditado; UPDATE direto de saldo e custo foi bloqueado; edição de mão de obra pelo mecânico sincronizou total para R$ 110 sem permitir alteração do desconto; desconto de 20% aplicado; finalização registrou pagamentos pendentes divididos (Pix R$ 70 + dinheiro R$ 40), baixou uma unidade de lote e CMV de R$ 50; caixa permaneceu zerado até confirmação e recebeu exatamente dois movimentos, sem duplicidade; INSERT/UPDATE/DELETE em OS finalizada foram bloqueados. A primeira tentativa de teste parou ao tentar ler uma tabela privada de idempotência como `authenticated`; não houve concessão de privilégios, os dados foram revertidos e a suíte foi repetida sem esse acesso.

Depois do rollback, foram removidas as duas identidades temporárias de gerente/mecânico. Verificação final confirmou zero usuários/perfis/papéis/mecânicos de teste e zero OS, serviços, peças, pagamentos, sessões/movimentos de caixa, lotes, ajustes, movimentos de peça, CMV ou chaves idempotentes. Ainda pendem concorrência/deadlock, reabertura/estorno, retry em reload, UI de navegador, scanner, QR/recibo e impressão. Produção, GitHub e Netlify seguem sem escrita.

## Etapa 4 — candidato de publicação: BLOQUEADA

Só após aprovação das etapas anteriores. Preview Netlify deve apontar à homologação; validar logs, login, interatividade e fluxos em telefone/impressora. Produção intocada.

## Etapa 5 — produção: AGUARDA AUTORIZAÇÃO ESPECÍFICA

Apresentar SHA/arquivos, migration reconciliada, impacto, janela, backup e rollback. Só agir com aprovação específica; este roteiro não autoriza migration nem deploy.

**Critério de liberação:** etapas 1–4 aprovadas, migrations reconciliadas, preview interativo, login/performance entendidos, permissões/triggers testados em staging e rollback pronto. Estado atual: pacote local sem push; staging tem migrations aplicadas e todas as fixtures foram revertidas/removidas; suíte principal passou, com os limites listados acima; build após a correção passou; 14 diagnósticos TypeScript fora das mudanças; conector Netlify sem OAuth/token e leitura anterior 401; produção sem escrita; deploy não autorizado.
