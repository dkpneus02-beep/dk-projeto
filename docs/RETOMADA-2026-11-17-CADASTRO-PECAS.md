# Retomada — cadastro de peças e publicação V.0.0.1

**Atualizado:** 18/11/2026, 16:27 (horário de Brasília)
**Objetivo imediato:** reconectar/verificar o Netlify e fechar a revisão local antes da decisão separada sobre push e publicação. A causa do erro visto na produção foi identificada; staging passou nos testes transacionais principais e produção segue sem alterações.

## Estado do repositório

- Diretório: `/home/ubuntu/dk-diagnostico-20261113`
- Branch: `fix/pecas-layout-desconto-atalho-20260930` (V.0.0.1)
- HEAD observado: `f08599c` — `Document staging migration transport limitation`
- Branch local aparecia **6 commits à frente** de `origin/fix/pecas-layout-desconto-atalho-20260930`; migration final tem uma correção local ainda não commitada, além desta nota de retomada.
- Não houve push ao GitHub nem deploy Netlify.
- O build local executado após a correção SQL e os testes no staging passou, com avisos não fatais de diretivas em dependências; `git diff --check` também passou. O `tsc` ainda tem 14 diagnósticos preexistentes em arquivos não relacionados. O parser PostgreSQL local aceitou a migration final corrigida com 51 statements, e a aplicação no staging compilou as funções.

## Bloqueio relatado pelo usuário

O usuário enviou a foto do erro ao editar peça: toast “Use uma operação de estoque autorizada para alterar saldo ou custo.” e `PATCH` de `pecas` retornando 400. A causa foi identificada como tentativa de alterar `estoque`/`preco_custo` diretamente, bloqueada pelo trigger de produção.

O print era de uma edição, não comprova falha de `INSERT` de uma peça nova. Não pedir nem repetir senha no chat.

## O que foi verificado em produção — somente leitura

- Projeto Supabase de produção: `fkkplzwefhjohpfjwcwn` (ativo/saudável na lista).
- A tabela `public.pecas` contém os campos usados pelo formulário local: `sku`, `nome`, `marca`, `tipo`, `categoria`, `estoque`, `estoque_minimo`, `preco_custo`, `margem`, `preco_venda`, campos de pneu, `aceita_desconto_pix`, `aplicacao`, `observacoes`, `deleted_at` e timestamps.
- Constraint observada na tabela `pecas`: somente chave primária em `id`; não apareceu constraint adicional que explique, sozinha, a falha de inserção.
- Política RLS observada: `pecas_gerente`, `ALL` para `authenticated`, com `has_role(auth.uid(), 'gerente')` em `USING` e `WITH CHECK`. Se a conta não for gerente, a inserção pode ser negada.
- Nenhuma gravação ou alteração foi feita em produção.

## Código local relacionado

Arquivo principal: `src/routes/pecas.tsx`, mutation do cadastro em torno das linhas 290–452.

Fluxo observado:
1. Valida referências, estoque/custo e SKU duplicado.
2. Insere/atualiza `pecas`; para item novo grava `estoque: 0` e `preco_custo`.
3. Se estoque inicial for maior que zero, chama a RPC `ajustar_estoque_com_lotes`.
4. Depois consulta e grava `peca_referencias`.
5. A tela só mostra `Item salvo` no sucesso da mutation; erros são mostrados via toast.

Na versão publicada observada, a tentativa de editar saldo/custo manda os campos diretamente no `PATCH`, e o trigger intencionalmente bloqueia a operação. A mutation local V.0.0.1 evita enviar esses campos no `UPDATE` e usa RPC autorizada de lotes para ajuste/cadastro inicial.

## Homologação Supabase — estado atualizado em 18/11/2026

Projeto gratuito, isolado e ativo: `dkautocenter-homologacao` (`cpumvmcxqpzgphvnkaug`). Não é produção.

O histórico read-only confirmou seis migrations registradas, nesta ordem:
1. `dk_v001_base_01_of_04` — versão `20261117194744`
2. `dk_v001_base_02_of_04` — versão `20261117195057`
3. `dk_v001_base_03_of_04` — versão `20261117195626`
4. `dk_v001_ajuste_estoque_rpc` — versão `20261118190458` (correção aditiva para incluir tabela de auditoria e RPC de ajuste por lotes que faltavam no fragmento 3)
5. `dk_v001_base_04_of_04` — versão `20261118190732`
6. `20261115190000_peca_rapida_pix_pagamento_pendente` — versão `20261118191400`

