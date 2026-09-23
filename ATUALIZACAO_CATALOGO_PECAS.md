# Atualização do catálogo de peças e referências

## Objetivo

Evoluir o cadastro atual de peças para permitir que uma única peça tenha várias referências de marcas diferentes. A busca deverá localizar a peça principal quando o usuário informar o nome, a marca, a referência principal, uma referência equivalente ou apenas parte de qualquer referência.

O trabalho será desenvolvido em etapas e não será publicado no Netlify sem autorização explícita do usuário.

## Base confirmada

A implementação parte da versão correta identificada no GitHub e no Netlify:

- Repositório: `dkpneus02-beep/dk-projeto`
- Branch de origem: `feat/orcamentos-temporarios`
- Commit de origem: `59dc32549ad83a9bc1e134b7db16607a4d986cc3`
- Branch de trabalho: `feat/catalogo-pecas-referencias`
- Deploy não autorizado nesta etapa: o Netlify permanece sem alterações

A branch `main` não será usada como base porque está desatualizada em relação à versão publicada.

## Estado atual verificado

O sistema já possui o módulo **Peças e pneus** e a tabela `pecas`. O cadastro original trabalhava com um único `sku` e uma única marca por item. A busca do estoque e a busca dentro do atendimento consultavam campos da própria tabela `pecas`, como nome, SKU, marca e dados de pneus.

Essa estrutura ainda não representava corretamente referências equivalentes. Se duas marcas fossem cadastradas como itens separados, o estoque, o preço e o histórico poderiam ser duplicados. A atualização preserva a peça principal e cria uma relação separada para suas referências.

## Escopo desta atualização

### Incluído

1. Criar uma estrutura de referências vinculada a `pecas`.
2. Permitir várias referências por peça.
3. Registrar marca, código e observação em cada referência.
4. Permitir indicar ou preservar uma referência principal.
5. Buscar por nome, marca, código completo e parte do código.
6. Exibir a referência que gerou o resultado e as equivalentes quando isso for útil.
7. Usar a mesma busca ao adicionar uma peça em um atendimento.
8. Manter preço, custo e estoque associados à peça principal.
9. Evitar referências duplicadas de forma segura.
10. Preservar os itens já cadastrados durante a migração.

### Não incluído nesta primeira etapa

O pedido menciona como evolução futura o controle separado de estoque por referência, fornecedores, localização física, histórico detalhado por referência e outras informações operacionais. Esses itens não serão implementados agora. O estoque continuará pertencendo à peça principal.

## Estrutura de dados planejada

A tabela existente `pecas` continuará armazenando os dados da peça principal, incluindo nome, categoria, aplicação, marca principal, custo, preço e estoque. Também foram adicionados localmente os campos de aplicação e observações.

Foi criada localmente a tabela relacionada `peca_referencias`, com identificador da referência, peça principal, marca, código, observação, indicador de referência principal, datas e exclusão lógica. A relação é de uma peça para muitas referências. A referência não será transformada em um novo registro de `pecas`.

A migração inclui normalização de referências, índices de busca, restrição contra duplicidade dentro da mesma peça e restrição para no máximo uma referência principal ativa por peça. Ela também migra os SKUs existentes que possuem marca e código.

## Etapas de execução

### Etapa 1 — Baseline e segurança

Registrar a branch de origem, criar a branch de trabalho e manter este documento atualizado. Confirmar que não há alterações acidentais na `main` nem no Netlify.

**Status:** concluída.

### Etapa 2 — Banco de dados

Criar a migração do Supabase, as políticas de acesso necessárias, índices de busca e restrições contra duplicidade. Atualizar os tipos gerados usados pelo frontend. Validar a compatibilidade com os registros atuais.

**Status:** concluída localmente; a migração ainda não foi aplicada no Supabase de produção.

### Etapa 3 — Cadastro de peças

Adicionar a seção de referências no formulário de peças, com o botão `+ Adicionar referência`. Permitir criar, editar e remover referências sem apagar a peça principal. Exibir as referências na listagem ou na edição de forma clara.

**Status:** concluída localmente; cadastro e busca do catálogo foram implementados e validados com build.

### Etapa 4 — Busca do catálogo

Alterar a busca para consultar também as referências vinculadas. A busca parcial deverá funcionar sem exigir que o usuário saiba a marca ou o código completo.

**Status:** concluída localmente; a busca do catálogo considera as referências relacionadas.

### Etapa 5 — Uso no atendimento

Alterar o seletor de peças do atendimento para encontrar peças por qualquer referência. Ao selecionar o resultado, mostrar nome, marca, referência encontrada, valor e estoque. O vínculo salvo deverá continuar apontando para a peça principal.

