# Relatório de Auditoria — DK Auto Center

**Data da auditoria:** 19 de agosto de 2026  
**Escopo:** código frontend/server-side, migrations e policies do Supabase, triggers ativos, integridade dos dados, dependências e resposta básica do site público.  
**Modo:** somente leitura; nenhuma migration, correção de código ou alteração de produção foi aplicada durante esta auditoria.

## 1. Resumo executivo

O sistema está operacional e o build local passou. Entretanto, foram identificados **dois achados críticos de segurança no banco**, **um risco crítico de integridade financeira**, **inconsistências históricas que precisam ser tratadas com cuidado** e alguns problemas médios de desempenho, backup e notificações.

O ponto mais urgente é que policies RLS antigas e permissivas continuam ativas. Em especial, qualquer usuário autenticado pode atualizar qualquer OS pela API direta, e existe uma policy antiga que libera `INSERT`, `UPDATE` e `DELETE` na tabela `mecanicos` para qualquer usuário autenticado. O frontend esconde as telas, mas isso não substitui a proteção do banco.

O segundo ponto urgente é a finalização financeira da OS. A tela grava a OS como finalizada, depois grava pagamentos, depois caixa e depois retorno em chamadas separadas. Se uma etapa falhar, pode haver OS finalizada com estoque baixado, mas pagamento ou lançamento de caixa incompleto.

> **Recomendação:** não migrar, não apagar dados e não fazer deploy ainda. A primeira correção deve fechar as policies RLS antigas e depois transformar a finalização em uma operação transacional no banco.

## 2. Resultado das validações técnicas

| Verificação | Resultado | Interpretação |
|---|---:|---|
| `npm run build` | Passou | O pacote continua compilável. |
| `npm audit --omit=dev` | 0 vulnerabilidades | Não foram encontradas vulnerabilidades conhecidas nas dependências de produção. |
| `npx eslint src` | 1.228 problemas | 1.219 erros e 9 avisos, principalmente formatação Prettier. Não executei correção automática. |
| Rotas públicas testadas por HTTP | HTTP 200 | O site público responde nas rotas principais; isso não substitui o teste autenticado. |
| Tamanho do banco | Baixo | `audit_eventos` é a maior tabela, com aproximadamente 608 kB. |
| Eventos de auditoria | 407 | Eventos entre 18 e 19 de agosto de 2026; ainda não há pressão de espaço, mas não foi observada retenção automática. |

O lint não indica necessariamente falha funcional, mas revela dívida técnica importante. O comando configurado como `npm run lint` também ficou preso ao percorrer artefatos gerados pelo build; a validação útil foi executada diretamente sobre `src`.

## 3. Achados críticos de segurança

### 3.1. Qualquer usuário autenticado pode atualizar qualquer OS

A policy ativa `atendimentos_update` está configurada com `USING true` e `WITH CHECK true` para a role `authenticated`. Ela foi criada na migration `20260815120000_regras_negocio_roles_retorno.sql`.

A trigger `check_atendimento_edicao_restrita` bloqueia alguns campos financeiros e de garantia quando o usuário é mecânico, mas não confirma que o atendimento pertence ao mecânico que está fazendo a alteração. Pela API direta, um mecânico pode tentar atualizar campos permitidos de uma OS que não criou e que não possui serviço atribuído a ele.

**Classificação:** crítico.  
**Impacto:** quebra da separação entre mecânicos e possibilidade de adulteração de dados operacionais por API direta.  
**Correção recomendada:** substituir a policy por uma regra baseada em `can_view_atendimento(id)` e reforçar no trigger que o mecânico só altera a própria OS ou os campos estritamente permitidos do fluxo dele.

### 3.2. A tabela de mecânicos ainda possui uma policy antiga de acesso total

A policy ativa `Permitir acesso total para usuarios autenticados` está configurada para `FOR ALL`, com `USING true` e `WITH CHECK true`. Ela foi criada originalmente pela migration `20260813191728_8209456b-b4d7-45e1-946b-b4adea90de4d.sql`.

Existem policies novas que exigem a role gerente, mas as policies permissive do PostgreSQL são combinadas de forma que uma policy permissiva antiga pode abrir novamente a operação. Portanto, esconder a rota para o mecânico não é suficiente.

