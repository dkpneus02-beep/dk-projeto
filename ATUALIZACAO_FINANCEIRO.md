# Atualização financeira local — primeira etapa

## Objetivo

Criar a primeira versão local da aba Financeiro para que o gerente cadastre gastos fixos e variáveis do mês, registre parcelamentos e visualize automaticamente as receitas das OS finalizadas, os descontos, os movimentos de caixa, os gastos cadastrados e o resultado operacional.

O escopo desta etapa é local no código e no preview. A migração financeira foi aplicada ao projeto Supabase conectado somente para viabilizar o teste funcional. Nenhum deploy foi feito no Netlify.

## Base de trabalho

A implementação parte da branch correta do sistema e continua na branch local `feat/catalogo-pecas-referencias`. A `main` não foi usada como base. O site publicado e o Netlify permaneceram intocados.

## O que foi implementado

### Banco de dados versionado localmente

Foi criada a migração `supabase/migrations/20260923153000_financeiro_gastos.sql`. Ela define as tabelas `financeiro_categorias`, `despesas_financeiras` e `despesa_parcelas`.

O modelo contempla categoria, tipo fixo ou variável, fornecedor, competência, vencimento, valor com duas casas, status, recorrência, código de barras, observação, comprovante, parcelas, pagamento e vínculo futuro com movimento de caixa.

As políticas propostas restringem o acesso ao gerente por meio de `has_role`. A migração contém categorias iniciais para aluguel, água, energia, internet, ferramentas, peças, pneus, frete, folha, adiantamentos, comissões, impostos, taxas e materiais.

A migração foi aplicada no projeto `fkkplzwefhjohpfjwcwn` com o nome `financeiro_gastos`. As três tabelas foram confirmadas com RLS ativo. A versão publicada no Netlify não foi alterada.

### Frontend local

Foi criada a rota `/financeiro` em `src/routes/financeiro.tsx`.

A tela permite selecionar o mês e cadastrar:

- Descrição do gasto.
- Tipo fixo ou variável.
- Categoria.
- Fornecedor ou favorecido.
- Competência.
- Data de vencimento.
- Valor total.
- Número de parcelas.
- Indicador de recorrência.
- Observação.

O cadastro divide o valor em parcelas com arredondamento de centavos. O restante do arredondamento fica na última parcela, evitando perda de R$ 0,01.

O painel consulta automaticamente, para o mês selecionado:

- OS finalizadas.
- Receita bruta.
- Descontos.
- Receita líquida.
- Movimentos de entrada do caixa.
- Movimentos de saída do caixa.
- Gastos fixos cadastrados.
- Gastos variáveis cadastrados.
- Contas pendentes ou atrasadas.
- Resultado operacional preliminar.

O resultado operacional desta primeira tela é uma visão inicial:

```text
Receita líquida - gastos fixos - gastos variáveis
```

O CMV histórico de peças e pneus ainda não foi incorporado nesta etapa, pois precisa de uma decisão e de uma estrutura própria para preservar o custo histórico.

### Navegação e permissão

A aba Financeiro foi adicionada ao menu do gerente. O mecânico não recebe o link e a rota exibe acesso exclusivo para gerente.

Os tipos TypeScript das três tabelas novas foram adicionados a `src/integrations/supabase/types.ts`.

## Validações realizadas

- `git diff --check`: aprovado.
- `npm run build`: aprovado.
- Migração `financeiro_gastos`: aplicada e registrada no Supabase.
- Gasto variável de teste de R$ 0,01: cadastrado e exibido corretamente.
- Gasto fixo de teste de R$ 100,01: cadastrado e exibido corretamente.
- Parcelamento de R$ 100,01 em três parcelas: gravado como R$ 33,33, R$ 33,33 e R$ 33,35, totalizando exatamente R$ 100,01.
- Resultado operacional recalculado de R$ 3.673,20 para R$ 3.573,18 durante o teste.
- Nenhum deploy foi realizado.
- Nenhum dado real foi alterado; os dois gastos e quatro parcelas de teste foram removidos depois da conferência.

## Pendências da primeira versão

1. Implementar edição, cancelamento e exclusão lógica pela tela.
2. Implementar alertas de vencimento e contas atrasadas.
3. Definir o CMV histórico de peças e pneus.

## Próximas etapas depois da validação

A próxima evolução será implementar edição e cancelamento com histórico. Depois serão incluídos alertas de vencimento, custo histórico de peças e pneus, CMV, margem por OS, projeção e relatório PDF.

## Regra de publicação

A migração financeira já foi aplicada com autorização para permitir os testes. O deploy no Netlify continua bloqueado até a revisão do usuário. A versão publicada não foi alterada.

## Segunda etapa — pagamento integrado ao Caixa

