# Relatório de novas funções e prontidão para deploy

**Sistema:** DK Auto Center  
**Branch:** `feat/catalogo-pecas-referencias`  
**Base:** `feat/orcamentos-temporarios`  
**Data da verificação:** 23 de setembro de 2026

## Conclusão

A versão está **tecnicamente pronta para um deploy controlado**, aguardando apenas a autorização explícita do responsável para publicar no Netlify. O build final foi concluído com sucesso, a branch foi consolidada em commits locais e o Supabase recebeu as migrações necessárias para as funcionalidades implementadas.

Nenhum deploy foi realizado. A versão publicada no Netlify permanece inalterada.

Antes de publicar em produção, recomenda-se fazer uma conferência visual rápida com o usuário gerente usando o preview local. Essa conferência é recomendada para validar textos, permissões e fluxo operacional, mas não há erro de compilação pendente.

## 1. Catálogo de peças e referências

O cadastro de peças passou a aceitar várias referências de marcas para um mesmo item. Isso permite cadastrar, por exemplo, uma peça original e seus códigos equivalentes de fabricantes diferentes sem duplicar o item no estoque.

Cada referência pode indicar a marca, o código ou referência comercial, se é a principal e observações. O catálogo permite também registrar aplicação e observações gerais da peça.

A busca de peças na ordem de serviço consulta nome, SKU, marca, referência e características relevantes. A tela mostra as referências equivalentes durante a seleção do item, facilitando a identificação correta pelo mecânico ou gerente.

O histórico de peças continua preservado por exclusão lógica. O controle de acesso mantém o gerente com visão completa e limita as ações do mecânico conforme as regras existentes da ordem de serviço.

## 2. Financeiro e DRE

Foi criada a rota `/financeiro`, exclusiva para o gerente. O módulo permite selecionar uma competência mensal e acompanhar a operação financeira em uma visão única.

O gerente consegue cadastrar despesas fixas e variáveis com descrição, categoria, fornecedor, competência, vencimento, valor, parcelas, recorrência e observações. Os valores são tratados com precisão de centavos.

O parcelamento divide o valor total sem perda de arredondamento. Quando existe diferença de um centavo, ela fica explicitamente na última parcela. O total das parcelas permanece exatamente igual ao valor original.

A DRE apresenta receita bruta, descontos, receita líquida, gastos fixos, gastos variáveis e resultado operacional. O caixa é mostrado separadamente, evitando confundir lucro com dinheiro disponível.

## 3. Pagamento de despesas e Caixa

O pagamento de uma parcela exige gerente autenticado e Caixa aberto. A operação é transacional: registra a saída no Caixa, marca a parcela como paga, grava a forma de pagamento e atualiza o status da despesa.

Se não houver Caixa aberto ou se qualquer parte da operação falhar, a parcela não é baixada e a saída não fica registrada parcialmente.

O histórico de pagamentos preserva a data, o valor, a forma de pagamento e o vínculo com a despesa.

## 4. Recorrência mensal

Despesas recorrentes podem gerar automaticamente as ocorrências dos meses seguintes. A geração é idempotente: consultar o mesmo mês novamente não cria cópias adicionais.

A série recorrente preserva os valores das parcelas e desloca os vencimentos para a nova competência. O sistema impede alterações que poderiam gerar divergência em séries já utilizadas.

## 5. Edição, cancelamento, exclusão lógica e auditoria

Despesas ainda não pagas podem ser editadas conforme as regras do módulo. Despesas canceladas permanecem no histórico e deixam de compor os totais ativos.

A exclusão é lógica. O registro recebe `deleted_at` e deixa de aparecer na visão operacional, mas não é apagado fisicamente. Despesas pagas ou com parcela paga são protegidas contra alterações que comprometeriam a auditoria.

## 6. Alertas financeiros

O Financeiro atualiza parcelas vencidas e cria alertas internos para o gerente. A tela mostra contas atrasadas e contas com vencimento nos próximos três dias.

As notificações usam chave de deduplicação por parcela e tipo de alerta. Executar a rotina novamente não cria notificações duplicadas.

## 7. CMV e custo histórico

Foi criado o livro-razão `atendimento_pecas_cmv`. Quando uma peça é consumida na finalização de uma OS, o sistema captura o `preco_custo` vigente naquele momento e grava o custo unitário, a quantidade e o custo total arredondado para R$ 0,01.

Alterações futuras no preço de custo do cadastro não alteram o CMV de uma OS já consumida. Quando uma OS é reaberta, o estoque é estornado e um lançamento inverso é incluído no livro-razão. O consumo original não é apagado.

O Financeiro exibe `CMV de peças` e `Resultado após CMV`. O resultado após CMV é calculado separadamente do resultado operacional para deixar explícita a diferença entre despesa operacional e custo direto de peças consumidas.

A implementação atual captura o custo cadastrado no momento do consumo. Custo médio ponderado por lotes ou PEPS/FIFO fica como evolução futura, caso a oficina passe a controlar entradas com custos diferentes por lote.

## 8. Validações realizadas

| Validação                    | Resultado                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run build`              | Aprovado na verificação final                                    |
| `git diff --check`           | Aprovado                                                         |
| Precisão de parcelas         | Conferida com valores de centavos e diferenças na última parcela |
| Pagamento integrado ao Caixa | Conferido com entrada temporária de R$ 0,01                      |
| Recorrência                  | Idempotência conferida sem duplicação                            |
| Alertas                      | Atrasados e próximos vencimentos conferidos sem duplicação       |
| CMV                          | 7 lançamentos conferidos, sem divergência de centavos            |
| RLS e acesso                 | Livro-razão de CMV restrito ao gerente                           |
| Deploy Netlify               | Não realizado                                                    |

Na conferência do CMV, foram encontrados 7 consumos, nenhuma divergência entre custo unitário, quantidade e custo total e nenhum tipo inválido. O total líquido conferido foi de R$ 2.588,72.

## 9. Situação da branch e publicação

As alterações estão consolidadas localmente na branch `feat/catalogo-pecas-referencias`. Os commits principais são:

- `1117f0c` — registro do CMV histórico de peças.
- `88390bc` — consolidação do catálogo de peças e do Cérebro Financeiro.

O build final foi aprovado. O diretório de trabalho ficou limpo após a consolidação dos arquivos. As migrações foram versionadas e as etapas financeiras necessárias foram aplicadas no projeto Supabase conectado.

## 10. Custo direto de mão de obra

Foi implementado o custo direto e histórico de mão de obra. O gerente configura um percentual entre 0% e 100% no Financeiro. Na finalização da OS, o sistema congela a base, o percentual, o mecânico e o custo calculado. Na reabertura, cria o estorno correspondente.

O DRE agora exibe `Custo de mão de obra` e `Resultado após custos diretos`. A configuração inicial é 0,00% para evitar qualquer alteração automática em OS existentes antes da definição do percentual real da oficina.

## 11. O que ainda não está incluído

Também não foi implementado o controle de estoque por lotes com custo médio ponderado ou PEPS/FIFO. O sistema já preserva o custo histórico de cada consumo, que é suficiente para a etapa atual.

Esses itens são evoluções futuras, não bloqueios técnicos para o deploy desta versão.

## 12. Próximo passo

O próximo passo é a autorização explícita para publicar esta branch no Netlify. Até essa autorização, nenhum comando de deploy será executado.

**Status final: pronto para deploy controlado, sem deploy realizado.**

## Referências

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"
[2]: https://supabase.com/docs/guides/database/postgres/transactions "Supabase PostgreSQL Transactions"
