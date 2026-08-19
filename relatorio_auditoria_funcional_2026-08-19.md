# Auditoria funcional do DK Pneus — 19/08/2026

## Escopo e separação de versões

A inspeção funcional está sendo feita no endereço publicado apenas como referência. A versão local em `/home/ubuntu/publish_dk` continua sendo a única versão autorizada para correções; nenhum dado de produção será criado, editado ou excluído sem confirmação explícita antes da operação.

## Estado inicial observado

A sessão autenticada abriu como gerente. A Dashboard publicada carregou e exibiu a navegação completa: Dashboard, Carros no pátio, Histórico, Notificações, Caixa, Peças e pneus, Retornos, Relatórios, Mecânicos, Configurações e Backup. A tela inicial mostrou pátio vazio, faturamento do dia zerado, nenhum retorno pendente, estoque baixo zerado e nenhuma OS aguardando conferência.

O teste funcional seguirá por leitura e navegação primeiro. Operações destrutivas ou que criem dados serão isoladas e só executadas com dados explicitamente temporários e confirmação do usuário.

## Testes iniciais de navegação

A aba **Retornos** abriu rapidamente, exibiu filtros de busca, status e vencidos, e informou zero registros sem erro visível.

A aba **Peças e pneus** abriu com dois itens de teste, busca por nome/código/marca/medida, filtros Todos/Peças/Pneus/Favoritos, edição, exclusão com confirmação e botão de câmera. A tela carregou os dados e não apresentou erro visível. A exclusão ainda não foi executada nesta etapa para preservar os dados publicados.

## Histórico e Caixa

A aba **Histórico** abriu sem erro visível, mostrou busca por placa/cliente/CPF/telefone/OS e filtros Todos/Na garantia/Fora da garantia. Não havia OS finalizada para testar reabertura ou exclusão.

A aba **Caixa** abriu sem erro visível e mostrou corretamente o estado sem caixa aberto, campo de valor inicial e botão Abrir caixa. A abertura não foi executada, pois criaria um movimento real no ambiente publicado.

## Notificações e Relatórios

A aba **Notificações** abriu com os controles de ativação de alerta no celular, filtros Não lidas/Lidas/Todas, Este mês/Histórico e formulário para nova mensagem ao mecânico. Não havia mensagens no filtro atual. Nenhuma mensagem foi enviada.

A aba **Relatórios** abriu com filtros de início/fim e botão Este mês. Os cards e tabelas renderizaram com valores zerados e mensagens vazias coerentes com a base de teste. Não foi observado erro visual.

## Mecânicos

A aba **Mecânicos** abriu com dois registros e controles de ativação/exclusão. O botão Novo mecânico abriu o formulário com Nome, E-mail, Telefone e Senha temporária, e o botão de salvar ficou desabilitado enquanto os campos estavam vazios. O cadastro não foi enviado para não criar uma conta no ambiente publicado.

## Configurações e Backup

A aba **Configurações** abriu com dados preenchidos, horário de fechamento, antecedência, garantia padrão, botão Salvar e botão de ativação das notificações. Nenhuma alteração foi salva.

A aba **Backup** abriu e mostrou o botão de exportação. A versão publicada ainda exibe a lista antiga de tabelas, sem os acréscimos de movimentos de estoque, perfis, papéis e contatos de retorno que já estão preparados apenas na versão local. Isso confirma que a produção e a versão local estão diferentes, como esperado.

## Câmera de código de barras — reprodução

Na versão publicada, a aba Peças abriu normalmente. Ao clicar em Ler pela câmera, o modal abriu, porém a área de vídeo permaneceu completamente preta e não apareceu uma mensagem de erro nem um botão de tentativa novamente. Isso reproduz o problema relatado pelo usuário e confirma que a versão publicada ainda contém o componente antigo; a correção robusta está somente no código local.

## Teste funcional controlado — OS temporária

Foi criada a OS temporária #1 com placa TST2026 e cliente TESTE-AUDITORIA-2026. O cadastro abriu corretamente, validou CPF e criou a OS no pátio.

Foi adicionado o serviço Troca de óleo, atribuído ao mecânico Teste Mecanico Validado e vinculado o item Mann-Filter. A versão publicada recalculou corretamente o preço ao alterar quantidade de 1 para 2: R$ 70,00 passou para R$ 140,00. Esse comportamento já foi corrigido também no código local para permanecer protegido quando a versão nova for publicada.

O status percorreu Aguardando → Em execução → Concluído, registrando início e fim. A finalização aceitou pagamento em dinheiro, registrou caixa, baixou estoque de Mann-Filter de 2 para 0 e exibiu a pergunta de notinha. A reabertura removeu pagamento/caixa, devolveu o estoque para 2 e retornou a OS ao pátio. A segunda finalização funcionou e a exclusão no Histórico pediu confirmação, removeu a OS e deixou o Histórico vazio. O estoque permaneceu em 2 após a exclusão, sem estorno duplicado.

## Falhas observadas na versão publicada

A câmera de código de barras abre o modal, mas o vídeo permanece preto e não mostra diagnóstico ao usuário; não houve erro no console. A versão publicada é anterior à correção local do ciclo de vida/permissões/fallback da câmera.

A versão publicada também ainda contém o formulário antigo de quantidade; durante o teste ela recalculou R$ 140,00 após o blur, mas o código local foi reforçado para enviar quantidade e preço da peça juntos, evitando depender somente do trigger do banco.

## Teste de mecânico temporário

Foi criado o mecânico Mecanico Auditoria Temporario 2026 com e-mail exclusivo. O cadastro foi concluído e a lista exibiu o novo registro. A remoção abriu confirmação, desativou o mecânico e a lista voltou apenas para Mákson e Teste Mecanico Validado. O login não foi excluído, conforme a regra atual de desativação lógica.

## Auditoria de desempenho e código

O carregamento global foi revisado. O alerta de fechamento fazia consultas ao Supabase mesmo quando a permissão de notificações do navegador não estava concedida; isso foi corrigido localmente para não consultar nem iniciar checagem quando a permissão não é granted, retomando a checagem somente após o evento de concessão.

O bundle mostrou ZXing separado principalmente no chunk da aba Peças e Recharts no chunk da Dashboard; não estão sendo carregados como consulta de dados em todas as telas. A maior causa comprovada de consulta desnecessária foi o hook global de alertas, já corrigido localmente.

Foi executado `npm run build` e `git diff --check` após as correções: ambos passaram. O lint direcionado encontrou 305 problemas, sendo 304 de Prettier e 1 aviso, concentrados no padrão de formatação preexistente do arquivo grande; não foi aplicado `eslint --fix` para evitar alteração não cirúrgica.