Foi criada a migração `supabase/migrations/20260923160000_pagamento_despesas_caixa.sql`, aplicada ao Supabase como `pagamento_despesas_caixa`. A função protegida `pagar_despesa_parcela` exige gerente, exige um Caixa aberto e executa na mesma transação a criação da saída, a baixa da parcela, o registro da forma de pagamento e a atualização do status da despesa. Se não houver Caixa aberto ou ocorrer qualquer erro, a parcela não é baixada e nenhum movimento fica gravado.

A tela `/financeiro` agora mostra as parcelas individuais, vencimentos, forma de pagamento e status. Cada parcela pendente tem seletor de forma de pagamento e confirmação explícita antes de lançar a saída no Caixa. Parcelas pagas ficam somente para consulta, com data e forma registradas.

### Validação da segunda etapa

Foi criado pela interface um gasto temporário `TESTE - Pagamento R$ 0,01`, aberto um Caixa temporário com valor inicial de R$ 0,00 e paga a parcela usando Dinheiro. A tela mostrou saída de R$ 0,01, despesa como paga e parcela como paga. A conferência no banco confirmou `valor = 0,01`, `valor_pago = 0,01`, forma `Dinheiro`, movimento do tipo `saida` de R$ 0,01 e vínculo com a sessão de Caixa. Depois foram removidos exatamente 1 parcela, 1 movimento, 1 despesa e 1 sessão temporários.

O build voltou a passar após a sincronização dos tipos do Supabase. Nenhum deploy foi realizado e a versão publicada continua sem alterações.

## Terceira etapa — recorrência mensal idempotente

Foi criada e aplicada a migração `supabase/migrations/20260923161000_recorrencia_despesas.sql`, que adiciona `recorrencia_origem_id` para identificar a série original e a função protegida `gerar_despesas_recorrentes(competencia)`. Ao consultar um mês no Financeiro, a função gera todas as ocorrências mensais até aquele mês, copia as parcelas e desloca seus vencimentos, mantendo os centavos exatamente como na despesa original. A geração só considera séries ativas e exige gerente autenticado.

Durante a validação foi encontrado e corrigido um detalhe do PostgreSQL: o índice único parcial não era elegível para o `ON CONFLICT` usado pela função. A correção está em `supabase/migrations/20260923162000_corrige_indice_recorrencia.sql`, com índice único normal; como o PostgreSQL permite múltiplos valores nulos, despesas não recorrentes continuam sem conflito.

### Validação da terceira etapa

Foi cadastrada pela interface a despesa temporária `TESTE - Recorrência mensal`, no valor de R$ 12,34, com duas parcelas de R$ 6,17 e recorrência mensal. A consulta de novembro gerou exatamente as ocorrências de outubro e novembro, cada uma com duas parcelas de R$ 6,17. A segunda execução para novembro retornou zero novas ocorrências, comprovando a idempotência. A interface mostrou a ocorrência de novembro e os respectivos vencimentos.

Ao final, foram removidos 3 gastos temporários e 6 parcelas temporárias. O ambiente de preview e suas credenciais temporárias também foram removidos. O build permanece aprovado e o deploy continua bloqueado.

## Quarta etapa — edição, cancelamento e exclusão lógica

Foi criada e aplicada a migração `supabase/migrations/20260923163000_gestao_despesas_financeiras.sql`, com três funções protegidas por gerente: `editar_despesa_financeira`, `cancelar_despesa_financeira` e `excluir_despesa_financeira`. A edição mantém a quantidade de parcelas existente e recalcula os centavos; o cancelamento preserva a despesa e suas parcelas no histórico, marcando-as como canceladas; a exclusão é lógica, preenchendo `deleted_at`, retirando o gasto da visão ativa sem apagar o registro histórico.

Por segurança, despesas pagas ou com qualquer parcela paga não podem ser editadas, canceladas ou excluídas. Séries recorrentes que já geraram outros meses também não podem ser editadas para evitar divergência entre competências. Todas as ações possuem confirmação visual na tela.

### Validação da quarta etapa

Pela interface local foram realizados os seguintes testes com dados identificados como `TESTE`: um gasto de R$ 1,23 foi editado para R$ 2,34 e a alteração foi confirmada no banco; o mesmo gasto foi cancelado e permaneceu visível como cancelado, sem entrar nos totais ativos; outro gasto de R$ 0,01 foi excluído logicamente e desapareceu da visão ativa. Uma despesa paga temporária também foi criada diretamente para segurança e as tentativas de edição e exclusão retornaram os bloqueios esperados.

Ao final, foram removidos 3 gastos temporários e 3 parcelas temporárias. O build passou, o ambiente temporário foi removido, nenhum registro de teste permaneceu e nenhum deploy foi realizado.

## Quinta etapa — vencimentos, atrasos e alertas

