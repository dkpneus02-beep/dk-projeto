# Plano de construção do Cérebro Financeiro e da DRE

## 1. Conclusão inicial

A proposta enviada é viável, mas não deve ser implementada apenas com as tabelas `despesas` e `configuracoes_financeiras`. Essas duas tabelas podem iniciar o cadastro de contas a pagar e os parâmetros de segurança, porém não são suficientes para garantir a rastreabilidade financeira completa solicitada.

Para saber **tudo o que entrou, tudo o que saiu, em qual data, por qual motivo, relacionado a qual OS, fornecedor, compra, peça, boleto ou categoria, com precisão de centavos**, o sistema precisa separar claramente cinco conceitos:

1. **Faturamento ou receita gerada.** O que foi vendido ou reconhecido pela oficina.
2. **Recebimento de dinheiro.** O que efetivamente entrou no caixa ou em outra conta.
3. **Custo do estoque vendido.** O custo da peça ou pneu que foi consumido em uma venda.
4. **Despesa operacional.** O gasto da oficina que não é necessariamente uma peça consumida em uma OS.
5. **Compromisso futuro.** Uma conta registrada, mas ainda não paga.

Se esses conceitos forem misturados em um único valor mensal, o relatório poderá parecer correto e ainda assim mostrar lucro, caixa ou saldo futuro incorretos. O plano abaixo foi elaborado para impedir essa mistura.

## 2. Objetivo da nova aba

Criar uma nova aba de **Gestão Financeira** que funcione como o centro de análise da oficina. Ela deverá mostrar a situação atual, explicar o resultado de cada mês, registrar contas futuras, controlar pagamentos, acompanhar custos de peças e serviços, projetar compromissos e permitir simulações de gastos ou descontos.

O módulo deverá responder, com filtros por período:

- Quanto a oficina faturou?
- Quanto realmente recebeu?
- Quanto entrou no caixa por forma de pagamento?
- Quanto saiu do caixa?
- Quais despesas foram pagas?
- Quais despesas ainda estão pendentes?
- Quanto custaram as peças e os pneus vendidos?
- Quanto cada serviço, peça, pneu, OS e categoria deixou de margem?
- Qual foi o lucro bruto?
- Qual foi o lucro operacional?
- Qual valor está comprometido para os próximos 7, 30 e 60 dias?
- Qual é o teto seguro de gasto hoje?
- Qual será o saldo projetado no final do mês?
- Qual valor tem origem em uma OS, boleto, compra, lançamento manual ou ajuste?

## 3. Diferença entre caixa, competência e DRE

### 3.1 Regime de caixa

O regime de caixa considera a data em que o dinheiro efetivamente entrou ou saiu. Ele responde à pergunta: **quanto dinheiro a oficina tem ou terá disponível?**

Exemplos:

- Uma OS finalizada e paga em 23/09 entra no caixa em 23/09.
- Um boleto lançado para vencer em 30/09 não reduz o caixa enquanto não for pago.
- Quando o boleto for pago, o caixa registra a saída na data do pagamento.

### 3.2 Regime de competência

O regime de competência considera quando a receita ou a despesa foi gerada, independentemente de quando foi paga. Ele responde à pergunta: **qual foi o resultado econômico do mês?**

Exemplos:

- Uma despesa de energia referente a setembro pode pertencer à competência de setembro mesmo se for paga em outubro.
- O custo de uma peça deve aparecer no resultado quando a peça for vendida ou consumida na OS, não simplesmente quando foi comprada para estoque.
- Uma OS finalizada pode gerar receita de setembro mesmo que o recebimento seja controlado separadamente.

### 3.3 DRE operacional

A DRE deverá usar competência para medir resultado e deverá exibir o caixa em um bloco separado. A fórmula principal será:

```text
Receita bruta
- descontos concedidos
= receita líquida
- custo das peças e pneus vendidos ou consumidos (CMV)
= lucro bruto
- despesas operacionais por competência
= resultado operacional
```

O módulo deverá permitir visualizar também:

```text
Saldo inicial de caixa
+ recebimentos realizados
- pagamentos realizados
= saldo de caixa no período
```