Houve uma primeira tentativa da migration final que falhou na compilação de `adicionar_peca_rapida_atendimento`: uma mensagem `RAISE EXCEPTION` continha `%` sem escape. O histórico e o schema foram consultados somente para confirmar rollback completo; a migration não havia sido registrada e nenhuma coluna nova permaneceu. A mensagem local foi corrigida para `0%%`/`100%%`, a migration final foi reaplicada com sucesso e consta no histórico acima.

Verificação read-only confirmou as colunas de desconto por peça, cadastro pendente, estado de pagamento e Pix; as RPCs de ajuste, peça rápida, conclusão do cadastro, finalização e confirmação de pagamento; e os triggers principais de estoque, cadastro pendente, pagamento, sincronização de total e imutabilidade pós-finalização. Contagens no staging: 0 OS, 0 serviços, 0 peças, 0 pagamentos, 0 orçamentos, 0 ajustes de estoque e 0 chaves idempotentes.

O usuário autorizou as migrations e, separadamente, autorizou a suíte de testes sintéticos somente no staging. A suíte principal passou em uma transação com rollback explícito; as duas identidades temporárias foram removidas após o teste.

Artefatos locais aprovados:
- Base schema-only: `/home/ubuntu/dk-staging-artifacts/HOMOLOGACAO-BASE-SCHEMA-ONLY-V0.0.1.sql`
- Fragmentos: `/home/ubuntu/dk-staging-artifacts/base_chunks/dk_v001_base_01_of_04.sql` até `dk_v001_base_04_of_04.sql`
- Manifesto: `/home/ubuntu/dk-staging-artifacts/base_chunks/LEIA-ME.md`
- Migration V.0.0.1: `supabase/migrations/20261115190000_peca_rapida_pix_pagamento_pendente.sql`

## Netlify / publicação

- Site identificado por leitura: `dkautocenterr`, site ID `9ff7c002-64c2-4b64-8eac-947511af62e2`; o deploy publicado consultado tinha origem upload/API e `commit_ref: null`.
- O conector Netlify aparece habilitado na configuração, mas a última chamada read-only retornou 401; a checagem atual indica OAuth `not_supported` e nenhum token armazenado. Verificar/reconectar antes de confirmar site/deploy ou operar publicação.
- Não houve escrita no Netlify. Não fazer deploy às cegas nem afirmar que o site publicado corresponde a um SHA Git.

## Próxima sequência recomendada

1. A suíte transacional principal passou: peça rápida idempotente; recusa de payload divergente; cadastro pendente com estoque/lote/auditoria; bloqueio de update direto de saldo/custo; sincronização de total por edição do mecânico sem alteração de desconto; desconto de 20%; finalização dividida em Pix/dinheiro; baixa FIFO/CMV; caixa sem lançamento antecipado, quitação com dois movimentos sem duplicidade; bloqueios de INSERT/UPDATE/DELETE em OS finalizada.
2. A suíte terminou em `ROLLBACK`. Limpeza posterior removeu usuário gerente e mecânico sintéticos; verificação final confirmou zero fixtures em Auth/perfis/papéis/mecânicos e zero OS, serviços, peças, pagamentos, caixas/movimentos, lotes/ajustes, movimentos de peça, CMV e chaves idempotentes. A primeira tentativa parou corretamente ao tentar ler a tabela privada de idempotência; nenhum grant foi alterado e a repetição passou sem acessar essa tabela.
3. Ainda faltam testes de concorrência/deadlock, estorno/reabertura/refinalização, retry após reload, UI visual, scanner, QR/recibo e impressão. O build após a correção `%` passou; a migration corrigida e esta documentação ainda não foram commitadas.
4. Reconectar/confirmar o conector Netlify (a última verificação registrada retornou 401), verificar o destino/site e o vínculo do deploy; sem isso, não é possível garantir publicação correta.
5. Obter autorização específica antes de push ao GitHub, migration em produção ou deploy Netlify. Produção deve receber a interface e as alterações de banco na ordem segura; os triggers de hardening não devem preceder a interface compatível.

## Limites a manter

- Continuar somente na branch V.0.0.1.
- Produção, GitHub e Netlify permanecem sem alterações até confirmação específica.
- Não aplicar migrations nem fazer deploy sem autorização explícita do usuário para a ação exata.
- Priorizar o erro real de cadastro de peças; não expandir escopo para a antiga versão Financeiro.


## Evidência enviada pelo usuário (17/11/2026, 17:06)