Foi criada e aplicada a migração `supabase/migrations/20260923164000_alertas_financeiros.sql`, com a função protegida `atualizar_alertas_financeiros`. Ao abrir ou trocar o mês no Financeiro, a aplicação atualiza parcelas vencidas para `atrasado`, atualiza o status da despesa e cria notificações internas para o gerente sobre contas atrasadas e contas que vencem nos próximos três dias. A função usa `dedupe_key` por parcela e tipo de alerta, aproveitando a infraestrutura existente de notificações e o contador do menu.

A tela Financeiro agora apresenta os cards `Contas atrasadas` e `Vencem em até 3 dias`, além de listas resumidas dos próximos vencimentos e das contas vencidas. As notificações completas continuam disponíveis na central `/notificacoes-internas`.

### Validação da quinta etapa

Foram criadas duas despesas temporárias: uma de R$ 4,56 vencida em 20/09/2026 e outra de R$ 7,89 vencendo em 25/09/2026. Executando a função com a competência de teste 23/09/2026, a primeira passou para `atrasado` tanto na parcela quanto na despesa, e foram gerados os alertas `Conta em atraso` e `Conta próxima do vencimento`. A execução repetida manteve somente duas notificações, com duas chaves de deduplicação distintas, sem criar cópias.

Ao final, foram removidas 2 despesas, 2 parcelas e 2 notificações temporárias. O preview e suas credenciais temporárias foram removidos. O build passou e nenhum deploy foi realizado.


## Sexta etapa — CMV histórico de peças e pneus

Foi criada a migração `supabase/migrations/20260923170000_cmv_historico_pecas.sql` e aplicada no projeto Supabase. A tabela `atendimento_pecas_cmv` funciona como um livro-razão de custo. Cada consumo e cada estorno registra a OS, o serviço, a peça, a quantidade, o custo unitário capturado no evento, o custo total arredondado para centavos e o tipo do lançamento.

A função `baixar_pecas_atendimento` passou a capturar `pecas.preco_custo` no momento em que a peça é consumida na finalização da OS. O valor é arredondado para duas casas e não muda quando o cadastro atual da peça é alterado depois. A função `estornar_pecas_atendimento` devolve o estoque e cria um lançamento inverso no livro-razão usando o mesmo custo unitário do consumo original. O consumo original não é apagado do histórico; somente o movimento operacional de estoque é removido para permitir a reabertura segura da OS.

O mecanismo continua idempotente para a baixa de estoque. Uma mesma linha de serviço não recebe novo consumo enquanto existir o movimento operacional correspondente. Se a OS for reaberta e finalizada novamente, o estorno e o novo consumo ficam registrados como eventos separados. Dessa forma, o relatório não perde a trilha de auditoria e o CMV líquido pode ser calculado como consumo menos estorno.

A rota `/financeiro` passou a consultar os lançamentos mensais do livro-razão e exibir dois novos indicadores: `CMV de peças` e `Resultado após CMV`. O resultado após CMV é apresentado separadamente do resultado operacional preliminar para deixar clara a diferença entre despesas operacionais cadastradas e o custo direto dos itens consumidos. A consulta é restrita ao gerente, assim como a tabela por RLS.

### Validação da sexta etapa

A migração foi aplicada com sucesso. A consulta de integridade encontrou 7 lançamentos de consumo existentes, nenhuma divergência entre `custo_total` e `custo_unitario × quantidade` arredondado para R$ 0,01 e nenhum tipo inválido. O total líquido conferido no livro-razão foi de R$ 2.588,72, composto por 7 consumos e nenhum estorno no momento da verificação. O valor foi usado somente para conferência técnica; nenhum lançamento real foi alterado.

O `npm run build` foi executado após a atualização da rota Financeiro e dos tipos TypeScript e terminou com sucesso. Nenhum deploy foi realizado no Netlify.

### Decisão e pendência de modelagem

Nesta etapa foi adotado o custo cadastrado no momento do consumo, conforme a alternativa simples prevista no plano. O sistema já preserva o custo histórico com centavos e registra estornos, mas ainda não implementa custo médio ponderado por lotes ou PEPS/FIFO. Essa evolução somente será necessária se a oficina passar a controlar entradas de estoque com custos diferentes e exigir uma metodologia contábil mais detalhada.

Também permanece pendente a inclusão de custo direto de mão de obra na margem por OS. Atualmente `Resultado após CMV` desconta o CMV de peças do resultado operacional calculado a partir da receita líquida e das despesas financeiras cadastradas.

## Estado atual de publicação

A branch local continua sendo `feat/catalogo-pecas-referencias`, baseada em `feat/orcamentos-temporarios`. O Supabase recebeu a migração para viabilizar a validação funcional. O Netlify não recebeu deploy e continua aguardando autorização explícita.


## Sétima etapa — custo histórico de mão de obra