O saldo de caixa não deve ser chamado de lucro. Lucro e disponibilidade financeira são indicadores diferentes.

## 4. Precisão de valores e arredondamento

Todos os valores financeiros deverão ser armazenados no PostgreSQL como `numeric(14,2)` ou precisão superior compatível, nunca como `real` ou `double precision`.

No frontend, valores monetários deverão ser tratados como centavos ou como números decimais controlados. O sistema não deve depender de somas sucessivas de números binários sem arredondamento.

As regras obrigatórias são:

- Valor monetário mínimo: R$ 0,01.
- Quantidades de peças e pneus podem usar duas casas decimais quando necessário.
- Valores unitários e totais devem ser arredondados para duas casas na persistência.
- O total deve ser calculado a partir das linhas, e não digitado livremente sem conferência.
- O relatório deve mostrar a soma detalhada e a diferença de arredondamento, quando existir.
- Qualquer diferença entre o total das linhas e o total do documento deve ser explícita.
- Nunca arredondar somente na tela e deixar outro valor no banco.
- O sistema deve impedir valor negativo, salvo quando o registro representar estorno, devolução ou ajuste formal.
- Estornos não apagam o lançamento original. Eles criam um lançamento inverso relacionado ao original.

Antes de implementar, será necessário confirmar se a oficina aceita centavos em quantidade de peças, por exemplo 0,50 litro de óleo, e se o custo deve ser calculado por quantidade com duas casas.

## 5. Fontes atuais que devem ser aproveitadas

A implementação deve usar as estruturas existentes em vez de duplicar informações:

- `atendimentos`: OS, data de entrada, finalização, desconto, total e cliente.
- `atendimento_servicos`: serviços, peça vinculada, quantidade, preço da peça, mão de obra e valor total.
- `pagamentos`: recebimentos relacionados a uma OS, forma e parcelas.
- `pecas`: estoque atual, preço de custo, preço de venda, tipo e dados de pneus.
- `atendimento_pecas_movimentos`: movimentos de consumo e estorno de peças associados à OS.
- `caixa_sessoes`: abertura, valor inicial, responsável e fechamento do caixa.
- `caixa_movimentos`: entradas, saídas, estornos e vínculo opcional com atendimento.
- `orcamentos` e `orcamento_itens`: propostas ainda não convertidas em receita ou consumo de estoque.
- `audit_eventos`: histórico de alterações já existente e importante para auditoria.

A finalização de uma OS atualmente arredonda desconto, total e pagamentos para duas casas, grava pagamentos e lança entradas no caixa aberto. A nova DRE deverá consultar esses dados sem recriar entradas ou duplicar pagamentos.

## 6. Problemas que precisam ser resolvidos antes da DRE final

### 6.1 Custo histórico da peça

Hoje `pecas.preco_custo` representa o custo atual cadastrado. Esse campo sozinho não garante o custo histórico de uma venda antiga. Se o fornecedor alterar o custo amanhã, um relatório do mês passado não pode mudar silenciosamente.

O plano deverá criar um registro de custo no momento da entrada de estoque ou no momento do consumo. A solução recomendada é manter um histórico de lotes ou de movimentos de estoque com custo unitário.

Para o CMV, o projeto precisará definir um método:

- **Custo médio ponderado:** recalcula o custo médio após cada entrada.
- **PEPS/FIFO:** baixa primeiro os lotes mais antigos.
- **Custo cadastrado no momento da venda:** mais simples, porém menos preciso para compras com custos diferentes.

A recomendação de longo prazo continua sendo o **custo médio ponderado**, por ser simples de operar em uma oficina e suficiente para uma DRE operacional. Para esta etapa, foi adotada a alternativa intermediária de capturar `preco_custo` no momento do consumo e registrar cada consumo e estorno em livro-razão. Isso preserva a exatidão histórica sem exigir ainda o controle de lotes. A migração para custo médio ponderado poderá ser feita quando o cadastro de entradas de estoque passar a controlar custos diferentes por lote.

### 6.2 Compra de peças e entrada de estoque

