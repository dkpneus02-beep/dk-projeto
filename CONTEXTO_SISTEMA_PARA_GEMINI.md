# Contexto do sistema DK Auto Center para o Gemini

## 1. Objetivo deste documento

Este documento apresenta o sistema DK Auto Center, sua arquitetura, seus módulos, as regras de negócio já existentes e o estado atual da primeira atualização realizada. Ele deve ser lido antes de propor ou implementar novas abas, funcionalidades ou alterações estruturais.

O objetivo é permitir que outra inteligência artificial compreenda o produto antes de sugerir código. O sistema é usado internamente por uma oficina mecânica. Portanto, alterações em estoque, atendimentos, pagamentos, permissões e banco de dados precisam preservar os dados existentes e ser testadas antes de qualquer publicação.

## 2. Resumo executivo

O DK Auto Center é um sistema web para gestão operacional de uma oficina. Ele reúne painel gerencial, pátio de veículos, ordens de serviço, serviços mecânicos, estoque de peças e pneus, orçamento, caixa, retornos de clientes, notificações, relatórios, mecânicos e configurações da oficina.

A versão correta do produto está baseada na branch `feat/orcamentos-temporarios` do repositório selecionado no GitHub. A branch `main` está desatualizada e não deve ser usada como base sem uma decisão explícita.

A primeira atualização em andamento adicionou um catálogo de referências equivalentes para peças. Uma peça principal pode ter várias referências de marcas diferentes, sem duplicar estoque, preço ou custo. A migração foi aplicada ao Supabase e o código foi validado no preview local autenticado.

**Não houve deploy no Netlify.** A implementação continua em uma branch de trabalho e ainda não foi commitada nem publicada.

## 3. Identificação do projeto

| Item | Informação |
|---|---|
| Repositório | `dkpneus02-beep/dk-projeto` |
| Branch correta de origem | `feat/orcamentos-temporarios` |
| Commit de origem | `59dc325` |
| Branch atual de trabalho | `feat/catalogo-pecas-referencias` |
| Supabase | Projeto `fkkplzwefhjohpfjwcwn` |
| Site publicado | `dkautocenterr.netlify.app` |
| Deploy | Não alterado nesta etapa |

A referência oficial do repositório e do site está no final deste documento.

## 4. Tecnologias e estrutura técnica

O projeto usa React 19 com TanStack Start, TanStack Router, TanStack Query, Vite, TypeScript, Tailwind CSS e componentes Radix UI. O backend de dados é o Supabase, acessado pelo cliente oficial `@supabase/supabase-js`. O deploy público atual é feito pelo Netlify.

Os principais comandos do projeto são:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run format
```

O build de produção é realizado com `npm run build`. Ele gera o output do TanStack/Nitro e copia o conteúdo público para `dist` no `postbuild`.

A configuração do Supabase fica em `src/integrations/supabase/client.ts`. As variáveis públicas esperadas são `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave pública pode ser usada no frontend; chaves secretas não devem ser colocadas no repositório ou no código do navegador.

Os tipos do banco usados pelo TypeScript ficam em `src/integrations/supabase/types.ts`. Quando uma tabela ou coluna muda, esses tipos precisam ser atualizados de forma compatível com o schema remoto.

As migrações ficam em `supabase/migrations`. Cada alteração estrutural deve ter uma migração versionada, idempotente quando possível e compatível com os registros já existentes.

## 5. Módulos e abas existentes

As rotas principais ficam em `src/routes`.

| Rota ou arquivo | Finalidade |
|---|---|
| `/` | Painel mensal com receita, custos, lucro, estoque baixo, pátio e retornos |
| `/auth` | Login da equipe |
| `/patio` | Controle dos veículos no pátio e vagas disponíveis |
| `/atendimento/$id` | Ordem de serviço, checklist, serviços, peças, mecânico e pagamento |
| `/historico` | Histórico de atendimentos |
| `/pecas` | Cadastro, edição, busca e estoque de peças e pneus |
| `/orcamentos` | Orçamentos temporários e conversão para atendimento |
| `/caixa` | Caixa diário e movimentos financeiros |
| `/mecanicos` | Cadastro e controle dos mecânicos |
| `/notificacoes-internas` | Comunicação interna da equipe |
| `/notificacoes` | Retornos de clientes e acompanhamento pós-serviço |
| `/relatorios` | Relatórios gerenciais |
| `/configuracoes` | Dados e preferências da oficina |
| `/backup` | Rotinas relacionadas ao backup |
| `/reset-password` | Redefinição de senha |

Também existem rotas de API, como `api.upload-imgbb.ts`, usadas para integração de upload de imagens.

## 6. Regras de negócio importantes

### 6.1 Usuários e permissões

O sistema diferencia principalmente os perfis **gerente** e **mecânico**. O gerente possui visão e edição operacional mais amplas. O mecânico pode trabalhar nos serviços atribuídos conforme as regras existentes, mas não deve receber automaticamente permissões de gerente.

