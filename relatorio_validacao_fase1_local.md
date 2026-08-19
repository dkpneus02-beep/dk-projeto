# Validação local — Fase 1 de segurança e OS apagada

**Projeto:** DK Pneus / DK Auto Center  
**Data:** 19 de agosto de 2026  
**Escopo:** correções cirúrgicas de visibilidade, RLS e acesso a serviços; nenhum deploy foi executado e nenhuma migration foi aplicada ao Supabase de produção.

## Alterações realizadas

A migration `supabase/migrations/20260819100000_fase1_seguranca_os_apagada.sql` foi preparada para substituir a visibilidade permissiva por regras baseadas em `can_view_atendimento`, excluir OS com `deleted_at` não nulo da visibilidade normal, bloquear acesso de mecânico a serviços de outros mecânicos e impedir que mecânico altere responsável, preço, peça, quantidade ou dados administrativos do serviço. O gerente permanece com visão das OS ativas e com capacidade de exclusão lógica.

A rota `src/routes/atendimento.$id.tsx` agora aplica explicitamente `.is("deleted_at", null)` na leitura por ID. Dessa forma, uma URL antiga não deve reabrir uma OS apagada no frontend, além da proteção esperada no RLS.

## Testes executados

| Verificação | Resultado |
|---|---|
| `npm run build` | **Aprovado**. O build Vite/Nitro concluiu e gerou os artefatos de saída. |
| `git diff --check` | **Aprovado**, sem erros de espaços ou conflitos no diff. |
| Estrutura da migration | **Aprovada na inspeção estrutural**: blocos `$$` balanceados, policies e triggers com pares de remoção/criação. |
| Conferência de colunas usadas | **Aprovada**: as colunas financeiras e de exclusão lógica usadas pela migration existem nas migrations anteriores. |
| `npm run lint` global | **Não concluído**: o comando percorreu artefatos gerados e ficou travado; foi encerrado sem alterar arquivos. |
| ESLint direcionado | Encontrou **351 problemas preexistentes de Prettier**, concentrados no formato geral dos arquivos, sem erro de build TypeScript. Não foi executado `--fix` para evitar uma alteração massiva e não cirúrgica. |

## Pendências antes da publicação única

A migration ainda precisa ser aplicada no projeto Supabase correto, de preferência após uma conferência final e backup. Depois disso, devem ser feitos testes manuais com uma conta de gerente e uma conta de mecânico: leitura de OS ativa, acesso por URL de OS apagada, atribuição de serviço a outro mecânico, alteração de preço/peça por mecânico, exclusão lógica pelo gerente e desaparecimento da OS em notificações e listas.

O deploy Netlify não foi acionado nesta etapa, respeitando a regra de uma única publicação ao final da conferência cirúrgica.

## Conferência adicional e início da Fase 2

Na conferência final da migration da Fase 1 foi identificada e corrigida uma brecha residual: as policies de `UPDATE` e `DELETE` de `atendimento_servicos` também precisam exigir `can_view_atendimento(atendimento_id)`, para impedir acesso direto a serviço próprio ligado a uma OS apagada. Essa exigência foi adicionada antes de avançar.

A Fase 2 foi iniciada com a migration `20260819110000_fase2_finalizacao_transacional.sql` e a rota de detalhe da OS. A tela deixou de executar separadamente atualização da OS, inserção de pagamentos, lançamento no caixa e criação de retorno; agora chama a RPC `finalizar_atendimento_transacional`. A RPC valida gerente, OS ativa, estado não finalizado, pagamentos, desconto e soma dos pagamentos; calcula total e garantia; atualiza a OS, dispara o gatilho existente de baixa de estoque, insere pagamentos, lança caixa e cria retorno opcional na mesma transação. Repetição de finalização é recusada e falha de estoque ou de qualquer etapa deve reverter a transação.

O build local após a integração da Fase 2 passou novamente. Nenhuma migration foi aplicada em produção e nenhum deploy foi executado.

## Verificação da Fase 2

A inspeção estrutural confirmou que a RPC exige usuário gerente, trava a OS com `FOR UPDATE`, rejeita OS apagada ou já finalizada, valida lista de pagamentos, valores não negativos, parcelas válidas e igualdade entre pagamentos e total. A operação contém atualização da OS, pagamentos, caixa e retorno opcional dentro do mesmo corpo transacional; a baixa de estoque é acionada pela transição de status existente. A função foi restringida a usuários autenticados e não foi concedida a `anon`.

O `npm run build` foi executado novamente após a integração e passou. O `git diff --check` também passou. Não existe cliente PostgreSQL local neste ambiente, portanto a execução real da migration, o teste de rollback e o teste de estoque insuficiente ainda dependem de um projeto Supabase de teste ou da aplicação controlada no projeto conectado. Por segurança, a Fase 2 está tecnicamente preparada, mas não deve ser considerada funcionalmente aprovada em produção antes desses testes.

## Fase 3 — estoque, exclusão e histórico

A revisão confirmou que a exclusão de serviço com peça consumida devolve a quantidade antes de remover o movimento de consumo, e que a exclusão lógica de OS finalizada estorna os consumos uma única vez. Como os movimentos de consumo são removidos durante o estorno, repetir a operação não duplica a devolução.

Foi identificado que a reabertura no histórico apagava caixa e pagamentos em chamadas separadas antes de atualizar o status. Esse fluxo foi substituído pela RPC `reabrir_atendimento_transacional`, que trava a OS, exige gerente, remove caixa e pagamentos, muda o status para `aberto` e deixa o gatilho existente fazer o estorno de estoque na mesma transação. Uma falha deve reverter todos os efeitos.

O build local após a alteração passou; os blocos SQL da nova migration estão balanceados e o `git diff --check` passou. A execução real em PostgreSQL/Supabase continua pendente por não haver banco local neste ambiente.

## Fase 4 — câmera, notificações e backup

A câmera de código de barras foi revisada sem alterar a câmera da vistoria. O diálogo agora aguarda o portal do modal renderizar o elemento de vídeo antes de solicitar a câmera, usa `autoPlay`, encerra explicitamente todas as tracks do `MediaStream`, mantém callbacks estáveis, traduz erros de permissão/dispositivo/segurança, oferece tentativa novamente e possui fallback por foto/galeria usando o leitor ZXing. O leitor USB/Bluetooth continua funcionando como entrada de teclado independente.

O alerta de fechamento deixou de repetir indefinidamente a cada ciclo de dez minutos para a mesma combinação de pendências. A chave diária é recalculada por OS/serviço, e o carregamento também filtra explicitamente OS ativas. O canal Realtime foi preservado.

O backup foi ampliado para incluir movimentos de estoque, contatos de retorno, perfis e papéis, além de uma ordem de restauração. Subscriptions de Web Push não são exportadas porque contêm credenciais específicas de dispositivos. O build local completo e o `git diff --check` passaram após todas essas alterações.