Uma saída de caixa para fornecedor de peças não é automaticamente CMV. Ela pode representar compra para estoque. O CMV só ocorre quando o item é vendido ou consumido.

Por isso, o cadastro de despesa deverá diferenciar:

- Compra de estoque.
- Despesa operacional.
- Pagamento de fornecedor referente a compra anterior.
- Entrada de estoque sem pagamento imediato.
- Devolução ao fornecedor.
- Frete ou custo adicional de aquisição.

### 6.3 Serviços e custo de mão de obra

O documento pede custo direto configurável para mão de obra. Será necessário definir se o custo será:

- Um percentual do faturamento do serviço.
- Um valor fixo por tipo de serviço.
- Um custo por hora do mecânico.
- Um custo por serviço e por mecânico.
- Um custo mensal da folha distribuído entre serviços.

O sistema não deve chamar receita menos comissão de lucro líquido se folha, encargos, aluguel, impostos e outras despesas ainda não tiverem sido considerados.

### 6.4 Data de competência

Cada despesa precisa ter pelo menos duas datas:

- Data de competência.
- Data de vencimento.

Quando paga, também terá:

- Data de pagamento.
- Data de lançamento no caixa.

A OS também deve permitir distinguir:

- Data de abertura.
- Data de finalização.
- Data do recebimento.

O usuário deverá definir qual data alimenta cada relatório. O plano recomenda usar a data de finalização para competência da receita operacional e a data de pagamento para o caixa.

### 6.5 Parcelamento

Uma despesa parcelada não deve ser gravada apenas como um valor total com uma data. Cada parcela precisa ser rastreável individualmente, com valor, vencimento, status, pagamento, juros, multa e comprovante próprios.

O documento principal poderá ter um registro de origem e as parcelas ficarão em uma tabela filha. Isso permite responder exatamente quanto vence em cada mês.

## 7. Modelo de dados recomendado

A proposta original de duas tabelas deve ser ampliada gradualmente. A estrutura recomendada é a seguinte.

### 7.1 `financeiro_contas`

Representa uma conta, caixa ou carteira onde o dinheiro existe.

Campos previstos:

- `id`.
- `nome`, por exemplo Caixa físico, Banco, Pix ou Cartão.
- `tipo`.
- `ativo`.
- `saldo_inicial`.
- `created_at` e `updated_at`.

A tabela atual `caixa_sessoes` continuará representando o caixa diário físico. A nova estrutura não deve substituir o caixa sem uma migração cuidadosa.

### 7.2 `financeiro_categorias`

Centraliza categorias de receitas, custos e despesas.

Exemplos:

- Receita de mão de obra.
- Receita de peças.
- Receita de pneus.
- CMV de peças.
- CMV de pneus.
- Água.
- Energia.
- Internet.
- Aluguel.
- Impostos.
- Ferramentas.
- Salários.
- Adiantamentos.
- Comissões.
- Frete.
- Taxas bancárias.
- Ajustes.

Cada categoria deve indicar se entra na DRE, no caixa, na projeção ou em mais de um relatório.

### 7.3 `despesas`

Representa o documento financeiro principal, como boleto, conta, compra, folha ou despesa manual.

Campos recomendados:

- `id`.
- `descricao`.
- `categoria_id`.
- `fornecedor` ou `favorecido`.
- `documento`.
- `competencia_inicio` e `competencia_fim`, quando necessário.
- `valor_total`.
- `data_emissao`.
- `data_vencimento`.
- `status`.
- `recorrente`.
- `origem`, como manual, compra_estoque, folha ou importacao.
- `observacoes`.
- `created_by`.
- `created_at` e `updated_at`.
- `deleted_at` para exclusão lógica.

O campo `data_pagamento` não deverá ser o único controle quando houver pagamento parcial ou parcelado.

### 7.4 `despesa_parcelas`

Representa cada parcela de uma despesa.

Campos recomendados:

- `id`.
- `despesa_id`.
- `numero`.
- `valor_original`.
- `juros`.
- `multa`.
- `desconto`.
- `valor_final`.
- `data_vencimento`.
- `data_pagamento`.
- `status`.
- `conta_id`.
- `caixa_movimento_id`.
- `comprovante_id`.
- `created_at` e `updated_at`.

A soma das parcelas deve ser igual ao valor total do documento, salvo diferença de arredondamento explicitamente registrada.

### 7.5 `financeiro_lancamentos`

Representa o lançamento financeiro efetivo ou de competência. Essa tabela é o principal livro auxiliar da DRE e do fluxo de caixa.

Campos recomendados:

- `id`.
- `tipo`, como receita, recebimento, custo, despesa, pagamento, estorno ou ajuste.
- `categoria_id`.
- `valor`.
- `data_competencia`.
- `data_movimento`.
- `conta_id`.
- `atendimento_id`, quando houver.
- `despesa_id`, quando houver.
- `despesa_parcela_id`, quando houver.
- `peca_id`, quando houver.
- `atendimento_servico_id`, quando houver.
- `origem`.
- `origem_id`.
- `estornado_por` ou `estorno_de`.
- `observacoes`.
- `created_at`.

Cada lançamento deve ter uma origem identificável. Lançamentos manuais devem exigir responsável, justificativa e data.

### 7.6 `financeiro_anexos`

Representa boleto, nota fiscal, comprovante de pagamento e documento relacionado.

Campos recomendados:

- `id`.
- `despesa_id` ou `despesa_parcela_id`.
- `storage_path`.
- `nome_original`.
- `tipo_mime`.
- `tamanho`.
- `uploaded_by`.
- `created_at`.

O arquivo deve ficar em bucket privado. O banco deve guardar o caminho e os metadados, não uma URL pública permanente.

### 7.7 `estoque_lotes` ou histórico de custo

Para calcular CMV histórico, será necessário registrar custo por entrada ou por alteração de custo.

Campos possíveis:

- `id`.
- `peca_id`.
- `quantidade_inicial`.
- `quantidade_disponivel`.
- `custo_unitario`.
- `data_entrada`.
- `origem_despesa_id` ou fornecedor.
- `created_at`.

A baixa de estoque deverá informar a quantidade e o custo efetivamente usado. A reabertura ou estorno deverá devolver a quantidade e reverter o CMV correspondente.

### 7.8 `configuracoes_financeiras`

Deve armazenar parâmetros, mas não substituir o histórico de lançamentos.

Campos recomendados:

- `id`.
- `margem_seguranca_percentual`.
- `limite_alerta_gastos`.
- `dias_alerta_vencimento`.
- `dias_projecao`.
- `custo_mao_obra_padrao` ou uma referência a uma tabela de custos.
- `metodo_cmv`.
- `updated_by`.
- `updated_at`.

O sistema deverá registrar a data de vigência de configurações que alterem cálculos históricos, para que uma alteração futura não reescreva o passado.

## 8. Relação com o banco existente

A nova aba não deve duplicar os pagamentos das OS. Ao finalizar uma OS, a função atual grava `pagamentos` e movimentos de entrada no caixa aberto. O novo financeiro deverá reconciliar esses registros e mostrar a origem, não lançar uma segunda entrada.

Para receitas de OS, o sistema deverá criar ou materializar lançamentos a partir de `atendimentos`, `atendimento_servicos` e `pagamentos`. A estratégia deverá ser definida:

- Consulta em tempo real, sem tabela auxiliar.
- Tabela de lançamentos gerada por eventos.
- Processo de reconciliação que identifica diferenças.

A recomendação é usar uma tabela de lançamentos com origem idempotente, porque ela permite auditoria, estorno e relatórios históricos sem alterar lançamentos antigos.

A baixa de estoque já possui movimentos de consumo e estorno. O financeiro deverá aproveitar esses movimentos para calcular CMV, mas será necessário enriquecer o movimento com custo unitário histórico se o custo atual de `pecas` não for suficiente.

## 9. Fluxos funcionais da nova aba

### 9.1 Painel financeiro

O painel deverá permitir selecionar mês, intervalo personalizado e visão de caixa ou competência. Os principais cards serão:

- Receita bruta.
- Descontos.
- Receita líquida.
- CMV.
- Lucro bruto.
- Despesas operacionais.
- Resultado operacional.
- Entradas no caixa.
- Saídas no caixa.
- Saldo atual.
- Compromissos futuros.
- Teto seguro de gasto.

Cada card deverá permitir abrir o detalhamento que explica a composição do valor.

### 9.2 Contas a pagar

A tela deverá permitir cadastrar uma despesa, anexar boleto, definir competência, vencimento, categoria, fornecedor e parcelamento.

Ao marcar uma parcela como paga, o sistema deverá:

1. Exigir a conta ou caixa de saída.
2. Registrar data e responsável.
3. Registrar juros, multa ou desconto, se houver.
4. Criar o movimento de saída no caixa ou conta correta.
5. Criar o lançamento de competência correspondente, se ainda não existir.
6. Impedir pagamento duplicado.
7. Preservar o documento e o histórico da alteração.

### 9.3 Contas recorrentes

Contas recorrentes devem gerar compromissos futuros, mas não pagamentos automáticos. O sistema deverá permitir revisar, alterar ou cancelar uma ocorrência antes do vencimento.

### 9.4 Alertas

O painel deverá alertar:

- Vencimento em até 7 dias.
- Vencimento hoje.
- Conta atrasada.
- Parcela paga parcialmente.
- Despesa sem categoria.
- Compra de estoque sem custo associado.
- Diferença entre caixa e pagamentos registrados.
- Compromissos acima do limite configurado.

Os alertas destinados ao gerente deverão usar a estrutura de notificações já existente quando for compatível.

### 9.5 Projeção

A projeção deverá separar:

- Saldo disponível atual.
- Entradas previstas com grau de certeza.
- Parcelas de despesas futuras.
- Despesas recorrentes esperadas.
- Compras planejadas.
- Cenário pessimista, provável e otimista.

A fórmula inicial do teto seguro poderá ser:

```text
saldo disponível
+ recebimentos previstos com nível de confiança
- compromissos vencendo no período
- reserva mínima de segurança
= teto de gasto recomendado
```

O valor não deve ser apresentado como autorização automática de gasto. Ele é um indicador baseado nos dados cadastrados.

### 9.6 Simulador de desconto

O simulador deverá receber uma proposta de desconto e mostrar:

- Receita antes e depois.
- Custo das peças e pneus.
- Custo estimado da mão de obra.
- Margem antes e depois.
- Resultado operacional estimado.
- Impacto no caixa, se a venda for recebida agora.
- Mensagem clara caso fique abaixo da margem de segurança.

O simulador não deve alterar OS, orçamento ou estoque. Ele deve ser uma simulação isolada.

### 9.7 Relatório mensal em PDF

O relatório deverá conter:

- Período selecionado.
- Data de geração.
- DRE por competência.
- Fluxo de caixa por movimento.
- Receita por categoria.
- CMV por categoria e item.
- Despesas pagas, pendentes e atrasadas.
- Compromissos do mês seguinte.
- Margens e indicadores.
- Diferenças de conciliação.
- Espaços para assinatura do gerente e do proprietário.

O PDF deve informar se os dados foram calculados por competência, por caixa ou por ambos.

## 10. Permissões e auditoria

A nova aba deve ser restrita ao gerente inicialmente. O mecânico não deve ver folha, salários, impostos, fornecedores ou margens financeiras sem uma decisão específica.

Ações que exigem auditoria:

- Criar, editar ou cancelar despesa.
- Alterar categoria.
- Alterar valor ou vencimento.
- Marcar parcela como paga.
- Estornar pagamento.
- Alterar configuração de margem.
- Alterar custo de peça.
- Reprocessar lançamento.
- Fechar período.

O sistema deve registrar usuário, data, valor anterior, valor novo e motivo. O histórico não deve ser apagado por exclusão física.

## 11. Plano de implementação por fases

### Fase 0 — Definições de negócio

Antes do código, confirmar o significado de receita, competência, pagamento, CMV, despesa e lucro. Definir método de CMV, custo de mão de obra, datas oficiais, categorias e contas financeiras.