Ao criar uma nova aba, é necessário decidir quais perfis podem visualizar, criar, editar ou excluir cada informação. Essa decisão deve ser implementada tanto no frontend quanto nas políticas do Supabase quando houver dados novos.

### 6.2 Atendimento e ordem de serviço

Um atendimento representa uma ordem de serviço. Ele possui veículo, cliente, quilometragem, serviços, peças, status, descontos, pagamentos, garantia e histórico.

Serviços podem ter mecânico responsável. O atendimento pode passar por estados operacionais e, ao ser finalizado, o sistema registra o consumo de peças e os movimentos de estoque conforme as regras atuais.

A seleção de uma peça no atendimento deve apontar para o registro principal de `pecas`. A referência digitada pelo usuário é apenas uma forma de localizar o item correto; ela não deve criar automaticamente uma nova peça ou duplicar estoque.

### 6.3 Peças, pneus e estoque

A tabela `pecas` representa o item principal do estoque. Ela armazena nome, SKU, marca, tipo, categoria, quantidade, estoque mínimo, custo, margem, preço de venda e dados específicos de pneus.

Preço, custo e estoque pertencem à peça principal. Uma nova referência equivalente não deve criar outro saldo de estoque.

O estoque possui regras próprias para entradas, consumo na finalização de uma OS e estorno na reabertura, que não podem ser substituídas por atualizações diretas sem verificar as funções e migrações já existentes.

### 6.4 Desconto Pix

O desconto Pix possui regras específicas e não deve ser aplicado indiscriminadamente. Existem regras para limitar o desconto a itens elegíveis, especialmente peças, e impedir que mão de obra, pneus ou itens não elegíveis sejam tratados incorretamente.

Qualquer nova tela de preço, orçamento ou pagamento deve reutilizar a lógica existente em vez de recalcular descontos de forma independente.

### 6.5 Orçamentos

Os orçamentos temporários armazenam cliente, veículo, itens, serviços, peças, totais, descontos e situação do orçamento. Alguns orçamentos podem ser convertidos em atendimento.

Uma nova aba de orçamento deve preservar a diferença entre orçamento e OS. Não se deve consumir estoque na simples criação de um orçamento; o consumo deve ocorrer no fluxo operacional previsto para a finalização do atendimento.

### 6.6 Caixa e pagamentos

O caixa registra sessões e movimentos financeiros. Os pagamentos de um atendimento precisam continuar associados à ordem correta e não devem ser duplicados ao editar ou reabrir telas.

Alterações em valores, descontos e formas de pagamento exigem teste de arredondamento e conferência do total final.

## 7. Primeira atualização: catálogo de referências equivalentes

A primeira atualização surgiu da necessidade de cadastrar várias referências de marcas diferentes para a mesma peça. Por exemplo, uma peça pode ter um código da marca A e outro código equivalente da marca B, mas o estoque continua sendo um único item.

A solução adotada foi criar a tabela `peca_referencias`, relacionada a `pecas` por `peca_id`. Cada referência possui marca, código, observação, indicação de referência principal, datas e exclusão lógica.

Também foram adicionados os campos `aplicacao` e `observacoes` em `pecas`.

A migração aplicada foi:

```text
20260923150000_catalogo_pecas_referencias.sql
```

A migração criou índices e uma função de normalização para que pontos, hífens, espaços e diferenças de caixa não impeçam a busca. Ela também migrou automaticamente os SKUs existentes que possuíam marca e código.

Após a aplicação, a verificação encontrou:

- 47 peças ativas.
- 42 referências ativas.
- 42 referências principais.
- Nenhuma referência duplicada dentro da mesma peça.
- RLS habilitado na nova tabela.
- Política autenticada `peca_referencias_all` criada.

No frontend, o cadastro de peças permite adicionar, editar e remover referências equivalentes. A lista de peças mostra a referência principal e a busca considera as referências relacionadas.

No atendimento, o seletor foi ampliado para localizar uma peça por nome, SKU, marca, medida, modelo, desenho ou referência equivalente. O valor salvo continua sendo `peca_id`.

## 8. Validações realizadas

O build de produção passou com `npm run build`. O Prettier passou nos arquivos principais alterados e `git diff --check` não encontrou espaços inválidos.

O `tsc --noEmit` ainda encontra problemas de tipagem preexistentes em partes antigas do repositório. Os novos erros de tipo introduzidos pela busca de referências foram corrigidos. Portanto, não se deve interpretar o erro global do TypeScript como falha exclusiva desta atualização.

No preview local autenticado, foram realizados os seguintes testes:

1. A página de peças carregou as referências migradas.
2. A busca pelo código `5011987043978` retornou a peça correspondente.
3. A tela de edição exibiu aplicação, observações e a referência principal.
4. O atendimento existente carregou corretamente seus dados e o produto de estoque já vinculado.
5. Depois, foi criado um item de teste, uma referência equivalente e uma OS temporária com os nomes `TESTE - Filtro catálogo`, `TESTE-REF-002` e `TESTE-OS-001`.
6. A busca por `TESTE-REF-002` dentro da OS encontrou a peça principal, e a seleção persistiu preço, quantidade e `peca_id` corretamente.
7. Todos os registros temporários foram removidos depois do teste. Uma consulta posterior confirmou zero peças e zero atendimentos com os identificadores de teste.