**Classificação:** crítico.  
**Impacto:** um usuário autenticado poderia inserir, alterar ou excluir registros da tabela `mecanicos` usando a API direta.  
**Correção recomendada:** remover a policy antiga e manter somente `SELECT` para o que for necessário e escrita exclusiva para gerente, com teste direto de RLS antes do deploy.

### 3.3. OS apagada pode continuar acessível por rota direta

`src/routes/atendimento.$id.tsx` busca a OS pelo ID e seus serviços/pagamentos sem filtro explícito `deleted_at IS NULL`. A função `can_view_atendimento()` também não verifica `deleted_at`; ela decide pelo papel, pelo criador ou pelo serviço atribuído.

As telas de listagem filtram OS apagadas, mas isso não garante que uma URL direta de uma OS apagada fique invisível.

**Classificação:** alto, podendo ser crítico dependendo do papel.  
**Correção recomendada:** acrescentar a condição de OS não excluída na função de visibilidade e na consulta da rota, preservando uma rota administrativa separada somente se a restauração for realmente necessária.

## 4. Achado crítico de integridade financeira

A finalização da OS em `src/routes/atendimento.$id.tsx` ocorre em etapas independentes:

1. Atualiza a OS para `finalizado`.
2. Insere os pagamentos.
3. Procura uma sessão de caixa aberta e insere os movimentos.
4. Opcionalmente cria o retorno.

O trigger de finalização também pode baixar peças do estoque. Como não existe uma RPC única envolvendo todas as etapas, uma falha depois da primeira chamada pode deixar estado parcial: OS finalizada, estoque consumido e pagamento ou caixa ausente.

**Classificação:** crítico.  
**Correção recomendada:** criar uma função RPC transacional para validar gerente, calcular total, baixar peças, inserir pagamentos, lançar caixa, criar retorno e finalizar a OS no mesmo `BEGIN/COMMIT`. A tela deve chamar essa RPC em vez de executar várias mutações separadas.

## 5. Integridade dos dados atuais

A consulta somente leitura encontrou o seguinte:

| Verificação | Quantidade | Observação |
|---|---:|---|
| Serviços sem OS pai | 0 | Não há órfãos desse tipo. |
| Serviços em OS logicamente excluída | 25 | Podem ser históricos legítimos, mas precisam continuar invisíveis junto com a OS. |
| Pagamentos sem OS pai | 0 | Não foram encontrados pagamentos órfãos. |
| Notificações ligadas a OS excluída | 0 | Os guards de notificações estão funcionando para esse caso. |
| Serviços atribuídos a mecânico excluído | 1 | Precisa ser revisado para confirmar se é histórico ou referência que deve ser limpa. |

Os 25 serviços em OS excluídas não devem ser apagados automaticamente sem confirmar a política de histórico e estoque. O importante é impedir que eles apareçam em dashboard, notificações, relatórios, histórico operacional ou consultas de detalhe.

## 6. Notificações e realtime

O hook `useAlertas.ts` possui dois mecanismos diferentes. O canal Realtime invalida queries e emite avisos de eventos; paralelamente, existe um polling global executado pelo `AppShell` a cada 10 minutos.

O aviso de fechamento usa `Notification` com `tag` baseada no título e `renotify: true`. Isso pode reapresentar o mesmo alerta nativo repetidamente. A consulta também não filtra explicitamente `atendimentos.deleted_at IS NULL`, dependendo das policies e do filtro posterior.

**Classificação:** médio, com impacto alto na experiência.  
**Correção recomendada:** decidir se o aviso automático deve existir; se continuar, limitar a uma notificação por OS e por dia, remover `renotify` para o mesmo evento e incluir explicitamente a condição da OS ativa.

## 7. Backup e recuperação

A tela `backup.tsx` exporta várias tabelas em JSON pelo navegador, com paginação de 500 registros. Ela não inclui os arquivos binários do bucket de vistoria, não inclui usuários do Auth e não cria uma cópia automática externa. Em bases maiores, carregar todas as tabelas em memória do navegador pode travar o dispositivo.