- Toast visível: **“Use uma operação de estoque autorizada para alterar saldo ou custo.”**
- Console do navegador mostra repetidos `PATCH` para `https://fkkplzwefhjohpfjwcwn.supabase.co/rest/v1/pecas?...` retornando `400 Bad Request`, além de erros de status Realtime. A requisição `PATCH` indica atualização de uma peça existente nessa tentativa; não é, por si só, evidência de falha em `INSERT` de peça nova.
- Trigger confirmado em produção: `pecas_bloquear_alteracao_direta_saldo`, `BEFORE INSERT OR UPDATE OF estoque, preco_custo`. A função `impedir_alteracao_direta_saldo_peca` bloqueia mudanças diretas de estoque/custo feitas como `anon`/`authenticated`, para obrigar uso de operações de estoque auditadas. A guarda parece intencional e não deve ser removida para “resolver” a tela.
- A branch remota `origin/main` inclui `estoque: p.estoque` e `preco_custo: p.preco_custo` no payload que reutiliza tanto no `UPDATE` quanto no `INSERT` de `pecas`. Logo, ao editar estoque/custo, essa versão aciona exatamente o trigger e recebe o 400.
- Na branch autorizada V.0.0.1 local, o payload de `UPDATE` não inclui `estoque` nem `preco_custo`; cadastro novo começa com `estoque: 0` e a quantidade inicial é gravada pela RPC `ajustar_estoque_com_lotes`. Esse fluxo respeita a proteção do banco. A branch local ainda não foi publicada.

## Netlify confirmado somente por leitura

- Site: `dkautocenterr`, site ID `9ff7c002-64c2-4b64-8eac-947511af62e2`.
- URL pública: `https://dkautocenterr.netlify.app`; admin: `https://app.netlify.com/projects/dkautocenterr`.
- Deploy atual consultado: `6ac8eb8d5c8a991410de507f`, estado `ready`, publicado em `2026-10-09T13:27:05Z`, `branch: main`, `deploy_source: api` / “Deploy triggered by upload”, `commit_ref: null`. Portanto, o deploy não aponta para um SHA Git verificável e não se deve afirmar que seu conteúdo é idêntico ao `origin/main`; o código remoto main, porém, tem a mesma chamada direta que explica o erro.
- Não houve ação de escrita na produção, no Netlify ou no GitHub.

## Diagnóstico prático e workaround

A falha mostrada não indica que o projeto Supabase “caiu”: é a proteção do banco recusando um `PATCH` que tenta mudar `estoque` ou `preco_custo` diretamente. O usuário confirmou que a interface publicada não tem uma ação separada de Entrada/Ajuste; não sugerir esse caminho nem desligar o trigger. A V.0.0.1 local usa RPC autorizada de lotes, e a homologação transacional dessa proteção passou.

A correção de frontend existe na V.0.0.1 local e as migrations foram testadas no staging. Não publicar ainda: falta reconexão/verificação do Netlify e autorização própria para push, migration de produção e deploy; também permanecem testes de concorrência e UI listados acima. O build final passou, mas a correção SQL e a documentação continuam sem commit.


## Correção da orientação após a confirmação do usuário (18/11/2026)

A sugestão anterior de usar “Entrada/Ajuste de estoque” na versão publicada **não é válida**: o usuário confirmou que não há essa opção na tela dele. Não voltar a instruí-lo a clicar em um controle que não está disponível. A branch `origin/main` contém um botão “Entrada rápida”, mas isso serve para adicionar quantidade, não para informar o saldo físico contado como novo alvo; além disso, o deploy público foi feito por upload e não tem SHA de origem, então não é seguro afirmar que a tela online corresponde exatamente a esse código.

Na V.0.0.1 local existe a ação separada “Ajustar estoque” na linha do item. Para peça existente, o formulário de edição mostra estoque atual e custo médio como somente leitura; a ação de ajuste permite informar o saldo físico final, motivo e custo quando houver acréscimo, chamando `ajustar_estoque_com_lotes`. Cadastro novo começa com saldo zero e registra quantidade inicial pela mesma RPC. A mutation de edição não envia `estoque` nem `preco_custo` diretamente.

Consulta read-only em produção confirmou que `ajustar_estoque_com_lotes` existe, é `SECURITY DEFINER`, pode ser executada por `authenticated` e exige papel gerente; `adicionar_entrada_estoque_com_custo` também existe e exige gerente. Portanto, não é necessário remover o trigger. A interface corrigida existe na V.0.0.1; a suíte transacional principal passou no staging, mas os testes de concorrência, UI, scanner e impressão ainda estão pendentes.

Retirar como orientação prática a frase anterior para usar “Entrada/Ajuste” na versão que está no ar: o usuário confirma que a interface publicada não fornece essa opção. Desde então, as migrations foram aplicadas somente ao projeto de homologação; produção, GitHub e Netlify continuam sem alterações.