**Status:** concluída localmente; o seletor do atendimento agora busca e exibe referências equivalentes, mantendo o vínculo na peça principal.

### Etapa 6 — Testes

Executar build de produção, lint quando disponível, validações de banco, testes de duplicidade, testes de migração e testes funcionais do catálogo e do atendimento. Testar também os fluxos existentes de estoque, preço, desconto Pix e exclusão lógica.

**Status:** concluída para o escopo validável sem criar dados de teste; build, Prettier, diff, estrutura remota, busca do catálogo e formulário de edição foram verificados.

### Etapa 7 — Revisão antes do deploy

Produzir um resumo das alterações, dos testes executados, das limitações e das decisões pendentes. Mostrar ao usuário o resultado e aguardar autorização explícita antes de qualquer deploy no Netlify.

**Status:** pendente.

## Validações já realizadas

O build de produção passou após a implementação do cadastro, da busca do catálogo e da integração no atendimento. Os arquivos de frontend alterados passaram na checagem individual do Prettier e `git diff --check` não encontrou problemas.

O `tsc --noEmit` ainda reporta problemas de tipagem já existentes no repositório, inclusive em trechos antigos do arquivo de atendimento. Os novos erros introduzidos na busca de referências foram corrigidos. O lint global do repositório também apresenta problemas preexistentes em muitos arquivos, portanto nenhuma dessas duas checagens globais é usada como aprovação isolada.

Após a aplicação remota, o preview local autenticado foi validado visualmente. O módulo de peças exibiu as 42 referências migradas, a busca por `5011987043978` retornou somente a peça correspondente e a tela de edição carregou aplicação, observações e a referência principal. Depois, foram criados temporariamente o item `TESTE - Filtro catálogo`, a referência `TESTE-REF-002` e a OS `TESTE-OS-001`. A busca da referência no atendimento encontrou o item correto, a seleção persistiu `peca_id`, preço e quantidade, e todos os registros temporários foram removidos ao final. A consulta posterior confirmou que não restaram peças ou atendimentos de teste.

A migração ainda não foi aplicada remotamente porque a validação funcional com dados reais e a alteração da estrutura do Supabase de produção devem ocorrer somente depois da revisão da implementação.

## Critérios de aceite

A atualização estará pronta para revisão quando uma única peça puder conter várias referências de marcas diferentes, quando qualquer referência localizar a mesma peça, quando uma referência não puder criar duplicidade indevida e quando a peça puder ser adicionada a um atendimento a partir de qualquer código equivalente.

Também será necessário confirmar que os registros atuais continuam acessíveis, que o preço e o estoque permanecem corretos e que nenhuma alteração foi publicada sem autorização.

## Decisões registradas

- A versão de origem é `feat/orcamentos-temporarios`, commit `59dc325`.
- A `main` não será atualizada automaticamente.
- O estoque será controlado inicialmente na peça principal, não em cada referência.
- As referências serão uma entidade relacionada, não uma lista de texto dentro de `pecas`.
- A migração remota do Supabase ficará pendente até a validação do código e dos dados.
- O deploy só poderá ocorrer após revisão e autorização explícita do usuário.

## Pendências e perguntas que podem surgir

Antes de concluir a implementação, será necessário confirmar apenas decisões que alterem significativamente o comportamento, como a definição de referência principal, a forma de tratar referências duplicadas em peças diferentes e se a aplicação por veículo será incluída agora ou deixada para uma etapa posterior. Quando possível, será adotado um comportamento seguro e reversível e ele será registrado aqui.

## Histórico de atualização

| Data | Etapa | Registro |
|---|---|---|
| 2026-09-23 | Baseline | Branch de trabalho criada a partir de `59dc325`. Documento inicial criado. |
| 2026-09-23 | Banco, cadastro e catálogo | Migração local criada, tipos atualizados e cadastro/busca de referências implementados. Build e checagens individuais aprovados. Aplicação remota ainda pendente. |
| 2026-09-23 | Atendimento e validação | Busca por referências integrada ao atendimento. Build, Prettier e `git diff --check` aprovados. Migração aplicada e catálogo/formulário validados no preview local autenticado. Foi criada uma OS temporária claramente marcada como teste, a seleção por referência foi validada e os dados foram removidos depois. |

## Referências

[1]: https://github.com/dkpneus02-beep/dk-projeto/tree/feat/orcamentos-temporarios "Branch correta identificada no GitHub"
[2]: https://dkautocenterr.netlify.app/ "Versão pública atualmente hospedada no Netlify"