## 9. Estado atual do código

A branch de trabalho possui alterações ainda não commitadas nos seguintes arquivos:

```text
src/integrations/supabase/types.ts
src/routes/atendimento.$id.tsx
src/routes/pecas.tsx
ATUALIZACAO_CATALOGO_PECAS.md
supabase/migrations/20260923150000_catalogo_pecas_referencias.sql
```

A alteração em `src/routes/atendimento.$id.tsx` ficou maior porque o arquivo foi formatado durante a implementação. Antes de um commit, é recomendável revisar o diff para separar mudanças funcionais de mudanças apenas de formatação.

Nenhuma nova branch deve partir da `main` sem confirmar primeiro que ela contém as funcionalidades de orçamentos temporários, descontos e permissões presentes na versão publicada.

## 10. Como trabalhar nas próximas atualizações

Antes de implementar uma nova aba, deve-se explicar a ideia em linguagem simples e transformar o pedido em requisitos objetivos. É importante identificar quem usará a aba, quais dados ela exibirá, quais ações serão permitidas, quais regras de permissão existirão, quais tabelas serão necessárias e como a funcionalidade se relacionará com atendimento, estoque, orçamento ou caixa.

A implementação deve ser feita por etapas. Primeiro, registra-se o objetivo e o escopo. Depois, analisa-se o código existente. Em seguida, cria-se a migração do banco se necessário, atualizam-se os tipos, implementa-se o frontend, executa-se o build e realiza-se o teste funcional. O deploy só deve acontecer depois da revisão do usuário.

Não se deve aplicar uma migração remota, apagar dados, alterar permissões, publicar no Netlify ou modificar regras financeiras sem confirmar o impacto. Alterações reversíveis e isoladas são preferíveis.

Quando houver dúvida sobre uma regra de negócio, não invente uma regra silenciosamente. Registre a dúvida no documento de acompanhamento e faça uma pergunta objetiva ao usuário. Quando a decisão for de baixo risco e facilmente reversível, adote a solução mais simples e documente a escolha.

## 11. Recomendações para novas abas

Uma nova aba pode ser criada com segurança quando o projeto responder claramente às perguntas abaixo:

- Qual problema operacional a aba resolve?
- Quem pode acessar a aba?
- Quais dados são somente leitura?
- Quais dados podem ser criados, editados ou excluídos?
- Existe histórico ou auditoria obrigatória?
- A funcionalidade altera estoque, pagamento, orçamento ou atendimento?
- É necessária uma nova tabela ou os dados já existem?
- O que acontece quando um registro é excluído?
- Como a funcionalidade será testada sem corromper dados reais?
- O que deve ser exibido para gerente e para mecânico?

As novas abas devem seguir o padrão visual existente, reutilizar componentes e consultas já existentes quando possível e manter mensagens claras em português. Deve-se evitar duplicar a mesma regra em várias telas.

## 12. Instruções diretas para o Gemini

Ao receber este documento, considere que o projeto já está em produção e contém dados reais de uma oficina. Não trate a `main` como versão atual sem verificar a branch correta. Não faça deploy automático. Não aplique migrações remotas sem autorização explícita para aquela alteração.

Antes de sugerir código, leia os arquivos relacionados à funcionalidade. Antes de sugerir tabelas novas, confira se os dados já existem em `pecas`, `atendimentos`, `atendimento_servicos`, `orcamentos`, `pagamentos` ou nas tabelas de usuários.

Ao propor uma nova aba, descreva primeiro a finalidade, o fluxo principal, as permissões, o impacto no banco, os riscos e os testes. Só depois apresente a implementação.

Preserve estoque, preços, pagamentos, garantias e históricos existentes. Em caso de dúvida entre criar um novo registro e relacionar-se com um registro existente, verifique primeiro a regra de negócio e o modelo atual.

## 13. Pendências atuais

A primeira atualização está pronta para revisão. O código ainda precisa ser commitado e, em uma etapa posterior, publicado no Netlify somente com autorização do usuário.

A aplicação da migração no Supabase já foi autorizada e concluída. A seleção de uma referência em uma OS aberta também foi testada com dados temporários claramente marcados e esses dados foram removidos ao final.

A próxima etapa planejada é discutir as novas abas. As ideias devem ser enviadas uma por vez ou agrupadas por área, para que cada parte possa ser especificada, implementada e testada sem perder o controle do sistema.

## 14. Documentos relacionados

- [Documento de acompanhamento do catálogo de peças](ATUALIZACAO_CATALOGO_PECAS.md)
- [Migração do catálogo de referências](supabase/migrations/20260923150000_catalogo_pecas_referencias.sql)

## Referências

[1]: https://github.com/dkpneus02-beep/dk-projeto/tree/feat/orcamentos-temporarios "Branch correta do projeto no GitHub"
[2]: https://dkautocenterr.netlify.app/ "Versão pública atual do sistema no Netlify"