**Saída:** documento de decisões aprovado.

### Fase 1 — Diagnóstico e conciliação do histórico

Mapear os dados existentes e identificar inconsistências entre `atendimentos.total`, `pagamentos`, `caixa_movimentos`, estoque e movimentos de peças. Não alterar os dados; gerar uma lista de diferenças.

**Saída:** relatório de conciliação inicial.

### Fase 2 — Fundação financeira

Criar categorias, contas financeiras, lançamentos idempotentes, anexos, permissões e auditoria. Implementar valores com precisão de centavos.

**Saída:** base financeira sem painel avançado.

### Fase 3 — Contas a pagar

Criar despesas, parcelas, recorrência, anexos, pagamento parcial, juros, multas, cancelamento e saída automática no caixa.

**Saída:** contas a pagar funcionando com histórico.

### Fase 4 — CMV e histórico de custos

Implementar lotes ou custo médio, associar entradas de estoque ao custo, calcular consumo em OS e tratar estorno/reabertura.

**Saída:** custo histórico confiável por peça e pneu.

### Fase 5 — Receita, margem e reconciliação de OS

Integrar atendimentos finalizados, serviços, peças, pagamentos e caixa. Garantir que cada receita seja lançada uma única vez e que a margem possa ser explicada por OS.

**Saída:** receita e margem reconciliadas.

### Fase 6 — Painel mensal e projeções

Criar filtros por mês e período, DRE, fluxo de caixa, compromissos futuros, alertas e teto seguro de gastos.

**Saída:** painel executivo utilizável.

### Fase 7 — Simuladores e PDF

Criar simulador de descontos, simulador de gastos e relatório PDF com assinatura e detalhamento.

**Saída:** módulo de decisão e relatório executivo.

### Fase 8 — Testes com dados marcados

Criar dados temporários com prefixo `TESTE -`, testar centavos, parcelamento, atraso, pagamento parcial, estorno, compra de estoque, consumo, reabertura, desconto, PDF e conciliação. Remover os dados ao final e confirmar que não restaram registros.

**Saída:** relatório de validação.

### Fase 9 — Revisão e publicação

Revisar diff, migrações, permissões, cálculos, logs, PDF e comportamento visual. Fazer commit somente após aprovação. Publicar no Netlify apenas com autorização explícita.

**Saída:** versão pronta para deploy.

## 12. Casos de teste obrigatórios

Os seguintes casos devem ser testados:

| Caso | Resultado esperado |
|---|---|
| Receita de R$ 0,01 | Valor preservado na OS, pagamento, caixa e relatório |
| Despesa de R$ 0,01 | Valor preservado na parcela, pagamento e caixa |
| Três parcelas com arredondamento | Soma das parcelas igual ao documento, com diferença explícita se necessário |
| Pagamento parcial | Saldo restante correto e status parcialmente pago |
| Pagamento duplicado | Sistema bloqueia ou sinaliza duplicidade |
| Boleto atrasado | Aparece como atrasado sem mudar o valor original indevidamente |
| Juros e multa | Custos adicionais separados do valor original |
| Estorno | Cria movimento inverso e preserva o original |
| Compra de estoque | Não vira CMV antes da venda ou consumo |
| Consumo de peça em OS | CMV calculado com custo histórico |
| Reabertura de OS | Consumo e CMV estornados corretamente |
| Desconto Pix | Respeita as regras atuais e altera receita líquida corretamente |
| Serviço sem peça | Usa custo de mão de obra configurado |
| OS cancelada | Não entra como receita finalizada |
| Orçamento não convertido | Não entra como receita nem consumo |
| OS convertida de orçamento | Não duplica receita ou estoque |
| Caixa fechado | Não aceita lançamento indevido |
| Alteração de despesa | Mantém auditoria do valor anterior |
| Exclusão lógica | Não apaga o histórico da DRE |
| Filtro mensal | Não mistura competência com data de pagamento |
| PDF | Soma os mesmos valores da tela, até R$ 0,01 |