Foi criada e aplicada a migração `supabase/migrations/20260923171000_custo_mao_obra_financeiro.sql`. O gerente agora pode configurar um percentual de custo direto da mão de obra entre 0% e 100%. Esse percentual é aplicado sobre o valor de mão de obra cobrado em cada serviço e não sobre o preço de peças.

Na finalização da OS, o percentual vigente é capturado junto com a base de mão de obra, o mecânico responsável e o custo calculado. O registro fica congelado no livro-razão `atendimento_mao_obra_custos`. Alterar o percentual no futuro não modifica OS antigas.

Quando uma OS finalizada é reaberta, o sistema cria lançamentos de estorno do custo histórico da mão de obra. A operação acontece junto do estorno das peças no mesmo gatilho transacional de mudança de status. O DRE mensal calcula o custo líquido como consumo menos estorno.

A tela `/financeiro` recebeu o campo `Percentual de custo da mão de obra` e o botão de salvamento exclusivo para gerente. O DRE passou a mostrar `Custo de mão de obra` e `Resultado após custos diretos`, que desconta o CMV de peças e o custo de mão de obra do resultado operacional.

A configuração inicial foi criada com **0,00%**. Isso foi intencional para que nenhuma OS existente ou futura seja alterada por uma suposição de custo antes de o gerente informar o percentual real da oficina.

### Validação da sétima etapa

O Supabase confirmou a existência da configuração inicial, com percentual de 0,00%, zero lançamentos indevidos e zero divergências entre a base, o percentual e o custo total arredondado para centavos. O `npm run build` terminou com sucesso após a inclusão da nova tela, dos tipos TypeScript e da migração.

A etapa foi implementada sem criar dados reais de teste e sem alterar OS existentes. Nenhum deploy foi realizado.


## Revisão técnica posterior — ciclo de reabertura e refinalização

Durante uma revisão completa foi identificado e corrigido um caso de consistência: depois de reabrir uma OS e finalizá-la novamente, o sistema poderia encontrar o consumo antigo de mão de obra e deixar de registrar o novo consumo. A mesma função também poderia gerar estorno duplicado se fosse chamada repetidamente.

Foi criada e aplicada a migração `supabase/migrations/20260923172000_corrige_ciclo_mao_obra.sql`. A regra agora considera o último evento de cada serviço. Um consumo só é considerado ativo quando não existe estorno posterior. Assim, o ciclo consumo, estorno e novo consumo pode ser repetido sem perder custo e sem duplicar lançamentos.

A revisão também confirmou `npm run build` e `git diff --check`. O lint foi executado separadamente para verificar problemas estáticos adicionais. Nenhum deploy foi realizado.


## Oitava etapa — lotes e custo médio ponderado de estoque

Foi criada e aplicada a migração `supabase/migrations/20260924110000_lotes_custo_medio_estoque.sql`. A tabela `peca_lotes` preserva quantidade inicial, saldo, custo unitário, origem e data de cada lote. Os saldos atuais foram convertidos em lotes iniciais sem alterar a quantidade disponível.

A entrada rápida de estoque agora exige quantidade e custo unitário. O sistema cria um lote e recalcula `pecas.preco_custo` pelo custo médio ponderado. O custo médio é arredondado para duas casas e permanece separado do preço de venda.

A baixa de uma OS consome os lotes mais antigos disponíveis. O estorno devolve a quantidade em um novo lote com o custo histórico do consumo. A migração `supabase/migrations/20260924111000_integrar_lotes_baixa_os.sql` conectou esse controle às funções transacionais de consumo e reabertura.

A conferência no banco encontrou uma tabela de lotes, quatro funções esperadas, zero saldos negativos, zero custos negativos e nenhuma divergência entre a soma dos saldos dos lotes e o estoque atual das peças.

## Nona etapa — desconto Pix na finalização da OS

A função `finalizar_atendimento_transacional` foi substituída pela migração `supabase/migrations/20260924100000_desconto_pix_finalizacao_os.sql`. A finalização agora usa a mesma regra do orçamento: aplica 25% somente sobre peças cujo cadastro permite desconto Pix e somente quando todos os pagamentos são Pix. Pneus e itens não elegíveis ficam fora do desconto. Mão de obra nunca recebe esse desconto.

O cálculo é autoritativo no banco. O valor recebido, o desconto salvo na OS, os pagamentos e as entradas no Caixa usam o mesmo total final. O parâmetro de desconto enviado pelo frontend foi mantido apenas para compatibilidade com chamadas antigas e não consegue mais gerar desconto manual indevido.

A tela de finalização deixou de aceitar desconto livre. Ela mostra o desconto Pix automático, recalcula o pagamento único quando a forma muda para Pix e usa o total efetivamente retornado pelo banco no recibo.

O build e a checagem de whitespace passaram após as duas implementações. Nenhum deploy foi realizado.