**Classificação:** alto para continuidade do negócio; médio para o uso atual.  
**Correção recomendada:** manter backup externo versionado, incluir manifesto das fotos e testar restauração em projeto separado. Não apagar dados antigos antes de validar a cópia. Para arquivamento, usar projeto histórico separado ou armazenamento privado externo.

## 8. Câmera e código de barras

A câmera da vistoria usa o seletor de arquivo/captura do celular e funciona. A câmera de Peças e pneus usa `@zxing/browser` e transmissão de vídeo ao vivo. São APIs diferentes; por isso uma funcionar não prova que a outra esteja correta.

O componente atual abre a câmera, mas possui tratamento genérico de erro e não oferece fallback para fotografia do código ou seleção de imagem. O bundle de `@zxing/browser` aparece com aproximadamente 1 MB antes da compressão, o que pode contribuir para carregamento lento em celular.

**Classificação:** médio.  
**Correção recomendada:** adicionar diagnóstico específico de permissão, câmera ocupada e navegador incompatível; considerar leitura de imagem/foto como fallback e carregamento sob demanda do leitor.

## 9. Desempenho e limites de consulta

Foram encontrados limites fixos em algumas áreas: histórico com limite de 500 OS, relatórios com até 500 OS, até 1.000 serviços e backup com leitura de todas as tabelas. Para o tamanho atual isso não parece estourar, mas pode causar dados incompletos quando a oficina crescer.

O Realtime usa um canal único sem filtros de tabela e invalida várias queries a cada evento. A arquitetura é válida, mas precisa de medição e debounce se o volume de eventos aumentar.

**Classificação:** médio.  
**Correção recomendada:** paginação real no histórico e relatórios, contagens server-side, limites visíveis ao usuário e invalidação seletiva com debounce.

## 10. Auditoria e ocupação do banco

A tabela `audit_eventos` é atualmente a maior tabela do banco, com aproximadamente 608 kB e 407 eventos. O volume ainda é pequeno, mas não foi encontrada uma rotina de retenção automática. Se o usuário decidir não manter auditoria por muito tempo, deve ser criada uma política explícita, por exemplo retenção de 90 ou 180 dias, sem apagar registros financeiros necessários.

As fotos não aparecem como o maior consumo nas tabelas porque ficam no Storage. Migrar fotos para ImgBB pode liberar Storage, mas introduz dependência externa, risco de indisponibilidade, privacidade e necessidade de preservar links. A chave da API nunca deve ser exposta no frontend.

## 11. Ordem recomendada de correção

| Ordem | Trabalho | Motivo |
|---:|---|---|
| 1 | Remover policies RLS permissivas antigas de mecânicos e corrigir `atendimentos_update` | Fecha a maior brecha de autorização. |
| 2 | Corrigir visibilidade de OS apagada e revisar referências históricas | Garante que exclusão lógica seja respeitada em toda a aplicação. |
| 3 | Criar RPC transacional de finalização | Protege caixa, pagamentos, estoque e garantia contra estados parciais. |
| 4 | Revisar o mecânico atribuído a OS excluída | Resolve a inconsistência encontrada sem apagar histórico automaticamente. |
| 5 | Corrigir repetição de alertas e filtros de OS ativa | Remove a notificação infinita e reduz ruído. |
| 6 | Melhorar backup e arquivamento | Protege garantias futuras e evita perda de fotos/dados. |
| 7 | Corrigir câmera de código e bundle | Melhora a operação no celular sem mexer na câmera da vistoria. |
| 8 | Corrigir lint, paginação e carregamento | Reduz dívida técnica e melhora manutenção/desempenho. |

## Conclusão

O sistema não precisa ser migrado para Firebase para resolver os problemas encontrados. O Supabase atual está respondendo, o build passa e não há vulnerabilidades conhecidas nas dependências de produção. Os principais riscos são de **policies antigas não removidas**, **finalização não transacional**, **acesso potencial a OS apagada por rota direta** e **backup incompleto**.

A auditoria recomenda uma sequência cirúrgica começando pelo banco e pelas transações financeiras. Nenhuma correção deve ser publicada junto com outra sem teste de regressão. O arquivo local `audit_findings_working.md` contém as notas de trabalho; ele não deve ser commitado junto com o sistema.