## 13. Perguntas que precisam ser respondidas antes da implementação

Estas decisões mudam o resultado da DRE e não devem ser inventadas:

1. A DRE oficial será por competência, por caixa ou terá as duas visões lado a lado?
2. Qual método será usado para CMV: custo médio, PEPS ou outro?
3. O preço de custo atual das peças é confiável para o histórico ou será necessário cadastrar custos por lote a partir de agora?
4. Compras de estoque serão cadastradas como entrada de estoque, como despesa ou nos dois módulos com relacionamento entre eles?
5. O custo de mão de obra será fixo por serviço, por hora do mecânico, por percentual ou por rateio mensal?
6. Folha, adiantamentos e comissões serão lançados manualmente ou haverá cadastro de colaboradores e cálculo automático?
7. Cartão e Pix devem considerar taxas e prazo de recebimento diferentes?
8. Uma venda parcelada gera receita integral na competência ou receita conforme cada recebimento?
9. O caixa físico, banco, Pix e cartão serão tratados como contas separadas?
10. O fechamento mensal será apenas informativo ou bloqueará alterações no período?
11. O proprietário terá acesso ao módulo ou somente o gerente?
12. Quais categorias são obrigatórias para a DRE da oficina?
13. O boleto pode ser alterado depois de pago? Se sim, o que exige estorno?
14. Como devem ser tratados impostos e despesas pessoais do proprietário?
15. Qual reserva mínima deve ser protegida pelo teto seguro de gastos?
16. O relatório em PDF deve exibir dados de clientes e placas ou somente totais financeiros?

## 14. Riscos principais

O maior risco é apresentar um lucro que seja apenas uma soma de vendas menos despesas pagas, ignorando CMV e competência. Outro risco é usar o `preco_custo` atual para calcular vendas antigas, fazendo relatórios históricos mudarem com o tempo.

Também existe risco de duplicar entradas no caixa, porque a finalização da OS já grava pagamentos e movimentos. O novo módulo deve reconciliar e não duplicar.

Uma alteração direta em estoque ou custo pode afetar os atendimentos existentes. Toda mudança precisa preservar auditoria, usar migração e testar reabertura e estorno.

Por fim, uma conta futura não deve ser tratada como caixa disponível e um orçamento não deve ser tratado como receita. Esses conceitos precisam aparecer visualmente separados.

## 15. Critérios de aceite da primeira versão financeira

A primeira versão será aceita somente quando:

- Cada entrada e saída tiver origem, data, categoria, responsável e valor.
- O sistema distinguir competência de pagamento.
- Contas a pagar puderem ser parceladas e pagas sem duplicidade.
- O pagamento de uma parcela gerar saída rastreável no caixa.
- O CMV não depender apenas do custo atual da peça.
- A receita de uma OS não for duplicada no financeiro.
- O saldo do caixa conferir com os movimentos existentes.
- Relatórios fecharem com diferença máxima de R$ 0,01 por arredondamento documentado.
- DRE, caixa e projeção forem apresentados como visões diferentes.
- O gerente conseguir abrir o detalhe de qualquer total.
- Estornos preservarem o histórico original.
- Dados temporários de teste puderem ser removidos sem deixar resíduos.
- Build, formatação, migração, permissões e testes funcionais forem aprovados.
- Nenhum deploy ocorrer sem autorização explícita.

## 16. Próximo passo recomendado

O próximo passo não é criar a tela. É responder às perguntas da seção 13 e executar a Fase 1 de diagnóstico. Primeiro devemos descobrir como os registros atuais se conciliam e qual informação histórica está disponível. Depois será possível decidir o modelo de CMV e o regime oficial da DRE sem risco de construir cálculos incompatíveis.

## Referências

[1]: https://github.com/dkpneus02-beep/dk-projeto/tree/feat/orcamentos-temporarios "Branch correta do projeto no GitHub"
[2]: https://dkautocenterr.netlify.app/ "Versão pública atual do sistema no Netlify"
[3]: https://supabase.com/docs/guides/database/postgres/numeric "Documentação do tipo numeric no PostgreSQL"
