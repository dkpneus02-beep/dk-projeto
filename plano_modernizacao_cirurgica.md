# Plano de Modernização Cirúrgica — DK Auto Center

## Objetivo

Corrigir os riscos identificados um por um, testar localmente após cada etapa, evitar deploys intermediários e publicar somente depois de uma última auditoria completa. O plano também inclui a reconstrução da Dashboard para trabalhar por período mensal e apresentar gráficos úteis para a gestão.

## Regra de execução

Nenhuma fase deve alterar produção antes de passar por quatro verificações: revisão do diff, build local, teste funcional local e teste de regressão dos módulos já aprovados. As migrations do Supabase serão aplicadas primeiro em ambiente de teste quando possível. O deploy final será único, depois de todas as fases aprovadas.

## Fase 1 — Segurança do banco e OS apagada

A primeira etapa será remover policies antigas permissivas, principalmente a policy de acesso total da tabela `mecanicos` e a policy `atendimentos_update` com `USING true`. Em seguida, a regra de visibilidade será reforçada para que `deleted_at IS NOT NULL` impeça acesso normal à OS, aos serviços, aos pagamentos e às notificações relacionadas.

**Critérios de aprovação:** gerente pode cadastrar/editar mecânico; mecânico não consegue escrever na tabela de mecânicos; mecânico só altera a própria OS/serviço permitido; OS apagada não aparece por listagem nem por URL direta; gerente continua vendo somente o que deve ver.

## Fase 2 — Finalização financeira transacional

Será criada uma RPC transacional para finalizar a OS. A operação deverá validar o gerente, calcular o total, baixar peças uma única vez, gravar pagamentos, lançar caixa, criar retorno opcional, registrar garantia e atualizar o status. Se qualquer etapa falhar, tudo deverá ser revertido.

**Critérios de aprovação:** estoque, OS, pagamentos, caixa, garantia e retorno ficam consistentes; uma falha simulada não deixa estado parcial; repetir a operação não duplica pagamento nem baixa de estoque.

## Fase 3 — Estoque, exclusão e histórico

Serão revisados os estornos ao excluir serviço, reabrir OS, excluir OS e alterar quantidade de peça. O serviço ligado a mecânico excluído será classificado sem apagar histórico indevidamente. Também será definida a regra de retenção: exclusão lógica por 30 dias e arquivamento separado para dados antigos, sem apagar OS ativas.

**Critérios de aprovação:** excluir serviço devolve a quantidade exata uma vez; reabrir OS devolve a quantidade exata; excluir OS não duplica devolução; OS ativas nunca entram na rotina de limpeza.

## Fase 4 — Notificações, backup e câmera

O alerta automático de fechamento será separado das notificações internas. Se continuar, deverá ser limitado por OS e por dia, sem repetição infinita. O backup deverá incluir manifesto de dados, referências de arquivos e instruções de restauração. A câmera de código de barras será corrigida com mensagens específicas de permissão, fallback por foto/galeria e carregamento sob demanda, sem alterar a câmera da vistoria.

**Critérios de aprovação:** uma mesma pendência não dispara infinitamente; mensagens internas continuam em realtime; backup pode ser restaurado em projeto separado; câmera mostra erro específico e tem alternativa quando a leitura ao vivo falhar.

## Fase 5 — Nova Dashboard mensal

A Dashboard deixará de mostrar apenas “hoje” e passará a usar um período explícito. O padrão será o mês atual, por exemplo, do primeiro ao último dia do mês. Ao mudar o mês, os indicadores serão recalculados para aquele mês; quando iniciar um novo mês, a tela abrirá automaticamente no novo período, sem apagar o histórico anterior.

A estrutura visual será inspirada na referência fornecida, sem copiar identidade de terceiros. O topo terá filtros de início, fim, mês atual, hoje e busca. Os indicadores planejados são:

| Indicador | Regra |
|---|---|
| Faturamento bruto | Soma dos valores finalizados no período. |
| Receita líquida | Faturamento menos descontos e taxas cadastradas, quando existirem. |
| Custo de peças/pneus | Soma do custo registrado para itens consumidos. |
| Lucro bruto | Receita líquida menos custo dos itens. |
| OS finalizadas | Quantidade de OS finalizadas no período. |
| Ticket médio | Receita dividida pela quantidade de OS finalizadas. |
| Itens vendidos/consumidos | Soma das quantidades de peças e pneus. |
| Retornos pendentes | Pendências no período, separando vencidos e futuros. |

Os gráficos planejados são vendas por dia do período, formas de pagamento, faturamento por serviço/mecânico, produtos mais usados e comparação entre receita, custo e lucro. Os dados devem ser filtrados por `deleted_at IS NULL`, e relatórios grandes devem usar paginação ou agregação no banco, não carregar tudo no navegador.

**Critérios de aprovação:** agosto mostra somente agosto; ao trocar para setembro os números mudam corretamente; janeiro do ano seguinte começa vazio se não houver dados, sem apagar agosto; OS excluída não entra; gráficos batem com Relatórios e Caixa; telas móveis permanecem legíveis.

## Fase 6 — Testes locais e segunda auditoria

Será executado o build, lint, teste de migrations, testes de permissões, testes de estoque, teste financeiro transacional, teste de notificações, teste de backup, teste da câmera e comparação Dashboard/Relatórios. Também será revisado o diff para confirmar que nenhuma função aprovada foi removida.

## Fase 7 — Único deploy

Somente depois da aprovação da fase 6 será criado um commit consolidado e enviado ao GitHub para disparar um único deploy do Netlify. O Supabase deverá estar com as migrations correspondentes aplicadas antes da publicação do frontend.

## Fase 8 — Validação final

Após o deploy, serão testados gerente e mecânico em celular e computador. O checklist final deverá confirmar cadastro, permissões, OS, estoque, finalização, caixa, notificações, dashboard mensal, gráficos, backup e câmera. Qualquer falha interrompe a publicação de novas alterações até ser isolada.

## Decisão atual

A próxima ação recomendada é começar somente pela **Fase 1 — Segurança do banco e OS apagada**. Nenhuma alteração da Dashboard deve ser feita antes de fechar as policies e proteger os dados, porque os gráficos precisam consumir uma base confiável.
